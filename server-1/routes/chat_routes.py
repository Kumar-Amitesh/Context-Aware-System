import json
from flask import Blueprint, request, jsonify
from models import Chat
from extensions import db
from utils import generate_id
from services.auth_service import get_user_from_token
from services.exam_service import parse_bloom_levels
from services.evaluation_service import top_weak_topics
from services.topic_service import summarize_topic_analytics
from services.validation_service import validate_exam_config
from services.cache_service import (
    cache_get, cache_set, cache_delete,
    chat_list_key, chat_detail_key, invalidate_chat_list, invalidate_chat,
    TTL_CHAT_LIST, TTL_CHAT_DETAIL,
)

bp = Blueprint("chat_routes", __name__)


def _serialize_chat(chat):
    return {
        "chatId": chat.id,
        "examType": chat.exam_type,
        "createdAt": chat.created_at.isoformat(),
        "weakTopics": top_weak_topics(json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}, k=5),
        "pdfCount": len(chat.pdfs),
        "subject": (json.loads(chat.exam_config or "{}").get("subject")),
        "bloomLevels": parse_bloom_levels(chat.bloom_level),
        "examConfig": json.loads(chat.exam_config or "{}"),
        "analytics": summarize_topic_analytics(
            json.loads(chat.weak_topics_json) if chat.weak_topics_json else {},
            top_k=3
        )
    }


@bp.route("/api/chats", methods=["GET", "POST"])
def create_chat():
    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    if request.method == "GET":
        # ── Try cache first ───────────────────────────────────────────────
        key = chat_list_key(user.id)
        cached = cache_get(key)
        if cached is not None:
            return jsonify(cached)

        chats = (
            Chat.query
            .filter_by(user_id=user.id)
            .order_by(Chat.created_at.desc())
            .all()
        )

        result = [_serialize_chat(c) for c in chats]
        cache_set(key, result, TTL_CHAT_LIST)
        return jsonify(result)

    # ── POST: validate and sanitize before storing ────────────────────────
    data = request.json or {}

    sanitized_config, error, sanitized_blooms = validate_exam_config(data)
    if error:
        return jsonify({"error": error}), 400

    chat = Chat(
        id=generate_id(),
        user_id=user.id,
        exam_type=data.get("examType", "custom"),
        bloom_level=json.dumps(sanitized_blooms),
        exam_config=json.dumps(sanitized_config)
    )

    db.session.add(chat)
    db.session.commit()

    # Invalidate chat list cache for this user
    invalidate_chat_list(user.id)

    return jsonify({"chatId": chat.id})


@bp.route("/api/chats/<chat_id>/history", methods=["GET"])
def chat_history(chat_id):
    from models import PracticeSession

    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401
    chat = Chat.query.get(chat_id)

    if not chat or chat.user_id != user.id:
        return jsonify({"error": "unauthorized"}), 403

    sessions = (
        PracticeSession.query
        .filter_by(chat_id=chat_id)
        .order_by(PracticeSession.created_at.asc())
        .all()
    )

    result = []
    for s in sessions:
        result.append({
            "sessionId": s.id,
            "type": s.session_type,
            "score": s.score,
            "questions": json.loads(s.questions) if s.questions else [],
            "answers": json.loads(s.answers) if s.answers else {},
            "feedback": json.loads(s.feedback_json) if s.feedback_json else {},
            "createdAt": s.created_at.isoformat()
        })

    return jsonify(result)




















# import json
# from flask import Blueprint, request, jsonify
# from models import Chat
# from extensions import db
# from utils import generate_id
# from services.auth_service import get_user_from_token
# from services.exam_service import parse_bloom_levels
# from services.evaluation_service import top_weak_topics
# from services.topic_service import summarize_topic_analytics

# bp = Blueprint("chat_routes", __name__)


# @bp.route("/api/chats", methods=["GET","POST"])
# def create_chat():
#     user = get_user_from_token()
#     if not user:
#         return jsonify({"error": "unauthorized"}), 401

#     if request.method == "GET":
#         chats = (
#             Chat.query
#             .filter_by(user_id=user.id)
#             .order_by(Chat.created_at.desc())
#             .all()
#         )

#         return jsonify([
#             {
#                 "chatId": chat.id,
#                 "examType": chat.exam_type,
#                 "createdAt": chat.created_at.isoformat(),
#                 "weakTopics": top_weak_topics(json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}, k=5),
#                 "pdfCount": len(chat.pdfs),
#                 "subject": (json.loads(chat.exam_config or "{}").get("subject")),
#                 "bloomLevels": parse_bloom_levels(chat.bloom_level),
#                 "examConfig": json.loads(chat.exam_config or "{}"),
#                 "analytics": summarize_topic_analytics(
#                     json.loads(chat.weak_topics_json) if chat.weak_topics_json else {},
#                     top_k=3
#                 )
#             }
#             for chat in chats
#         ])

#     data = request.json or {}

#     bloom_levels = data.get("bloomLevels") or data.get("blooms") or []
#     if not bloom_levels and data.get("bloom"):
#         bloom_levels = [data.get("bloom")]

#     chat = Chat(
#         id=generate_id(),
#         user_id=user.id,
#         exam_type=data["examType"],
#         bloom_level=json.dumps(bloom_levels or ["Understand"]),
#         exam_config=json.dumps(data["examConfig"])
#     )

#     db.session.add(chat)
#     db.session.commit()

#     return jsonify({"chatId": chat.id})


# @bp.route("/api/chats/<chat_id>/history", methods=["GET"])
# def chat_history(chat_id):
#     from models import PracticeSession

#     user = get_user_from_token()
#     if not user:
#         return jsonify({"error": "unauthorized"}), 401
#     chat = Chat.query.get(chat_id)

#     if not chat or chat.user_id != user.id:
#         return jsonify({"error": "unauthorized"}), 403

#     sessions = (
#         PracticeSession.query
#         .filter_by(chat_id=chat_id)
#         .order_by(PracticeSession.created_at.asc())
#         .all()
#     )

#     result = []

#     for s in sessions:
#         result.append({
#             "sessionId": s.id,
#             "type": s.session_type,
#             "score": s.score,
#             "questions": json.loads(s.questions) if s.questions else [],
#             "answers": json.loads(s.answers) if s.answers else {},
#             "feedback": json.loads(s.feedback_json) if s.feedback_json else {},
#             "createdAt": s.created_at.isoformat()
#         })

#     return jsonify(result)