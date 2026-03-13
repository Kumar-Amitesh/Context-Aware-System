"""
routes/video_routes.py

How it works:
  - Files under 18 MB → inline bytes (no Files API, no FAILED state)
  - Files over 18 MB  → Files API with ffmpeg conversion if available
  - ffmpeg is optional; without it large files use raw WebM

Your 480 KB recording will always hit the inline path and work fine.

Docker: to enable ffmpeg for large file conversion, add to Dockerfile:
    RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg
"""

import os
import json
import tempfile
import time
import re as _re
import subprocess
from flask import Blueprint, request, jsonify
from models import Chat
from services.auth_service import get_user_from_token
from llm import get_gemini_model
from logger import get_logger
import google.generativeai as genai

logger = get_logger("video_routes")
bp = Blueprint("video_routes", __name__)

# ─── Thresholds ──────────────────────────────────────────────────────────────
MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB hard limit
INLINE_THRESHOLD = 18  * 1024 * 1024  # <18 MB → inline (no Files API)
FFMPEG_TIMEOUT   = 120


# ─── ffmpeg helpers ───────────────────────────────────────────────────────────
def _has_ffmpeg():
    try:
        subprocess.run(["ffmpeg", "-version"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return True
    except Exception:
        return False


def _to_mp4(src, dst):
    """WebM → H.264/AAC MP4. Scale filter forces even dimensions (Gemini requirement)."""
    result = subprocess.run([
        "ffmpeg", "-y", "-i", src,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        "-max_muxing_queue_size", "1024",
        dst,
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=FFMPEG_TIMEOUT)
    if result.returncode != 0:
        logger.error("[video] ffmpeg stderr: %s",
                     result.stderr.decode(errors="replace")[-1000:])
    return result.returncode == 0


def _to_mp3(src, dst):
    """Extract audio → MP3 (native Gemini support)."""
    result = subprocess.run([
        "ffmpeg", "-y", "-i", src, "-vn",
        "-c:a", "libmp3lame", "-q:a", "4",
        dst,
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=FFMPEG_TIMEOUT)
    return result.returncode == 0


# ─── Prompt ───────────────────────────────────────────────────────────────────
def _eval_prompt(question, is_video):
    visual_note = (
        "This is a VIDEO submission — evaluate eye contact with the camera, "
        "posture, and professional appearance."
        if is_video else
        "This is AUDIO-only — set visual.eyeContactEngagement and "
        "visual.postureProfessionalism to null."
    )
    return f"""You are a professional interview coach evaluating a candidate's recorded answer.

Question asked: "{question}"

{visual_note}

Listen/watch carefully. Return ONLY valid JSON (no markdown, no preamble).

Scoring: 0–10 (10 = excellent).

{{
  "overallScore": 0.0,
  "question": "{question}",
  "transcript": "verbatim transcript",
  "content": {{
    "answerRelevance": 0,
    "completeness": 0,
    "structure": 0,
    "examplesSpecificity": 0
  }},
  "delivery": {{
    "clarity": 0,
    "confidencePresentation": 0,
    "pacing": 0,
    "fillerWords": 0
  }},
  "visual": {{
    "eyeContactEngagement": null,
    "postureProfessionalism": null
  }},
  "naturalness": {{
    "score": 0,
    "notes": "2–3 sentence coaching note"
  }},
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "suggestedBetterAnswer": "3–5 sentence example"
}}

Criteria:
- content.answerRelevance       how directly the answer addresses the question
- content.completeness          are all key points covered
- content.structure             clear opening, body, conclusion
- content.examplesSpecificity   concrete personal examples vs generic statements
- delivery.clarity              speech clarity and articulation
- delivery.confidencePresentation  sounds confident, not hesitant
- delivery.pacing               comfortable pace
- delivery.fillerWords          INVERSE of filler frequency (10=none, 0=constant um/uh/like)
- visual.eyeContactEngagement   video only — natural eye contact with camera
- visual.postureProfessionalism video only — upright posture, professional look
- naturalness.score             authentic/spontaneous vs scripted/memorised/generic
- overallScore                  content 40% + delivery 35% + visual 15%(video)/0%(audio) + naturalness 10%"""


# ─── Route ────────────────────────────────────────────────────────────────────
@bp.route("/api/chats/<chat_id>/video-question", methods=["POST"])
def evaluate_video_answer(chat_id):
    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    chat = Chat.query.get(chat_id)
    if not chat or chat.user_id != user.id:
        return jsonify({"error": "invalid chat"}), 403

    # Validate inputs
    media_file = request.files.get("media")
    question   = (request.form.get("question") or "").strip()
    media_type = (request.form.get("media_type") or "video").strip().lower()

    if not media_file:
        return jsonify({"error": "No media file uploaded."}), 400
    if not question:
        return jsonify({"error": "Question is required."}), 400
    if media_type not in ("video", "audio"):
        media_type = "video"

    media_file.seek(0, 2)
    raw_size = media_file.tell()
    media_file.seek(0)

    if raw_size > MAX_UPLOAD_BYTES:
        return jsonify({"error": "File too large (max 100 MB)."}), 413

    logger.info("[video] %s upload, size=%d bytes", media_type, raw_size)

    tmp_path  = None
    conv_path = None
    gfile     = None

    try:
        # ── 1. Save raw upload ──────────────────────────────────────────────
        orig_ext = os.path.splitext(media_file.filename or "rec.webm")[1] or ".webm"
        with tempfile.NamedTemporaryFile(suffix=orig_ext, delete=False) as f:
            media_file.save(f)
            tmp_path = f.name

        logger.info("[video] saved raw: %s", tmp_path)

        # ── 2. Decide upload path + mime ────────────────────────────────────
        upload_path = tmp_path
        upload_mime = ("audio/webm" if media_type == "audio" else "video/webm")

        # Try ffmpeg conversion only if file is too large for inline
        # (small files like your 480 KB recording skip this entirely)
        if raw_size >= INLINE_THRESHOLD and _has_ffmpeg():
            if media_type == "audio":
                conv_path = tmp_path + ".mp3"
                if _to_mp3(tmp_path, conv_path) and os.path.exists(conv_path):
                    upload_path = conv_path
                    upload_mime = "audio/mp3"
                    logger.info("[video] converted to mp3: %d bytes",
                                os.path.getsize(conv_path))
            else:
                conv_path = tmp_path + ".mp4"
                if _to_mp4(tmp_path, conv_path) and os.path.exists(conv_path):
                    upload_path = conv_path
                    upload_mime = "video/mp4"
                    logger.info("[video] converted to mp4: %d bytes",
                                os.path.getsize(conv_path))

        upload_size = os.path.getsize(upload_path)
        logger.info("[video] will send: %s %s (%d bytes)",
                    upload_path, upload_mime, upload_size)

        # ── 3. Build model + prompt ─────────────────────────────────────────
        model  = get_gemini_model()
        prompt = _eval_prompt(question, is_video=(media_type == "video"))

        # ── 4. Call Gemini ──────────────────────────────────────────────────
        if upload_size < INLINE_THRESHOLD:
            # ── INLINE PATH (skips Files API entirely) ──────────────────────
            # This is what your 480 KB file will always use.
            # Gemini's inline API accepts: video/mp4, video/webm, audio/mp3,
            # audio/wav, audio/ogg, audio/webm  — all fine.
            logger.info("[video] using inline bytes path")

            with open(upload_path, "rb") as f:
                media_bytes = f.read()

            # Use the new genai.Client() API (google-generativeai >= 0.8)
            # Falls back to legacy Part construction if needed
            try:
                import google.generativeai as genai_mod
                from google.generativeai import types as gtypes
                part = gtypes.Part.from_bytes(data=media_bytes, mime_type=upload_mime)
                response = model.generate_content([part, prompt])
            except AttributeError:
                # Older SDK: use inline_data dict
                logger.warning("[video] Part.from_bytes unavailable, using dict form")
                response = model.generate_content([
                    {"inline_data": {"mime_type": upload_mime, "data": media_bytes}},
                    prompt,
                ])

        else:
            # ── FILES API PATH (large files only) ───────────────────────────
            logger.info("[video] using Files API path")

            gfile = genai.upload_file(
                path=upload_path,
                mime_type=upload_mime,
                display_name=os.path.basename(upload_path),
            )
            logger.info("[video] uploaded: name=%s state=%s",
                        gfile.name, gfile.state.name)

            waited = 0
            while gfile.state.name == "PROCESSING" and waited < 120:
                time.sleep(3)
                waited += 3
                gfile = genai.get_file(gfile.name)
                logger.info("[video] polling state=%s waited=%ds",
                            gfile.state.name, waited)

            if gfile.state.name != "ACTIVE":
                logger.error("[video] file never became ACTIVE: state=%s",
                             gfile.state.name)
                return jsonify({
                    "error": "Could not process media. Try a shorter clip or audio-only mode."
                }), 500

            response = model.generate_content([gfile, prompt])

        # ── 5. Parse response ───────────────────────────────────────────────
        raw_text = getattr(response, "text", None) or ""
        logger.info("[video] response: %d chars", len(raw_text))

        clean = _re.sub(r"```json|```", "", raw_text, flags=_re.IGNORECASE).strip()
        match = _re.search(r"\{.*\}", clean, _re.DOTALL)

        feedback = {}
        if match:
            try:
                feedback = json.loads(match.group())
            except json.JSONDecodeError as e:
                logger.error("[video] JSON parse error: %s | text: %s", e, raw_text[:300])

        if not feedback:
            return jsonify({"error": "AI returned an invalid response. Please try again."}), 500

        # ── 6. Sanitise scores ──────────────────────────────────────────────
        def clamp(v):
            try:
                return round(max(0.0, min(10.0, float(v))), 1)
            except Exception:
                return None

        for section in ("content", "delivery"):
            seg = feedback.get(section) or {}
            feedback[section] = {k: clamp(v) for k, v in seg.items()}

        if media_type == "audio":
            feedback["visual"] = {
                "eyeContactEngagement": None,
                "postureProfessionalism": None,
            }
        elif feedback.get("visual"):
            feedback["visual"] = {
                k: (clamp(v) if v is not None else None)
                for k, v in feedback["visual"].items()
            }

        if feedback.get("naturalness"):
            feedback["naturalness"]["score"] = clamp(
                feedback["naturalness"].get("score")
            )
        if feedback.get("overallScore") is not None:
            feedback["overallScore"] = clamp(feedback["overallScore"])

        logger.info("[video] success, overallScore=%s", feedback.get("overallScore"))
        return jsonify({"feedback": feedback})

    except Exception as exc:
        logger.exception("[video] error: %s", exc)
        return jsonify({"error": f"Evaluation failed: {str(exc)}"}), 500

    finally:
        for path in (tmp_path, conv_path):
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass
        if gfile:
            try:
                genai.delete_file(gfile.name)
            except Exception:
                pass



















# """
# routes/video_routes.py

# New blueprint — zero changes to any existing file.
# Register in app.py:  from routes import ... video_bp
#                       app.register_blueprint(video_bp)
# Register in routes/__init__.py: from .video_routes import bp as video_bp

# Requirements (add to requirements.txt if not present):
#   google-generativeai>=0.5.0   (already used by gemini.py)

# How it works:
#   1. Frontend sends multipart/form-data with:
#        - media:      the audio/video blob
#        - question:   the interview question string
#        - media_type: 'video' | 'audio'
#   2. We save the file temporarily, upload to Gemini Files API,
#      then call gemini with the file URI + evaluation prompt.
#   3. Return structured JSON feedback.
#   4. Clean up temp file.
# """

# import os
# import json
# import tempfile
# import time
# from flask import Blueprint, request, jsonify, current_app
# from models import Chat
# from services.auth_service import get_user_from_token
# from llm import call_gemini, get_gemini_model
# from logger import get_logger
# import google.generativeai as genai
# import subprocess

# logger = get_logger("video_routes")
# bp = Blueprint("video_routes", __name__)

# # ── Mime type helpers ────────────────────────────────────────────────────────
# _MIME_MAP = {
#     ".webm":  "video/webm",
#     ".mp4":   "video/mp4",
#     ".mov":   "video/quicktime",
#     ".ogg":   "audio/ogg",
#     ".wav":   "audio/wav",
#     ".mp3":   "audio/mpeg",
# }

# def _guess_mime(filename: str, media_type: str) -> str:
#     ext = os.path.splitext(filename)[1].lower()
#     if ext in _MIME_MAP:
#         return _MIME_MAP[ext]
#     # return "audio/webm" if media_type == "audio" else "video/webm"
#     if media_type == "audio":
#         return "audio/webm"
#     else:
#         return "video/webm; codecs=vp8,opus"


# # ── Evaluation prompt ────────────────────────────────────────────────────────
# def _build_eval_prompt(question: str, media_type: str) -> str:
#     visual_note = (
#         "Since this is a VIDEO submission, also evaluate visual presence: "
#         "eye contact with the camera, posture, and overall professional appearance."
#         if media_type == "video"
#         else
#         "This is an AUDIO-only submission. Set visual.eyeContactEngagement and "
#         "visual.postureProfessionalism to null — do not fabricate visual scores."
#     )

#     return f"""
# You are a professional interview coach evaluating a candidate's recorded answer.

# Interview question asked: "{question}"

# {visual_note}

# Listen to / watch the recording carefully and provide structured coaching feedback.

# Scoring scale: 0-10 for all numeric scores (10 = excellent).

# Evaluation criteria:
# - content.answerRelevance:        How directly and accurately does the answer address the question?
# - content.completeness:           Are all key points covered?
# - content.structure:              Is there a clear opening, body, and conclusion?
# - content.examplesSpecificity:    Does the candidate use concrete, personal examples (not generic)?
# - delivery.clarity:               Is speech clear and easy to understand?
# - delivery.confidencePresentation: Does the candidate sound confident (not hesitant or anxious)?
# - delivery.pacing:                Is the pace comfortable — not too fast or too slow?
# - delivery.fillerWords:           Score inversely to filler word frequency (10 = no fillers, 0 = constant fillers like um/uh/so/like)
# - visual.eyeContactEngagement:    For video only — does the candidate look at the camera naturally?
# - visual.postureProfessionalism:  For video only — is posture upright and appearance professional?
# - naturalness.score:              Does the answer sound like a real, personal, conversational response?
#                                   Low score = sounds rehearsed, generic, script-like, or AI-generated.
#                                   High score = sounds authentic, personal, well-structured but spontaneous.
# - naturalness.notes:              2-3 sentence coaching note on naturalness (be specific and constructive).

# overallScore: weighted average you calculate (weight content 40%, delivery 35%, visual 15% if applicable else 0%, naturalness 10%).
# transcript:   Transcribe what the candidate said (accurate, verbatim).
# strengths:    Array of 2-4 specific things done well.
# improvements: Array of 2-4 specific, actionable coaching suggestions.
# suggestedBetterAnswer: A 3-5 sentence example of a stronger answer to this exact question.

# Return ONLY valid JSON — no markdown, no explanation, no preamble.

# {{
#   "overallScore": 0.0,
#   "question": "{question}",
#   "transcript": "...",
#   "content": {{
#     "answerRelevance": 0,
#     "completeness": 0,
#     "structure": 0,
#     "examplesSpecificity": 0
#   }},
#   "delivery": {{
#     "clarity": 0,
#     "confidencePresentation": 0,
#     "pacing": 0,
#     "fillerWords": 0
#   }},
#   "visual": {{
#     "eyeContactEngagement": null,
#     "postureProfessionalism": null
#   }},
#   "naturalness": {{
#     "score": 0,
#     "notes": "..."
#   }},
#   "strengths": [],
#   "improvements": [],
#   "suggestedBetterAnswer": "..."
# }}
# """


# # ── Route ────────────────────────────────────────────────────────────────────
# @bp.route("/api/chats/<chat_id>/video-question", methods=["POST"])
# def evaluate_video_answer(chat_id):
#     user = get_user_from_token()
#     if not user:
#         return jsonify({"error": "unauthorized"}), 401

#     chat = Chat.query.get(chat_id)
#     if not chat or chat.user_id != user.id:
#         return jsonify({"error": "invalid chat"}), 403

#     # ── Validate input ───────────────────────────────────────────────────────
#     media_file = request.files.get("media")
#     question   = (request.form.get("question") or "").strip()
#     media_type = (request.form.get("media_type") or "video").strip().lower()

#     if not media_file:
#         return jsonify({"error": "No media file uploaded."}), 400
#     if not question:
#         return jsonify({"error": "Question text is required."}), 400
#     if media_type not in ("video", "audio"):
#         media_type = "video"

#     # ── Size guard (100 MB) ──────────────────────────────────────────────────
#     media_file.seek(0, 2)
#     size_bytes = media_file.tell()
#     media_file.seek(0)
#     MAX_BYTES = 100 * 1024 * 1024
#     if size_bytes > MAX_BYTES:
#         return jsonify({"error": "File too large. Maximum is 100 MB."}), 413

#     # ── Save temp file ───────────────────────────────────────────────────────
#     original_name = media_file.filename or f"recording.webm"
#     mime_type     = _guess_mime(original_name, media_type)
#     ext           = os.path.splitext(original_name)[1] or ".webm"

#     tmp_path = None
#     gemini_file = None

#     try:
#         with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
#             media_file.save(tmp)
#             tmp_path = tmp.name

#         # Convert WebM → MP4 (Gemini prefers MP4)
#         mp4_path = tmp_path + ".mp4"

#         try:
#             subprocess.run(
#                 [
#                     "ffmpeg",
#                     "-y",
#                     "-i", tmp_path,
#                     "-c:v", "libx264",
#                     "-c:a", "aac",
#                     "-movflags", "+faststart",
#                     mp4_path,
#                 ],
#                 stdout=subprocess.DEVNULL,
#                 stderr=subprocess.DEVNULL,
#                 check=True,
#             )

#             upload_path = mp4_path
#             mime_type = "video/mp4"

#         except Exception:
#             # fallback if conversion fails
#             upload_path = tmp_path

#         logger.info(f"[video_routes] Saved temp file {tmp_path} ({size_bytes} bytes)")

#         # ── Upload to Gemini Files API ───────────────────────────────────────
#         logger.info("[video_routes] Uploading to Gemini Files API…")
#         # gemini_file = genai.upload_file(tmp_path, mime_type=mime_type)
#         gemini_file = genai.upload_file(
#             path=upload_path,
#             mime_type=mime_type,
#             display_name=os.path.basename(upload_path)
#         )

#         # Wait until the file is active (usually instant, sometimes a few seconds)
#         wait_secs = 0
#         while gemini_file.state.name == "PROCESSING" and wait_secs < 60:
#             time.sleep(2)
#             wait_secs += 2
#             gemini_file = genai.get_file(gemini_file.name)

#         if gemini_file.state.name != "ACTIVE":
#             # logger.error(f"[video_routes] File stuck in state: {gemini_file.state.name}")
#             logger.error(
#                 "[video_routes] File processing failed. state=%s reason=%s",
#                 gemini_file.state.name,
#                 getattr(gemini_file.state, "message", "unknown")
#             )
#             return jsonify({"error": "Media file could not be processed by AI. Please try again."}), 500

#         logger.info(f"[video_routes] Gemini file active: {gemini_file.uri}")

#         # ── Call Gemini with file + prompt ───────────────────────────────────
#         model  = get_gemini_model()
#         prompt = _build_eval_prompt(question, media_type)

#         response = model.generate_content([gemini_file, prompt])
#         raw_text = getattr(response, "text", None) or ""

#         logger.info(f"[video_routes] Gemini response length: {len(raw_text)}")

#         # ── Parse JSON ───────────────────────────────────────────────────────
#         import re as _re
#         # Strip markdown fences if present
#         clean = _re.sub(r"```json|```", "", raw_text, flags=_re.IGNORECASE).strip()
#         # Extract JSON object
#         obj_match = _re.search(r"\{.*\}", clean, _re.DOTALL)
#         feedback  = {}
#         if obj_match:
#             try:
#                 feedback = json.loads(obj_match.group())
#             except json.JSONDecodeError:
#                 logger.error("[video_routes] JSON parse failed, raw:\n%s", raw_text[:500])
#                 feedback = {}

#         if not feedback:
#             return jsonify({"error": "AI evaluation returned an invalid response. Please try again."}), 500

#         # ── Sanitise nulls for audio-only ────────────────────────────────────
#         if media_type == "audio":
#             visual = feedback.get("visual") or {}
#             visual["eyeContactEngagement"]  = None
#             visual["postureProfessionalism"] = None
#             feedback["visual"] = visual

#         # Clamp all numeric scores to 0–10
#         def clamp(v):
#             try:
#                 return round(max(0.0, min(10.0, float(v))), 1)
#             except Exception:
#                 return None

#         for section_key in ("content", "delivery"):
#             section = feedback.get(section_key) or {}
#             for k, v in section.items():
#                 section[k] = clamp(v)
#             feedback[section_key] = section

#         if feedback.get("visual"):
#             for k, v in feedback["visual"].items():
#                 feedback["visual"][k] = clamp(v) if v is not None else None

#         if feedback.get("naturalness"):
#             feedback["naturalness"]["score"] = clamp(feedback["naturalness"].get("score"))

#         if feedback.get("overallScore") is not None:
#             feedback["overallScore"] = clamp(feedback["overallScore"])

#         return jsonify({"feedback": feedback})

#     except Exception as exc:
#         logger.exception("[video_routes] Unexpected error: %s", exc)
#         return jsonify({"error": f"Evaluation failed: {str(exc)}"}), 500

#     finally:
#         # ── Cleanup temp file ────────────────────────────────────────────────
#         if tmp_path and os.path.exists(tmp_path):
#             try:
#                 os.remove(tmp_path)
#             except Exception:
#                 pass
#         # ── Delete from Gemini Files API (free storage, stay clean) ─────────
#         if gemini_file:
#             try:
#                 genai.delete_file(gemini_file.name)
#             except Exception:
#                 pass
        
#         if mp4_path and os.path.exists(mp4_path):
#             os.remove(mp4_path)