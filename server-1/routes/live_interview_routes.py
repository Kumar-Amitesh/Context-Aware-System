import json
import asyncio
import threading
import websockets
import os

from flask import Blueprint, request
from flask import current_app
from flask_sock import Sock

from extensions import db
from models import Chat, PracticeSession
from utils.auth import verify_token

from services.chroma_service import (
    get_chroma_client,
    get_chroma_collection,
    chroma_collection_name
)

from services.embedding_service import get_embedding_model
from services.interview_scoring_service import score_interview


live_bp = Blueprint("live_interview", __name__)
sock = Sock()

GEMINI_API_KEY = ""

GEMINI_LIVE_URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
    f"?key={GEMINI_API_KEY}"
)

LIVE_MODEL = "models/gemini-2.5-flash-native-audio-preview-12-2025"

def merge_conversation_log(conversation_log):
    """Merge consecutive same-role fragments into single entries."""
    merged = []
    for entry in conversation_log:
        if merged and merged[-1]["role"] == entry["role"]:
            merged[-1]["text"] += entry["text"]
        else:
            merged.append({"role": entry["role"], "text": entry["text"]})
    return merged

async def save_and_finish(session, chat, questions, conversation_log, browser_ws):
    try:
        result = score_interview(questions, merge_conversation_log(conversation_log))

        feedback = result.get("feedback", {})

        # Build answers map from what the LLM extracted per question
        answers_map = {}
        for q in questions:
            qid = q.get("id")
            fb = feedback.get(qid, {})
            answers_map[qid] = fb.get("userAnswer", "")

        session.score = result.get("score", 0)
        session.feedback_json = json.dumps(feedback)
        session.answers = json.dumps(answers_map)
        chat.weak_topics_json = json.dumps(result.get("weak_topics", []))
        db.session.commit()

        try:
            browser_ws.send(json.dumps({
                "type": "interview_done",
                "score": session.score
            }))
        except Exception:
            pass

    except Exception as e:
        print(f"[save_and_finish] error: {e}")
        import traceback
        traceback.print_exc()


# ─────────────────────────────────────────────
# SYSTEM PROMPT (Adaptive interviewer)
# ─────────────────────────────────────────────

def build_system_prompt(questions, pdf_chunks):

    context_block = ""

    if pdf_chunks:
        joined = "\n\n---\n\n".join(pdf_chunks[:8])

        context_block = f"""
## Reference Material

Use this material to evaluate answers and provide hints.

{joined}
"""

    qs_block = "\n".join(
        f"{i+1}. [{q.get('topic','General')}] {q.get('question')}"
        for i, q in enumerate(questions)
    )

    return f"""
You are an expert interviewer conducting a spoken voice interview.

Speak naturally and conversationally.

{context_block}

## Interview Questions

You have EXACTLY {len(questions)} questions to ask:

{qs_block}

## Rules

- Ask Question 1 first with a brief welcome.
- After the candidate answers, ask AT MOST ONE follow-up.
- Then move to the next question immediately.
- After all {len(questions)} questions and their follow-ups are done, say EXACTLY this phrase and nothing else:

"Interview complete. Well done."

- Do NOT ask more than {len(questions)} main questions.
- Do NOT keep the conversation going after all questions are done.
- Keep all responses SHORT (2-3 sentences max).
"""

#     return f"""
# You are an expert interviewer conducting a spoken voice interview.

# Speak naturally and conversationally.

# {context_block}

# ## Interview Questions

# {qs_block}

# ## Interview Behavior

# Start with a short welcome and ask Question 1.

# After each answer:

# • If answer is strong → ask a deeper follow-up  
# • If answer is partial → ask clarification  
# • If answer is wrong → provide a hint

# Difficulty rules:

# • If candidate answers confidently → increase difficulty
# • If candidate struggles → simplify explanation

# Conversation rules:

# • Keep responses SHORT
# • Do NOT repeat the full question
# • Ask only one follow-up
# • Allow interruptions

# After finishing all questions say exactly:

# Interview complete. Well done.
# """


# ─────────────────────────────────────────────
# GEMINI SESSION SETUP
# ─────────────────────────────────────────────

def build_setup_message(system_prompt):

    return {
        "setup": {
            "model": LIVE_MODEL,
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {"voiceName": "Charon"}
                    }
                },
            },
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "realtimeInputConfig": {
                "automaticActivityDetection": {
                    "disabled": False,
                    "silenceDurationMs": 1200,
                },
                "activityHandling": "START_OF_ACTIVITY_INTERRUPTS",
            },
            "inputAudioTranscription": {},
            "outputAudioTranscription": {},
        }
    }


# ─────────────────────────────────────────────
# RETRIEVE CONTEXT FROM CHROMA
# ─────────────────────────────────────────────

def retrieve_pdf_context(user_id, chat_id, questions):

    try:

        client = get_chroma_client()

        collection_name = chroma_collection_name(user_id, chat_id)

        collection = get_chroma_collection(client, collection_name)

        model = get_embedding_model()

        queries = [q.get("question") for q in questions[:3] if q.get("question")]

        if not queries:
            return []

        embeddings = model.encode(queries).tolist()

        res = collection.query(
            query_embeddings=embeddings,
            n_results=3
        )

        chunks = []

        if res and res.get("documents"):
            for docs in res["documents"]:
                chunks.extend(docs)

        return list(dict.fromkeys(chunks))[:8]

    except Exception as e:
        print("Chroma retrieval failed:", e)
        return []


# ─────────────────────────────────────────────
# BRIDGE
# ─────────────────────────────────────────────

async def bridge(browser_ws, session_id):
    try:
        session = PracticeSession.query.get(session_id)

        if not session:
            try:
                browser_ws.send(json.dumps({"error": "Session not found"}))
            except Exception:
                pass
            return

        questions = json.loads(session.questions or "[]")
        chat = Chat.query.get(session.chat_id)

        # At the top of bridge(), after loading questions:
        min_turns_required = len(questions) * 2   # each question + at least one answer

        turn_count = 0   # increment on every turnComplete

        if not chat:
            try:
                browser_ws.send(json.dumps({"error": "Chat not found"}))
            except Exception:
                pass
            return

        user_id = chat.user_id
        chat_id = chat.id

        pdf_chunks = retrieve_pdf_context(user_id, chat_id, questions)
        system_prompt = build_system_prompt(questions, pdf_chunks)
        setup_message = build_setup_message(system_prompt)
        conversation_log = []

        try:
            browser_ws.send(json.dumps({"type": "proxy_ready"}))
        except Exception:
            return  # client already disconnected, abort silently

        async with websockets.connect(
            GEMINI_LIVE_URL,
            ping_interval=20,
            ping_timeout=30,
            max_size=25 * 1024 * 1024,
        ) as gemini_ws:

            await gemini_ws.send(json.dumps(setup_message))

            setup_ack = await gemini_ws.recv()

            if "setupComplete" not in json.loads(setup_ack):
                browser_ws.send(json.dumps({"error": "Gemini setup failed"}))
                return

            browser_ws.send(json.dumps({"type": "gemini_ready"}))

            loop = asyncio.get_event_loop()

            async def browser_to_gemini():
                while True:
                    raw = await loop.run_in_executor(None, browser_ws.receive)
                    if raw is None:
                        break

                    try:
                        msg = json.loads(raw)
                    except Exception:
                        continue

                    if msg.get("type") == "audio_chunk":
                        await gemini_ws.send(json.dumps({
                            "realtimeInput": {
                                "audio": {
                                    "data": msg["data"],
                                    "mimeType": "audio/pcm;rate=16000"
                                }
                            }
                        }))

                    elif msg.get("type") == "audio_stream_end":
                        await gemini_ws.send(json.dumps({
                            "realtimeInput": {"audioStreamEnd": True}
                        }))

                    elif msg.get("type") == "end_interview":
                        # User clicked End — save whatever we have and exit
                        await save_and_finish(session, chat, questions, conversation_log, browser_ws)
                        return

            async def gemini_to_browser():
                candidate_buf = ''      # ← add this
                
                async for raw in gemini_ws:
                    try:
                        data = json.loads(raw)
                        sc = data.get("serverContent", {})
                        model_turn = sc.get("modelTurn", {})

                        for part in model_turn.get("parts", []):
                            if "inlineData" in part:
                                browser_ws.send(json.dumps({
                                    "type": "audio_chunk",
                                    "data": part["inlineData"]["data"],
                                    "mimeType": part["inlineData"].get("mimeType", "audio/pcm;rate=24000"),
                                }))

                        out_t = sc.get("outputTranscription", {})
                        if out_t.get("text"):
                            text = out_t["text"]
                            conversation_log.append({"role": "interviewer", "text": text})
                            browser_ws.send(json.dumps({"type": "interviewer_transcript", "text": text}))

                        in_t = sc.get("inputTranscription", {})
                        if in_t.get("text"):
                            candidate_buf += in_t["text"]           # ← buffer, don't append yet
                            browser_ws.send(json.dumps({
                                "type": "candidate_transcript", 
                                "text": in_t["text"]
                            }))

                        if sc.get("turnComplete"):
                            # Flush candidate buffer on turn complete
                            # Then in gemini_to_browser, when sc.get("turnComplete"):
                            turn_count += 1
                            if candidate_buf.strip():               # ← flush here
                                conversation_log.append({
                                    "role": "candidate", 
                                    "text": candidate_buf.strip()
                                })
                                candidate_buf = ''
                            browser_ws.send(json.dumps({"type": "turn_complete"}))

                        if sc.get("interrupted"):
                            # Flush whatever candidate said before interruption too
                            if candidate_buf.strip():               # ← flush on interrupt too
                                conversation_log.append({
                                    "role": "candidate",
                                    "text": candidate_buf.strip()
                                })
                                candidate_buf = ''
                            browser_ws.send(json.dumps({"type": "interrupted"}))

                        # Check for completion AFTER flushing buffers
                        if out_t.get("text") and "interview complete" in out_t["text"].lower() and turn_count >= min_turns_required:
                            if candidate_buf.strip():               # ← final flush before saving
                                conversation_log.append({
                                    "role": "candidate",
                                    "text": candidate_buf.strip()
                                })
                                candidate_buf = ''
                            await save_and_finish(
                                session, chat, questions, conversation_log, browser_ws
                            )
                            return

                    except Exception:
                        continue

            await asyncio.gather(
                browser_to_gemini(),
                gemini_to_browser()
            )
    except Exception as e:
        print(f"[bridge] unhandled error: {e}")
        try:
            browser_ws.send(json.dumps({"error": str(e)}))
        except Exception:
            pass


# ─────────────────────────────────────────────
# THREAD WRAPPER
# ─────────────────────────────────────────────

def run_bridge_thread(ws, session_id):
    from app import app

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        with app.app_context():
            loop.run_until_complete(bridge(ws, session_id))
    except Exception as e:
        print(f"[run_bridge_thread] error: {e}")
        try:
            ws.send(json.dumps({"error": str(e)}))
        except Exception:
            pass
    finally:
        loop.close()

# ─────────────────────────────────────────────
# WEBSOCKET ROUTE
# ─────────────────────────────────────────────

@sock.route("/ws/live-interview/<session_id>")
def live_interview_ws(ws, session_id):
    token = request.args.get("token")
    if not token:
        ws.send(json.dumps({"error": "Missing token"}))
        return
    try:
        verify_token(token)
    except Exception:
        ws.send(json.dumps({"error": "Invalid token"}))
        return

    # Run bridge directly in a new event loop — no join needed
    # Flask-Sock keeps ws alive as long as this function runs
    run_bridge_thread(ws, session_id)  # this blocks THIS thread only

# @sock.route("/ws/live-interview/<session_id>")
# def live_interview_ws(ws, session_id):

#     token = request.args.get("token")

#     if not token:
#         ws.send(json.dumps({"error": "Missing token"}))
#         return

#     try:
#         verify_token(token)
#     except Exception:
#         ws.send(json.dumps({"error": "Invalid token"}))
#         return

#     thread = threading.Thread(
#         target=run_bridge_thread,
#         args=(ws, session_id),
#         daemon=True
#     )
#     thread.start()
#     thread.join()

























# """
# live_interview_routes.py
# ─────────────────────────────────────────────────────
# WebSocket proxy that bridges the browser ↔ Gemini Live API.

# Flow:
#   1. Browser connects to  ws://localhost:5000/ws/live-interview/<session_id>
#   2. This route loads the exam session (questions + chatId) from DB
#   3. Retrieves relevant PDF chunks from ChromaDB (same as exam_service)
#   4. Opens a WebSocket to Gemini Live API with a rich system prompt
#   5. Bidirectionally proxies audio chunks between browser and Gemini

# Install deps (add to requirements.txt):
#   flask-sock
#   websockets>=12.0
# """

# import json
# import asyncio
# import threading
# import websockets
# import os

# from flask import Blueprint, request
# from flask_sock import Sock

# from models.exam import ExamSession          # your existing model
# from models.chat import Chat
# from services.chroma_service import (
#     get_chroma_client,
#     get_chroma_collection,
#     chroma_collection_name
# )
# from services.embedding_service import get_embedding_model
# from utils.auth import verify_token

# live_bp   = Blueprint('live_interview', __name__)
# sock      = Sock()   # initialised in app.py with sock.init_app(app)

# GEMINI_API_KEY  = os.environ.get('GEMINI_API_KEY', '')
# GEMINI_LIVE_URL = (
#     'wss://generativelanguage.googleapis.com/ws/'
#     'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
#     f'?key={GEMINI_API_KEY}'
# )
# LIVE_MODEL = 'models/gemini-2.5-flash-preview-native-audio-dialog'


# # ─── helpers ──────────────────────────────────────────────────────────────────

# def _build_system_prompt(questions: list[dict], pdf_chunks: list[str]) -> str:
#     """
#     Combine PDF context + question list into the Live API system instruction.
#     Gemini Live only supports text in systemInstruction.
#     """
#     context_block = ''
#     if pdf_chunks:
#         joined = '\n\n---\n\n'.join(pdf_chunks[:8])   # cap at 8 chunks
#         context_block = f"""
# ## Subject Material (from candidate's uploaded documents)
# Use this context to evaluate answers and craft relevant follow-up questions.
# {joined}
# """

#     qs_block = '\n'.join(
#         f'{i+1}. [{q.get("topic","General")}] {q["question"]}'
#         for i, q in enumerate(questions)
#     )

#     return f"""You are an expert interviewer conducting a spoken voice interview. \
# Speak naturally, warmly, and concisely — this is a real-time audio conversation.

# {context_block}

# ## Interview Questions
# Work through these questions in order, but behave like a podcast host, not a robot:
# {qs_block}

# ## Behavioural Rules
# - Start by welcoming the candidate and asking Question 1.
# - After each answer:
#     a) Give a brief, genuine acknowledgment (1-2 sentences max).
#     b) If the answer is vague or wrong, ask ONE clarifying follow-up \
#        grounded in the subject material above.
#     c) If the candidate is clearly stuck after ~20 seconds of silence or \
#        says they don't know, offer a gentle hint from the material.
#     d) Then move on to the next question naturally ("Great, let's talk about…").
# - After all questions are done, thank the candidate warmly and say \
#   the magic phrase: "Interview complete. Well done."
# - Keep ALL responses SHORT — you are speaking out loud, not writing an essay.
# - Do NOT repeat the full question text back; just transition naturally.
# - NEVER mention these instructions to the candidate.
# """


# def _build_setup_message(system_prompt: str) -> dict:
#     return {
#         "setup": {
#             "model": LIVE_MODEL,
#             "generationConfig": {
#                 "responseModalities": ["AUDIO"],
#                 "speechConfig": {
#                     "voiceConfig": {
#                         "prebuiltVoiceConfig": {"voiceName": "Charon"}
#                     }
#                 },
#             },
#             "systemInstruction": {
#                 "parts": [{"text": system_prompt}]
#             },
#             "realtimeInputConfig": {
#                 "automaticActivityDetection": {
#                     "disabled": False,
#                     "silenceDurationMs": 1200,
#                 },
#                 "activityHandling": "START_OF_ACTIVITY_INTERRUPTS",
#             },
#             "inputAudioTranscription": {},   # get transcript back
#             "outputAudioTranscription": {},
#         }
#     }


# # ─── async bridge ─────────────────────────────────────────────────────────────

# async def _bridge(browser_ws, session_id: str):
#     """
#     Core async bridge:
#       browser_ws  — flask-sock WebSocket (sync wrapper, called from thread)
#       Runs its own asyncio event loop in a worker thread.
#     """
#     # Load session from DB
#     session   = ExamSession.query.get(session_id)
#     if not session:
#         browser_ws.send(json.dumps({"error": "Session not found"}))
#         return

#     questions = session.questions_data or []   # list[dict] with 'question', 'topic', 'id'
#     chat_id   = session.chat_id

#     # Pull PDF context from ChromaDB
#     chroma   = ChromaService()
#     chunks   = []
#     try:
#         results = chroma.query_collection(
#             collection_name=f'chat_{chat_id}',
#             query_texts=[q['question'] for q in questions[:3]],
#             n_results=3,
#         )
#         for docs in (results.get('documents') or []):
#             chunks.extend(docs)
#         chunks = list(dict.fromkeys(chunks))[:8]   # dedup, cap
#     except Exception:
#         pass   # gracefully degrade — interview still works without PDF context

#     system_prompt  = _build_system_prompt(questions, chunks)
#     setup_message  = _build_setup_message(system_prompt)

#     browser_ws.send(json.dumps({"type": "proxy_ready"}))

#     async with websockets.connect(
#         GEMINI_LIVE_URL,
#         ping_interval=20,
#         ping_timeout=30,
#         max_size=10 * 1024 * 1024,   # 10 MB for audio
#     ) as gemini_ws:

#         # Send setup first
#         await gemini_ws.send(json.dumps(setup_message))

#         # Wait for setupComplete
#         setup_ack = await gemini_ws.recv()
#         setup_data = json.loads(setup_ack)
#         if 'setupComplete' not in setup_data:
#             browser_ws.send(json.dumps({"error": "Gemini setup failed", "detail": setup_data}))
#             return

#         browser_ws.send(json.dumps({"type": "gemini_ready"}))

#         # ── two concurrent tasks ──────────────────────────────────────────────

#         async def browser_to_gemini():
#             """Read messages from browser, forward to Gemini."""
#             loop = asyncio.get_event_loop()
#             while True:
#                 try:
#                     # flask-sock recv is blocking — run in executor
#                     raw = await loop.run_in_executor(None, browser_ws.receive)
#                     if raw is None:
#                         break
#                     # The browser sends JSON-wrapped audio chunks or control messages
#                     msg = json.loads(raw)

#                     if msg.get('type') == 'audio_chunk':
#                         # Browser sends base64 PCM audio
#                         await gemini_ws.send(json.dumps({
#                             "realtimeInput": {
#                                 "audio": {
#                                     "data":      msg['data'],
#                                     "mimeType":  "audio/pcm;rate=16000"
#                                 }
#                             }
#                         }))
#                     elif msg.get('type') == 'audio_stream_end':
#                         await gemini_ws.send(json.dumps({
#                             "realtimeInput": {"audioStreamEnd": True}
#                         }))
#                     elif msg.get('type') == 'text_input':
#                         # Fallback: candidate typed instead of spoke
#                         await gemini_ws.send(json.dumps({
#                             "clientContent": {
#                                 "turns": [{"role": "user", "parts": [{"text": msg['text']}]}],
#                                 "turnComplete": True,
#                             }
#                         }))
#                     elif msg.get('type') == 'ping':
#                         pass   # keep-alive from browser, no-op
#                 except Exception:
#                     break

#         async def gemini_to_browser():
#             """Read Gemini responses, forward to browser."""
#             async for raw in gemini_ws:
#                 try:
#                     data = json.loads(raw)
#                     sc   = data.get('serverContent', {})

#                     # Audio chunk
#                     model_turn = sc.get('modelTurn', {})
#                     for part in model_turn.get('parts', []):
#                         if 'inlineData' in part:
#                             browser_ws.send(json.dumps({
#                                 "type":     "audio_chunk",
#                                 "data":     part['inlineData']['data'],
#                                 "mimeType": part['inlineData'].get('mimeType', 'audio/pcm;rate=24000'),
#                             }))

#                     # Transcription (interviewer speech → text, shown in UI)
#                     out_t = sc.get('outputTranscription', {})
#                     if out_t.get('text'):
#                         browser_ws.send(json.dumps({
#                             "type": "interviewer_transcript",
#                             "text": out_t['text'],
#                         }))

#                     # Candidate transcription
#                     in_t = sc.get('inputTranscription', {})
#                     if in_t.get('text'):
#                         browser_ws.send(json.dumps({
#                             "type": "candidate_transcript",
#                             "text": in_t['text'],
#                         }))

#                     # Turn complete
#                     if sc.get('turnComplete'):
#                         browser_ws.send(json.dumps({"type": "turn_complete"}))

#                     # Detect "Interview complete" magic phrase
#                     for part in model_turn.get('parts', []):
#                         if 'text' in part and 'interview complete' in part['text'].lower():
#                             browser_ws.send(json.dumps({"type": "interview_done"}))

#                     # Interrupted (user barged in)
#                     if sc.get('interrupted'):
#                         browser_ws.send(json.dumps({"type": "interrupted"}))

#                 except Exception:
#                     continue

#         await asyncio.gather(browser_to_gemini(), gemini_to_browser())


# def _run_bridge_in_thread(browser_ws, session_id):
#     """flask-sock handlers are sync; we spin a new event loop per connection."""
#     loop = asyncio.new_event_loop()
#     asyncio.set_event_loop(loop)
#     try:
#         loop.run_until_complete(_bridge(browser_ws, session_id))
#     finally:
#         loop.close()


# # ─── WebSocket endpoint ───────────────────────────────────────────────────────

# @sock.route('/ws/live-interview/<session_id>')
# def live_interview_ws(ws, session_id):
#     """
#     WebSocket endpoint.  Registered via sock.init_app(app) in app.py.
#     Auth: browser must send ?token=<jwt> in the connection URL because
#     WebSocket handshakes don't support custom headers easily from browsers.
#     """
#     token = request.args.get('token')
#     if not token:
#         ws.send(json.dumps({"error": "Missing token"}))
#         return

#     try:
#         verify_token(token)   # raises on invalid/expired
#     except Exception:
#         ws.send(json.dumps({"error": "Invalid token"}))
#         return

#     t = threading.Thread(target=_run_bridge_in_thread, args=(ws, session_id), daemon=True)
#     t.start()
#     t.join()   # block flask-sock until bridge is done