"""
routes/video_session_routes.py

New blueprint — zero changes to any existing file.

Register in routes/__init__.py:
    from .video_session_routes import bp as video_session_bp

Register in app.py:
    from routes import ..., video_session_bp
    app.register_blueprint(video_session_bp)

Stores a completed video interview into the existing PracticeSession table:
  - session_type  = 'video_full'
  - questions     = JSON array of question objects (from PDF generation)
  - answers       = JSON map  { question_id: transcript_string }
  - feedback_json = JSON map  { question_id: full_feedback_object }
                   Each feedback object contains the complete coaching JSON
                   (overallScore, content, delivery, visual, naturalness,
                    strengths, improvements, suggestedBetterAnswer, transcript)
  - score         = average overallScore across answered questions

Frontend sends: POST /api/chats/<chat_id>/video-session/save
Body (JSON):
  {
    "session_id":   "<uuid from generateFullExam>",
    "questions":    [...],   // original questions array
    "answers":      { qid: transcript },
    "feedback":     { qid: feedbackMap },
    "score":        7.4,
    "session_type": "video_full"
  }

If session_id already exists in DB (e.g. retry), it UPDATES instead of inserting.
This matches the voice interview pattern — questions are pre-generated,
answers + feedback are submitted together at the end.
"""

import json
from flask import Blueprint, request, jsonify
from models import Chat, PracticeSession
from extensions import db
from services.auth_service import get_user_from_token
from utils import generate_id
from logger import get_logger

logger = get_logger("video_session_routes")
bp = Blueprint("video_session_routes", __name__)


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
    feedback     = data.get("feedback")  or {}
    score        = data.get("score")
    session_type = data.get("session_type") or "video_full"

    # Clamp score
    if score is not None:
        try:
            score = round(max(0.0, min(10.0, float(score))), 2)
        except (TypeError, ValueError):
            score = None

    logger.info(
        "[video_session] saving chat=%s session=%s questions=%d score=%s",
        chat_id, session_id, len(questions), score
    )

    try:
        # Check if session already exists (re-submit / retry scenario)
        existing = PracticeSession.query.get(session_id)

        if existing:
            # Update in place
            existing.questions    = json.dumps(questions)
            existing.answers      = json.dumps(answers)
            existing.feedback_json = json.dumps(feedback)
            existing.score        = score
            existing.session_type = session_type
            db.session.commit()
            logger.info("[video_session] updated existing session %s", session_id)
        else:
            # Insert new row
            session = PracticeSession(
                id           = session_id,
                chat_id      = chat_id,
                session_type = session_type,
                questions    = json.dumps(questions),
                answers      = json.dumps(answers),
                feedback_json = json.dumps(feedback),
                score        = score,
            )
            db.session.add(session)
            db.session.commit()
            logger.info("[video_session] created new session %s", session_id)

        return jsonify({
            "sessionId": session_id,
            "score":     score,
            "saved":     True,
        })

    except Exception as exc:
        db.session.rollback()
        logger.exception("[video_session] DB error: %s", exc)
        return jsonify({"error": f"Failed to save session: {str(exc)}"}), 500