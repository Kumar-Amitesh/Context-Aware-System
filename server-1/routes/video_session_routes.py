"""
routes/video_session_routes.py

Security hardened:
- score is recalculated server-side from feedback map — frontend score is ignored
- session_type is derived from chat's stored examConfig — frontend value is ignored
- session ownership is validated against authenticated user

PATCH (jd_video):
  If the session already exists in DB and its type starts with "jd_",
  that type is preserved instead of being overwritten with "video_full".
  This is required for JD video sessions created by jd_session_routes.
"""

import json
from flask import Blueprint, request, jsonify
from models import Chat, PracticeSession
from extensions import db
from services.auth_service import get_user_from_token
from services.cache_service import invalidate_chat
from utils import generate_id
from logger import get_logger

logger = get_logger("video_session_routes")
bp = Blueprint("video_session_routes", __name__)

# JD session types that must not be overwritten by exam-derived session_type
_JD_SESSION_TYPES = {"jd_normal", "jd_voice", "jd_video"}


def _recalculate_score_from_feedback(feedback: dict) -> float:
    """
    Recalculate average overallScore from feedback map server-side.
    Clamps each score to 0-10. Returns 0.0 if no valid scores.
    """
    scores = []
    for qid, fb in (feedback or {}).items():
        if not isinstance(fb, dict):
            continue
        raw = fb.get("overallScore")
        if raw is not None:
            try:
                clamped = round(max(0.0, min(10.0, float(raw))), 1)
                scores.append(clamped)
            except (TypeError, ValueError):
                pass
    if not scores:
        return 0.0
    return round(sum(scores) / len(scores), 2)


def _sanitize_feedback(feedback: dict) -> dict:
    """
    Clamp all numeric scores in feedback to valid ranges.
    Prevents inflated scores from being stored.
    """
    def clamp(v):
        try:
            return round(max(0.0, min(10.0, float(v))), 1)
        except Exception:
            return None

    sanitized = {}
    for qid, fb in (feedback or {}).items():
        if not isinstance(fb, dict):
            continue
        clean_fb = dict(fb)

        if clean_fb.get("overallScore") is not None:
            clean_fb["overallScore"] = clamp(clean_fb["overallScore"])

        for section in ("content", "delivery"):
            seg = clean_fb.get(section)
            if isinstance(seg, dict):
                clean_fb[section] = {k: clamp(v) for k, v in seg.items()}

        if isinstance(clean_fb.get("naturalness"), dict):
            nat = clean_fb["naturalness"]
            if nat.get("score") is not None:
                nat["score"] = clamp(nat["score"])
            clean_fb["naturalness"] = nat

        sanitized[qid] = clean_fb

    return sanitized


@bp.route("/api/chats/<chat_id>/video-session/save", methods=["POST"])
def save_video_session(chat_id):
    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    chat = Chat.query.get(chat_id)
    if not chat or chat.user_id != user.id:
        return jsonify({"error": "invalid chat"}), 403

    data = request.get_json(silent=True) or {}

    session_id   = data.get("session_id") or generate_id()
    questions    = data.get("questions") or []
    answers      = data.get("answers")   or {}
    raw_feedback = data.get("feedback")  or {}

    # ── Validate session belongs to this user if it already exists ────────
    existing = PracticeSession.query.get(session_id)
    if existing:
        existing_chat = Chat.query.get(existing.chat_id)
        if not existing_chat or existing_chat.user_id != user.id:
            return jsonify({"error": "unauthorized"}), 403

    # ── Sanitize feedback scores (clamp to 0-10) ──────────────────────────
    feedback = _sanitize_feedback(raw_feedback)

    # ── Recalculate score server-side — ignore frontend score ─────────────
    score = _recalculate_score_from_feedback(feedback)

    # ── Derive session_type ───────────────────────────────────────────────
    # JD video sessions are pre-created by jd_session_routes with type="jd_video".
    # Preserve that type — do NOT overwrite with "video_full".
    if existing and existing.session_type in _JD_SESSION_TYPES:
        session_type = existing.session_type
        logger.info("[video_session] preserving JD session_type=%s", session_type)
    else:
        exam_cfg     = json.loads(chat.exam_config or "{}")
        session_mode = exam_cfg.get("sessionMode", "video")
        session_type = "video_full" if session_mode != "voice" else "voice_full"

    logger.info(
        "[video_session] saving chat=%s session=%s type=%s questions=%d score=%s",
        chat_id, session_id, session_type, len(questions), score
    )

    try:
        if existing:
            existing.questions     = json.dumps(questions)
            existing.answers       = json.dumps(answers)
            existing.feedback_json = json.dumps(feedback)
            existing.score         = score
            existing.session_type  = session_type
            db.session.commit()
            logger.info("[video_session] updated existing session %s", session_id)
        else:
            session = PracticeSession(
                id            = session_id,
                chat_id       = chat_id,
                session_type  = session_type,
                questions     = json.dumps(questions),
                answers       = json.dumps(answers),
                feedback_json = json.dumps(feedback),
                score         = score,
            )
            db.session.add(session)
            db.session.commit()
            logger.info("[video_session] created new session %s", session_id)

        invalidate_chat(chat_id, user.id)

        return jsonify({
            "sessionId": session_id,
            "score":     score,
            "saved":     True,
        })

    except Exception as exc:
        db.session.rollback()
        logger.exception("[video_session] DB error: %s", exc)
        return jsonify({"error": f"Failed to save session: {str(exc)}"}), 500





















# """
# routes/video_session_routes.py

# Security hardened:
# - score is recalculated server-side from feedback map — frontend score is ignored
# - session_type is derived from chat's stored examConfig — frontend value is ignored
# - session ownership is validated against authenticated user
# """

# import json
# from flask import Blueprint, request, jsonify
# from models import Chat, PracticeSession
# from extensions import db
# from services.auth_service import get_user_from_token
# from services.cache_service import invalidate_chat
# from utils import generate_id
# from logger import get_logger

# logger = get_logger("video_session_routes")
# bp = Blueprint("video_session_routes", __name__)


# def _recalculate_score_from_feedback(feedback: dict) -> float:
#     """
#     Recalculate average overallScore from feedback map server-side.
#     Clamps each score to 0-10. Returns 0.0 if no valid scores.
#     """
#     scores = []
#     for qid, fb in (feedback or {}).items():
#         if not isinstance(fb, dict):
#             continue
#         raw = fb.get("overallScore")
#         if raw is not None:
#             try:
#                 clamped = round(max(0.0, min(10.0, float(raw))), 1)
#                 scores.append(clamped)
#             except (TypeError, ValueError):
#                 pass
#     if not scores:
#         return 0.0
#     return round(sum(scores) / len(scores), 2)


# def _sanitize_feedback(feedback: dict) -> dict:
#     """
#     Clamp all numeric scores in feedback to valid ranges.
#     Prevents inflated scores from being stored.
#     """
#     def clamp(v):
#         try:
#             return round(max(0.0, min(10.0, float(v))), 1)
#         except Exception:
#             return None

#     sanitized = {}
#     for qid, fb in (feedback or {}).items():
#         if not isinstance(fb, dict):
#             continue
#         clean_fb = dict(fb)

#         if clean_fb.get("overallScore") is not None:
#             clean_fb["overallScore"] = clamp(clean_fb["overallScore"])

#         for section in ("content", "delivery"):
#             seg = clean_fb.get(section)
#             if isinstance(seg, dict):
#                 clean_fb[section] = {k: clamp(v) for k, v in seg.items()}

#         if isinstance(clean_fb.get("naturalness"), dict):
#             nat = clean_fb["naturalness"]
#             if nat.get("score") is not None:
#                 nat["score"] = clamp(nat["score"])
#             clean_fb["naturalness"] = nat

#         sanitized[qid] = clean_fb

#     return sanitized


# @bp.route("/api/chats/<chat_id>/video-session/save", methods=["POST"])
# def save_video_session(chat_id):
#     user = get_user_from_token()
#     if not user:
#         return jsonify({"error": "unauthorized"}), 401

#     chat = Chat.query.get(chat_id)
#     if not chat or chat.user_id != user.id:
#         return jsonify({"error": "invalid chat"}), 403

#     data = request.get_json(silent=True) or {}

#     session_id   = data.get("session_id") or generate_id()
#     questions    = data.get("questions") or []
#     answers      = data.get("answers")   or {}
#     raw_feedback = data.get("feedback")  or {}

#     # ── Validate session belongs to this user if it already exists ────────
#     existing = PracticeSession.query.get(session_id)
#     if existing:
#         existing_chat = Chat.query.get(existing.chat_id)
#         if not existing_chat or existing_chat.user_id != user.id:
#             return jsonify({"error": "unauthorized"}), 403

#     # ── Sanitize feedback scores (clamp to 0-10) ──────────────────────────
#     feedback = _sanitize_feedback(raw_feedback)

#     # ── Recalculate score server-side — ignore frontend score ─────────────
#     score = _recalculate_score_from_feedback(feedback)

#     # ── Derive session_type from DB config — ignore frontend value ─────────
#     exam_cfg = json.loads(chat.exam_config or "{}")
#     session_mode = exam_cfg.get("sessionMode", "video")
#     session_type = "video_full" if session_mode != "voice" else "voice_full"

#     logger.info(
#         "[video_session] saving chat=%s session=%s questions=%d score=%s",
#         chat_id, session_id, len(questions), score
#     )

#     try:
#         if existing:
#             existing.questions     = json.dumps(questions)
#             existing.answers       = json.dumps(answers)
#             existing.feedback_json = json.dumps(feedback)
#             existing.score         = score
#             existing.session_type  = session_type
#             db.session.commit()
#             logger.info("[video_session] updated existing session %s", session_id)
#         else:
#             session = PracticeSession(
#                 id            = session_id,
#                 chat_id       = chat_id,
#                 session_type  = session_type,
#                 questions     = json.dumps(questions),
#                 answers       = json.dumps(answers),
#                 feedback_json = json.dumps(feedback),
#                 score         = score,
#             )
#             db.session.add(session)
#             db.session.commit()
#             logger.info("[video_session] created new session %s", session_id)

#         # Invalidate chat list cache
#         invalidate_chat(chat_id, user.id)

#         return jsonify({
#             "sessionId": session_id,
#             "score":     score,
#             "saved":     True,
#         })

#     except Exception as exc:
#         db.session.rollback()
#         logger.exception("[video_session] DB error: %s", exc)
#         return jsonify({"error": f"Failed to save session: {str(exc)}"}), 500





























# """
# routes/video_session_routes.py

# New blueprint — zero changes to any existing file.

# Register in routes/__init__.py:
#     from .video_session_routes import bp as video_session_bp

# Register in app.py:
#     from routes import ..., video_session_bp
#     app.register_blueprint(video_session_bp)

# Stores a completed video interview into the existing PracticeSession table:
#   - session_type  = 'video_full'
#   - questions     = JSON array of question objects (from PDF generation)
#   - answers       = JSON map  { question_id: transcript_string }
#   - feedback_json = JSON map  { question_id: full_feedback_object }
#                    Each feedback object contains the complete coaching JSON
#                    (overallScore, content, delivery, visual, naturalness,
#                     strengths, improvements, suggestedBetterAnswer, transcript)
#   - score         = average overallScore across answered questions

# Frontend sends: POST /api/chats/<chat_id>/video-session/save
# Body (JSON):
#   {
#     "session_id":   "<uuid from generateFullExam>",
#     "questions":    [...],   // original questions array
#     "answers":      { qid: transcript },
#     "feedback":     { qid: feedbackMap },
#     "score":        7.4,
#     "session_type": "video_full"
#   }

# If session_id already exists in DB (e.g. retry), it UPDATES instead of inserting.
# This matches the voice interview pattern — questions are pre-generated,
# answers + feedback are submitted together at the end.
# """

# import json
# from flask import Blueprint, request, jsonify
# from models import Chat, PracticeSession
# from extensions import db
# from services.auth_service import get_user_from_token
# from utils import generate_id
# from logger import get_logger

# logger = get_logger("video_session_routes")
# bp = Blueprint("video_session_routes", __name__)


# @bp.route("/api/chats/<chat_id>/video-session/save", methods=["POST"])
# def save_video_session(chat_id):
#     user = get_user_from_token()
#     if not user:
#         return jsonify({"error": "unauthorized"}), 401

#     chat = Chat.query.get(chat_id)
#     if not chat or chat.user_id != user.id:
#         return jsonify({"error": "invalid chat"}), 403

#     data = request.get_json(silent=True) or {}

#     session_id   = data.get("session_id") or generate_id()
#     questions    = data.get("questions") or []
#     answers      = data.get("answers")   or {}
#     feedback     = data.get("feedback")  or {}
#     score        = data.get("score")
#     session_type = data.get("session_type") or "video_full"

#     # Clamp score
#     if score is not None:
#         try:
#             score = round(max(0.0, min(10.0, float(score))), 2)
#         except (TypeError, ValueError):
#             score = None

#     logger.info(
#         "[video_session] saving chat=%s session=%s questions=%d score=%s",
#         chat_id, session_id, len(questions), score
#     )

#     try:
#         # Check if session already exists (re-submit / retry scenario)
#         existing = PracticeSession.query.get(session_id)

#         if existing:
#             # Update in place
#             existing.questions    = json.dumps(questions)
#             existing.answers      = json.dumps(answers)
#             existing.feedback_json = json.dumps(feedback)
#             existing.score        = score
#             existing.session_type = session_type
#             db.session.commit()
#             logger.info("[video_session] updated existing session %s", session_id)
#         else:
#             # Insert new row
#             session = PracticeSession(
#                 id           = session_id,
#                 chat_id      = chat_id,
#                 session_type = session_type,
#                 questions    = json.dumps(questions),
#                 answers      = json.dumps(answers),
#                 feedback_json = json.dumps(feedback),
#                 score        = score,
#             )
#             db.session.add(session)
#             db.session.commit()
#             logger.info("[video_session] created new session %s", session_id)

#         return jsonify({
#             "sessionId": session_id,
#             "score":     score,
#             "saved":     True,
#         })

#     except Exception as exc:
#         db.session.rollback()
#         logger.exception("[video_session] DB error: %s", exc)
#         return jsonify({"error": f"Failed to save session: {str(exc)}"}), 500