from flask import Flask, request, jsonify
from flask_cors import CORS
from models import *
from utils import *
import os
import json
from werkzeug.utils import secure_filename
from celery_worker import process_pdf_task
from extensions import db, celery
from logger import get_logger
import hashlib
logger = get_logger("server")


app = Flask(__name__)
CORS(app, origin="*", supports_credentials=True)

# CONFIG 

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

app.config['UPLOAD_FOLDER'] = "uploads"

os.makedirs("uploads", exist_ok=True)

db.init_app(app)

celery.conf.update(app.config)

with app.app_context():
    db.create_all()


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


# AUTH

def get_user_from_token():
    token = request.headers.get('Authorization')
    if token and token.startswith('Bearer '):
        token = token[7:]
        user_id = verify_token(token)
        if user_id:
            return User.query.get(user_id)
    return None

# BASIC 

@app.route('/', methods=['GET'])
def home():
    return jsonify({"message": "Exam Prep AI Backend Running"}), 200

# AUTH ROUTES

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json

    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'User already exists'}), 400

    user = User(
        id=generate_id(),
        email=data['email'],
        name=data['name'],
        password_hash=hash_password(data['password'])
    )

    db.session.add(user)
    db.session.commit()

    token = generate_token(user.id)

    return jsonify({
        'token': token,
        'user': {
            'id': user.id,
            'email': user.email,
            'name': user.name
        }
    }), 201


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json

    user = User.query.filter_by(email=data['email']).first()

    if not user or not verify_password(user.password_hash, data['password']):
        return jsonify({'error': 'Invalid credentials'}), 401

    token = generate_token(user.id)

    return jsonify({
        'token': token,
        'user': {
            'id': user.id,
            'email': user.email,
            'name': user.name
        }
    })


# CHAT CREATE 

@app.route("/api/chats", methods=["GET","POST"])
def create_chat():

    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    # GET: list chats
    if request.method == "GET":
        chats = (
            Chat.query
            .filter_by(user_id=user.id)
            .order_by(Chat.created_at.desc())
            .all()
        )

        return jsonify([
            {
                "chatId": chat.id,
                "examType": chat.exam_type,
                "createdAt": chat.created_at.isoformat(),
                # "weakTopics": chat.get_weak_topics_summary(),
                "weakTopics": top_weak_topics(json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}, k=5),
                "pdfCount": len(chat.pdfs),
                "subject": (json.loads(chat.exam_config or "{}").get("subject"))
            }
            for chat in chats
        ])

    data = request.json

    chat = Chat(
        id=generate_id(),
        user_id=user.id,
        exam_type=data["examType"],
        bloom_level=data.get("bloom"),
        exam_config=json.dumps(data["examConfig"])
    )

    db.session.add(chat)
    db.session.commit()

    return jsonify({"chatId": chat.id})


# PDF UPLOAD

@app.route("/api/chats/<chat_id>/pdfs", methods=["POST"])
def upload_pdf(chat_id):

    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401
    chat = Chat.query.get(chat_id)

    if not chat or chat.user_id != user.id:
        return jsonify({"error": "invalid chat"}), 403

    file = request.files["pdf"]

    original_name = secure_filename(file.filename)
    unique_name = f"{generate_id()}_{original_name}"
    path = os.path.join(app.config["UPLOAD_FOLDER"], unique_name)

    file.save(path)

    file_hash = sha256_file(path)

    existing = (PDFDocument.query
        .filter_by(chat_id=chat_id, file_hash=file_hash)
        .order_by(PDFDocument.uploaded_at.desc())
        .first()
    )

    # ✅ Block re-upload if already uploaded and not failed
    if existing and not existing.error and existing.is_processed:
        return jsonify({
            "error": "This PDF was already uploaded in this chat.",
            "pdfId": existing.id,
            "status": "duplicate"
        }), 409

    # ✅ If it exists but is pending/processing, also block
    if existing and not existing.error and not existing.is_processed:
        return jsonify({
            "error": "This PDF is already uploaded and still processing.",
            "pdfId": existing.id,
            "status": "duplicate_processing"
        }), 409

    # ✅ If it exists and failed/error => REUSE + retry instead of creating new row
    if existing and (existing.error or existing.pdf_type == "failed"):
        existing.filename = original_name
        existing.file_path = path
        existing.file_hash = file_hash
        existing.pdf_type = "pending"
        existing.is_processed = False
        existing.error = None
        db.session.commit()

        process_pdf_task.delay(existing.id, user.id, chat_id, path)

        return jsonify({
            "pdfId": existing.id,
            "status": "requeued",
            "processing": True
        }), 202


    # PDF TYPE WILL BE DETECTED INSIDE CELERY
    pdf = PDFDocument(
        id=generate_id(),
        chat_id=chat_id,
        filename=original_name,
        file_path=path,
        file_hash=file_hash,
        pdf_type="pending",     # temporary placeholder
        is_processed=False
    )

    db.session.add(pdf)
    db.session.commit()

    # async processing
    process_pdf_task.delay(
        pdf.id,
        user.id,
        chat_id,
        path
    )
    logger.info(f"PDF uploaded → {original_name}")
    logger.info(f"Saved path → {path}")
    logger.info("Triggering Celery PDF processing")

    return jsonify({
        "pdfId": pdf.id,
        "status": "uploaded",
        "processing": True
    }), 202

    


@app.route("/api/chats/<chat_id>/pdfs", methods=["GET"])
def list_pdfs(chat_id):
    user = get_user_from_token()
    chat = Chat.query.get(chat_id)

    if not chat or chat.user_id != user.id:
        return jsonify({"error": "unauthorized"}), 403

    return jsonify([
        {
            "pdfId": pdf.id,
            "filename": pdf.filename,
            "type": pdf.pdf_type,
            "processed": pdf.is_processed,
            "error": pdf.error, 
            "uploadedAt": pdf.uploaded_at.isoformat()
        }
        for pdf in chat.pdfs
    ])


# QUESTION GENERATION 

# @app.route("/api/chats/<chat_id>/questions/generate/full", methods=["POST"])
# def generate_full_exam(chat_id):
#     logger.info("Generate full exam called")

#     user = get_user_from_token()
#     chat = Chat.query.get(chat_id)

#     pending = PDFDocument.query.filter_by(chat_id=chat_id, is_processed=False).count()
#     if pending > 0:
#         return jsonify({"error": "PDFs still processing"}), 400

#     exam_cfg = json.loads(chat.exam_config)

#     mcq_cfg = exam_cfg.get("mcq")
#     desc_cfg = exam_cfg.get("descriptive")

#     bloom = chat.bloom_level or "understand"

#     client = get_chroma_client()
#     collection_name = chroma_collection_name(user.id, chat_id)
#     logger.info(f"Using collection: {collection_name}")
#     collection = client.get_or_create_collection(name=collection_name)
#     logger.info(f"Collection count: {collection.count()}")

    

#     # ---------- NO PDF FALLBACK ----------
#     # if collection.count() == 0:
#     #     questions = generate_without_pdfs(chat, user)

#     #     session = PracticeSession(
#     #         id=generate_id(),
#     #         chat_id=chat_id,
#     #         session_type="full_fallback",
#     #         questions=json.dumps(questions)
#     #     )
#     #     db.session.add(session)
#     #     db.session.commit()

#     #     return jsonify({
#     #         "sessionId": session.id,
#     #         "questions": questions,
#     #         "fallback": True
#     #     })

#     # weights = compute_topic_weights(collection)

#     questions = []

#     # ---------------- MCQ GENERATION ----------------

# #     if mcq_cfg:

# #         allocation = distribute_questions(weights, mcq_cfg["count"])

# #         for topic, count in allocation.items():

# #             ctx = fetch_topic_chunks(collection, topic)

# #             prompt = f"""
# # Generate {count} MCQs.

# # Rules:
# # - 4 options
# # - single correct
# # - Bloom level: {bloom}
# # - Difficulty: moderate

# # Topic: {topic}

# # Context:
# # {ctx}

# # Return JSON array:
# # [
# #  {{
# #   "id":"q1",
# #   "type":"mcq",
# #   "question":"...",
# #   "options":["A","B","C","D"],
# #   "answer":"A"
# #  }}
# # ]
# # """

# #             raw = call_gemini(prompt)
# #             qs = safe_json_extract(raw)
# #             weak_topics = json.loads(chat.weak_topics_json) if chat.weak_topics_json else []

# #             for q in qs:
# #                 duplicate = is_duplicate(
# #                     chat_id=chat_id,
# #                     question=q["question"],
# #                     topic=topic,
# #                     weak_topics=weak_topics
# #                 )

# #                 if duplicate:
# #                     continue 
# #                 q["topic"] = topic
# #                 questions.append(q)


#     weights = compute_topic_weights(collection)
#     topics = list(weights.keys())

#     merged_context = merge_context_by_topics(collection, topics)

#     prompt = f"""
#     Generate {mcq_cfg["count"]} MCQs.

#     Topic weight distribution:
#     {json.dumps(weights, indent=2)}

#     Rules:
#     - Bloom level: {bloom}
#     - 4 options
#     - One correct answer
#     - Moderate difficulty

#     Context:
#     {merged_context}

#     Return JSON array with fields:
#     id, type="mcq", question, options, answer, topic
#     """

#     raw = call_gemini(prompt)
#     questions += safe_json_extract(raw)


#     # DESCRIPTIVE GENERATION 

# #     if desc_cfg:

# #         allocation = distribute_questions(weights, desc_cfg["count"])

# #         for topic, count in allocation.items():

# #             ctx = fetch_topic_chunks(collection, topic)

# #             prompt = f"""
# # Generate {count} descriptive questions.

# # Marks per question: {desc_cfg["marks"]}
# # Bloom Level: {bloom}

# # Topic: {topic}

# # Context:
# # {ctx}

# # Return ONLY JSON array.
# # """

# #             raw = call_gemini(prompt)
# #             qs = safe_json_extract(raw)

# #             weak_topics = json.loads(chat.weak_topics_json) if chat.weak_topics_json else []

# #             for q in qs:
# #                 duplicate = is_duplicate(
# #                     chat_id=chat_id,
# #                     question=q["question"],
# #                     topic=topic,
# #                     weak_topics=weak_topics
# #                 )

# #                 if duplicate:
# #                     continue 
# #                 q["topic"] = topic
# #                 questions.append(q)

#     prompt = f"""
#     Generate {desc_cfg["count"]} descriptive questions.

#     Topic weight distribution:
#     {json.dumps(weights, indent=2)}

#     Bloom level: {bloom}
#     Marks per question: {desc_cfg["marks"]}

#     Context:
#     {merged_context}

#     Return JSON array with:
#     id, type="descriptive", question, topic
#     """

#     raw = call_gemini(prompt)
#     questions += safe_json_extract(raw)

#     session_id = generate_id()
#     for index, question in enumerate(questions):
#         question["id"] = f"{session_id}_q{index + 1}"

#     logger.info([q["id"] for q in questions])

#     session = PracticeSession(
#         id=session_id,
#         chat_id=chat_id,
#         session_type="full",
#         questions=json.dumps(questions)
#     )

#     db.session.add(session)
#     db.session.commit()

#     return jsonify({
#         "sessionId": session.id,
#         "questions": questions
#     })


# -----------------------------
# ✅ FULL EXAM ROUTE UPDATE
# -----------------------------
# @app.route("/api/chats/<chat_id>/questions/generate/full", methods=["POST"])
# def generate_full_exam(chat_id):
#     logger.info("Generate full exam called")

#     user = get_user_from_token()
#     chat = Chat.query.get(chat_id)

#     pending = PDFDocument.query.filter_by(chat_id=chat_id, is_processed=False).count()
#     if pending > 0:
#         return jsonify({"error": "PDFs still processing"}), 400

#     exam_cfg = json.loads(chat.exam_config or "{}")
#     mcq_cfg = exam_cfg.get("mcq")
#     desc_cfg = exam_cfg.get("descriptive")
#     bloom = chat.bloom_level or "understand"

#     client = get_chroma_client()
#     collection_name = chroma_collection_name(user.id, chat_id)
#     logger.info(f"Using collection: {collection_name}")
#     # collection = client.get_or_create_collection(name=collection_name)
#     collection = get_chroma_collection(client, collection_name)
#     logger.info(f"Collection count: {collection.count()}")

#     questions = []

#     # OLD
#     # weights = compute_topic_weights(collection)
#     # topics = list(weights.keys())
#     # merged_context = merge_context_by_topics(collection, topics)

#     # UPDATED: use ALL topics from DB for the chat (full subject coverage)
#     db_topics = SubjectTopic.query.filter_by(chat_id=chat_id).all()
#     topics = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

#     weights = compute_topic_weights(collection)
#     merged_context = merge_context_by_topics(collection, topics)

#     # PYQ bias (optional)
#     pyq_freq = exam_cfg.get("pyqTopicFrequency", {})

#     # ---------------- MCQ GENERATION ----------------
#     prompt = f"""
# Generate {mcq_cfg["count"]} MCQs.

# Allowed topics (choose topic EXACTLY from this list):
# {json.dumps(topics, indent=2)}

# If PYQ topic frequency is available, bias questions toward frequently asked topics:
# PYQ topicFrequency:
# {json.dumps(pyq_freq, indent=2)}

# Topic weight distribution (optional bias):
# {json.dumps(weights, indent=2)}

# Rules:
# - Bloom level: {bloom}
# - 4 options
# - One correct answer
# - Moderate difficulty

# Context:
# {merged_context}

# Return JSON array with fields:
# id, type="mcq", question, options, answer, topic
# """

#     raw = call_gemini(prompt)
#     questions += safe_json_extract(raw)
#     # allowed topics from DB
#     db_topics = SubjectTopic.query.filter_by(chat_id=chat_id).all()
#     allowed = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

#     # normalize topics returned by Gemini
#     for q in questions:
#         q["topic"] = map_to_closest_topic(q.get("topic", ""), allowed, threshold=0.35)

#     # ---------------- DESCRIPTIVE GENERATION ----------------
#     prompt = f"""
# Generate {desc_cfg["count"]} descriptive questions.

# Allowed topics (choose topic EXACTLY from this list):
# {json.dumps(topics, indent=2)}

# If PYQ topic frequency is available, bias questions toward frequently asked topics:
# PYQ topicFrequency:
# {json.dumps(pyq_freq, indent=2)}

# Bloom level: {bloom}
# Marks per question: {desc_cfg["marks"]}

# Context:
# {merged_context}

# Return JSON array with:
# id, type="descriptive", question, topic
# """

#     raw = call_gemini(prompt)
#     questions += safe_json_extract(raw)
#     # allowed topics from DB
#     db_topics = SubjectTopic.query.filter_by(chat_id=chat_id).all()
#     allowed = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

#     # normalize topics returned by Gemini
#     for q in questions:
#         q["topic"] = map_to_closest_topic(q.get("topic", ""), allowed, threshold=0.35)

#     session_id = generate_id()
#     for index, question in enumerate(questions):
#         question["id"] = f"{session_id}_q{index + 1}"

#     logger.info([q["id"] for q in questions])

#     session = PracticeSession(
#         id=session_id,
#         chat_id=chat_id,
#         session_type="full",
#         questions=json.dumps(questions)
#     )

#     db.session.add(session)
#     db.session.commit()

#     return jsonify({
#         "sessionId": session.id,
#         "questions": questions
#     })


@app.route("/api/chats/<chat_id>/questions/generate/full", methods=["POST"])
def generate_full_exam(chat_id):
    logger.info("Generate full exam called")

    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    chat = Chat.query.get(chat_id)
    if not chat or chat.user_id != user.id:
        return jsonify({"error": "invalid chat"}), 403

    pending = PDFDocument.query.filter_by(chat_id=chat_id, is_processed=False).count()
    if pending > 0:
        return jsonify({"error": "PDFs still processing"}), 400

    exam_cfg = json.loads(chat.exam_config or "{}")
    mcq_cfg = exam_cfg.get("mcq") or {"count": 0, "marks": 1}
    desc_cfg = exam_cfg.get("descriptive") or {"count": 0, "marks": 10}
    bloom = chat.bloom_level or "understand"

    client = get_chroma_client()
    collection_name = chroma_collection_name(user.id, chat_id)
    collection = get_chroma_collection(client, collection_name)

    # allowed topics from DB
    db_topics = SubjectTopic.query.filter_by(chat_id=chat_id).all()
    allowed = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

    weights = compute_topic_weights(collection)
    weights_small = top_n_weights(weights, n=10)
    # merged_context = merge_context_by_topics(collection, allowed)
    # Keep context small so you don't blow TPM
    merged_context = merge_context_by_topics_budgeted(
        collection,
        allowed,
        per_topic_results=2,
        max_chars=12000,
        max_chars_per_topic=900
    )

    pyq_freq = exam_cfg.get("pyqTopicFrequency", {}) or {}

    questions = []

    # MCQs
    if mcq_cfg.get("count", 0) > 0:
        prompt = f"""
Generate {mcq_cfg["count"]} MCQs.

Allowed topics (choose topic EXACTLY from this list):
{json.dumps(allowed, indent=2)}

If PYQ topic frequency is available, bias questions toward frequently asked topics:
PYQ topicFrequency:
{json.dumps(pyq_freq, indent=2)}

Topic weight distribution (optional bias): 
{json.dumps(weights_small, indent=2)}

Rules:
- Bloom level: {bloom}
- 4 options
- One correct answer
- Moderate difficulty

Context:
{merged_context}

Return JSON array with fields:
id, type="mcq", question, options, answer, topic
"""
        raw = call_gemini(prompt)
        questions += safe_json_extract(raw)

    # Descriptive
    if desc_cfg.get("count", 0) > 0:
        prompt = f"""
Generate {desc_cfg["count"]} descriptive questions.

Allowed topics (choose topic EXACTLY from this list):
{json.dumps(allowed, indent=2)}

If PYQ topic frequency is available, bias questions toward frequently asked topics:
PYQ topicFrequency:
{json.dumps(pyq_freq, indent=2)}

Bloom level: {bloom}
Marks per question: {desc_cfg["marks"]}

Context:
{merged_context}

Return JSON array with:
id, type="descriptive", question, topic
"""
        raw = call_gemini(prompt)
        questions += safe_json_extract(raw)

    # ✅ Normalize ALL topics once
    for q in questions:
        q["topic"] = map_to_closest_topic(q.get("topic", ""), allowed, threshold=0.35)

    # assign ids
    session_id = generate_id()
    for i, q in enumerate(questions):
        q["id"] = f"{session_id}_q{i+1}"

    session = PracticeSession(
        id=session_id,
        chat_id=chat_id,
        session_type="full",
        questions=json.dumps(questions)
    )
    db.session.add(session)
    db.session.commit()

    return jsonify({"sessionId": session.id, "questions": questions})



# -----------------------------
# ✅ WEAK ROUTE UPDATE
# (fix wrong collection name + use weak topics properly)
# -----------------------------
# @app.route("/api/chats/<chat_id>/questions/generate/weak", methods=["POST"])
# def generate_weak_exam(chat_id):

#     user = get_user_from_token()
#     chat = Chat.query.get(chat_id)

#     weak_topics_map = json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}

#     if not weak_topics_map:
#         return jsonify({"error": "No weak topics"}), 400

#     exam_cfg = json.loads(chat.exam_config or "{}")
#     mcq_cfg = exam_cfg.get("mcq")
#     desc_cfg = exam_cfg.get("descriptive")
#     bloom = chat.bloom_level or "understand"

#     client = get_chroma_client()

#     # OLD (wrong collection name)
#     # collection = client.get(f"user_{user.id}_chat_{chat_id}", [])

#     # UPDATED (use hashed collection name)
#     collection_name = chroma_collection_name(user.id, chat_id)
#     # collection = client.get_or_create_collection(name=collection_name)
#     collection = get_chroma_collection(client, collection_name)

#     # weak_topics = list(weak_topics_map.keys())
#     # UPDATED: prefer topics with higher weakness count (no extra LLM calls)
#     # weak_topics = sorted(
#     #     weak_topics_map.keys(),
#     #     key=lambda t: weak_topics_map.get(t, 0),
#     #     reverse=True
#     # )
#     weak_topics = sorted(
#         weak_topics_map.keys(),
#         key=lambda t: (weak_topics_map.get(t, {}).get("score", 0.0), weak_topics_map.get(t, {}).get("seen", 0)),
#         reverse=True
#     )
#     questions = []

#     # WEAK MCQs
#     if mcq_cfg:
#         per_topic = max(1, mcq_cfg["count"] // len(weak_topics))

#         for topic in weak_topics:
#             ctx = fetch_topic_chunks(collection, topic)

#             prompt = f"""
# Generate {per_topic} MCQs for REMEDIAL PRACTICE.

# Rules:
# - Focus on conceptual mistakes
# - Bloom level: {bloom}
# - 4 options
# - One correct answer

# Topic: {topic}

# Context:
# {ctx}

# Return JSON array.
# """
#             raw = call_gemini(prompt)
#             qs = safe_json_extract(raw)

#             for q in qs:
#                 q["topic"] = topic
#                 questions.append(q)

#             if len([q for q in questions if q["type"] == "mcq"]) >= mcq_cfg["count"]:
#                 break

#     # WEAK DESCRIPTIVE
#     if desc_cfg:
#         per_topic = max(1, desc_cfg["count"] // len(weak_topics))

#         for topic in weak_topics:
#             ctx = fetch_topic_chunks(collection, topic)

#             prompt = f"""
# Generate {per_topic} DESCRIPTIVE REMEDIAL questions.

# Rules:
# - Focus on weak understanding
# - Emphasize concepts and reasoning
# - Bloom Level: {bloom}

# Topic: {topic}

# Context:
# {ctx}

# Return ONLY JSON array.
# """
#             raw = call_gemini(prompt)
#             qs = safe_json_extract(raw)

#             for q in qs:
#                 q["topic"] = topic
#                 questions.append(q)

#             if len([q for q in questions if q["type"] == "descriptive"]) >= desc_cfg["count"]:
#                 break

#     session = PracticeSession(
#         id=generate_id(),
#         chat_id=chat_id,
#         session_type="weak",
#         questions=json.dumps(questions)
#     )

#     db.session.add(session)
#     db.session.commit()

#     return jsonify({
#         "sessionId": session.id,
#         "questions": questions
#     })



@app.route("/api/chats/<chat_id>/questions/generate/weak", methods=["POST"])
def generate_weak_exam(chat_id):
    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    chat = Chat.query.get(chat_id)
    if not chat or chat.user_id != user.id:
        return jsonify({"error": "invalid chat"}), 403

    weak_topics_map = json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}
    if not weak_topics_map:
        return jsonify({"error": "No weak topics"}), 400

    exam_cfg = json.loads(chat.exam_config or "{}")
    mcq_cfg = exam_cfg.get("mcq") or {"count": 0, "marks": 1}
    desc_cfg = exam_cfg.get("descriptive") or {"count": 0, "marks": 10}
    bloom = chat.bloom_level or "understand"

    client = get_chroma_client()
    collection_name = chroma_collection_name(user.id, chat_id)
    collection = get_chroma_collection(client, collection_name)

    # allowed topics from DB
    db_topics = SubjectTopic.query.filter_by(chat_id=chat_id).all()
    allowed = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

    # sort weak topics by score/seen
    weak_topics = sorted(
        weak_topics_map.keys(),
        key=lambda t: (weak_topics_map.get(t, {}).get("score", 0.0),
                       weak_topics_map.get(t, {}).get("seen", 0)),
        reverse=True
    )

    questions = []

    # MCQs
    if mcq_cfg.get("count", 0) > 0:
        per_topic = max(1, mcq_cfg["count"] // max(len(weak_topics), 1))
        for topic in weak_topics:
            ctx = fetch_topic_chunks(collection, topic)
            prompt = f"""
Generate {per_topic} MCQs for REMEDIAL PRACTICE.

Rules:
- Focus on conceptual mistakes
- Bloom level: {bloom}
- 4 options
- One correct answer

Topic: {topic}

Context:
{ctx}

Return JSON array.
"""
            raw = call_gemini(prompt)
            qs = safe_json_extract(raw) or []
            for q in qs:
                q["topic"] = topic
                questions.append(q)

            if len([q for q in questions if q.get("type") == "mcq"]) >= mcq_cfg["count"]:
                break

    # Descriptive
    if desc_cfg.get("count", 0) > 0:
        per_topic = max(1, desc_cfg["count"] // max(len(weak_topics), 1))
        for topic in weak_topics:
            ctx = fetch_topic_chunks(collection, topic)
            prompt = f"""
Generate {per_topic} DESCRIPTIVE REMEDIAL questions.

Rules:
- Focus on weak understanding
- Emphasize concepts and reasoning
- Bloom Level: {bloom}

Topic: {topic}

Context:
{ctx}

Return ONLY JSON array.
"""
            raw = call_gemini(prompt)
            qs = safe_json_extract(raw) or []
            for q in qs:
                q["topic"] = topic
                questions.append(q)

            if len([q for q in questions if q.get("type") == "descriptive"]) >= desc_cfg["count"]:
                break

    # ✅ Normalize topics (even here)
    for q in questions:
        q["topic"] = map_to_closest_topic(q.get("topic", ""), allowed, threshold=0.35)

    session_id = generate_id()
    for i, q in enumerate(questions):
        q["id"] = f"{session_id}_q{i+1}"

    session = PracticeSession(
        id=session_id,
        chat_id=chat_id,
        session_type="weak",
        questions=json.dumps(questions)
    )
    db.session.add(session)
    db.session.commit()

    return jsonify({"sessionId": session.id, "questions": questions})


# ANSWER SUBMIT


# @app.route("/api/sessions/<sid>/submit", methods=["POST"])
# def submit_answers(sid):
#     user = get_user_from_token()
#     session = PracticeSession.query.get(sid)
#     if not session:
#         return jsonify({"error": "invalid session"}), 404

#     chat = Chat.query.get(session.chat_id)
#     if not chat or chat.user_id != user.id:
#         return jsonify({"error": "unauthorized"}), 403

#     data = request.json
#     answers = data.get("answers", {})
#     questions = json.loads(session.questions or "[]")

#     results = {}
#     weak_topics = []
#     topic_events = []

#     # ---------- 1) MCQs: deterministic grading ----------
#     mcq_payload_for_explanations = []

#     for q in questions:
#         qid = q["id"]
#         user_ans = answers.get(qid)
#         if user_ans is None or user_ans == "":
#             continue

#         if q["type"] == "mcq":
#             correct = q.get("answer")
#             is_correct = (user_ans == correct)
#             db_topics = SubjectTopic.query.filter_by(chat_id=chat.id).all()
#             allowed = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

#             topic_name = map_to_closest_topic(q.get("topic", "General"), allowed)
#             topic_events.append({"topic": topic_name, "correct": is_correct})

#             results[qid] = {
#                 "type": "mcq",
#                 "topic": q.get("topic", "General"),
#                 "question": q.get("question"),
#                 "userAnswer": user_ans,
#                 "correctAnswer": correct,
#                 "isCorrect": is_correct,
#                 "understandingScore": 10 if is_correct else 0,
#                 "explanation": ""  # fill next
#             }

#             if not is_correct:
#                 weak_topics.append(q.get("topic", "General"))
#                 mcq_payload_for_explanations.append({
#                     "id": qid,
#                     "question": q.get("question"),
#                     "options": q.get("options", []),
#                     "correctAnswer": correct,
#                     "userAnswer": user_ans
#                 })

#     # Generate explanations for wrong MCQs (optional: do for all)
#     if mcq_payload_for_explanations:
#         exp_prompt = f"""
# Generate short, student-friendly explanations for WHY the correct option is correct.

# Return ONLY JSON object keyed by question id:
# {{
#   "<question_id>": {{
#     "explanation": "..."
#   }}
# }}

# Data:
# {json.dumps(mcq_payload_for_explanations, indent=2)}
# """
#         exp_result = call_gemini(exp_prompt, expect_json=True)

#         for item in mcq_payload_for_explanations:
#             qid = item["id"]
#             if qid in results:
#                 results[qid]["explanation"] = exp_result.get(qid, {}).get("explanation", "")

#     # ---------- 2) Descriptive: Gemini evaluation + explanation ----------
#     desc_payload = []
#     for q in questions:
#         qid = q["id"]
#         user_ans = answers.get(qid)
#         if not user_ans:
#             continue
#         if q["type"] == "descriptive":
#             desc_payload.append({
#                 "id": qid,
#                 "question": q["question"],
#                 "answer": user_ans,
#                 "topic": q.get("topic", "General")
#             })

#     if desc_payload:
#         desc_prompt = f"""
# Evaluate student understanding for descriptive answers.

# Rules:
# - Focus on conceptual correctness
# - Ignore grammar
# - Do NOT grade like an exam

# Return ONLY JSON object keyed by the SAME question id:

# {{
#   "<question_id>": {{
#     "understandingScore": 0-10,
#     "coveredConcepts": [],
#     "missingConcepts": [],
#     "sampleAnswer": "A good answer would mention...",
#     "explanation": "Explain what was right/wrong and how to improve."
#   }}
# }}

# Data:
# {json.dumps(desc_payload, indent=2)}
# """
#         desc_result = call_gemini(desc_prompt, expect_json=True)

#         for item in desc_payload:
#             qid = item["id"]
#             r = desc_result.get(qid, {})
#             score = r.get("understandingScore", 0)
#             db_topics = SubjectTopic.query.filter_by(chat_id=chat.id).all()
#             allowed = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

#             topic_name = map_to_closest_topic(item.get("topic", "General"), allowed)
#             topic_events.append({"topic": topic_name, "correct": (score >= 6)})

#             results[qid] = {
#                 "type": "descriptive",
#                 "topic": item.get("topic", "General"),
#                 "question": item["question"],
#                 "userAnswer": item["answer"],
#                 "correctAnswer": None,
#                 "isCorrect": None,
#                 "understandingScore": score,
#                 "covered": r.get("coveredConcepts", []),
#                 "missing": r.get("missingConcepts", []),
#                 "sampleAnswer": r.get("sampleAnswer", ""),
#                 "explanation": r.get("explanation", "")
#             }

#             if score < 6:
#                 weak_topics.append(item.get("topic", "General"))

#     # ---------- 3) Overall score ----------
#     scores = [v.get("understandingScore", 0) for v in results.values()]
#     avg = sum(scores) / max(len(scores), 1)

#     session.score = avg
#     session.answers = json.dumps(answers)
#     session.weak_topics_json = json.dumps(weak_topics)
#     session.feedback_json = json.dumps(results)   # store the detailed per-question review
#     # ^ rename in UI, but keep in DB

#     # Update chat weak topics counts
#     # existing = json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}
#     # updated = update_weak_topics(existing, weak_topics)
#     # chat.weak_topics_json = json.dumps(updated)
#     existing = json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}
#     updated = update_topic_weakness(existing, topic_events, alpha=0.25)
#     chat.weak_topics_json = json.dumps(updated)

#     db.session.commit()
#     weak_list = top_weak_topics(updated, k=5)
#     return jsonify({
#         "score": avg,
#         "results": results,
#         "weakTopics": updated,
#         "weakTopicList": weak_list
#     })


@app.route("/api/sessions/<sid>/submit", methods=["POST"])
def submit_answers(sid):
    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    session = PracticeSession.query.get(sid)
    if not session:
        return jsonify({"error": "invalid session"}), 404

    chat = Chat.query.get(session.chat_id)
    if not chat or chat.user_id != user.id:
        return jsonify({"error": "unauthorized"}), 403

    data = request.json or {}
    answers = data.get("answers", {})
    questions = json.loads(session.questions or "[]")

    # ✅ get allowed topics ONCE
    db_topics = SubjectTopic.query.filter_by(chat_id=chat.id).all()
    allowed = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

    for q in questions:
        q["topic"] = map_to_closest_topic(q.get("topic", ""), allowed, threshold=0.35)

    results = {}
    weak_topics = []
    topic_events = []

    # ---------- MCQs deterministic ----------
    mcq_payload_for_explanations = []

    for q in questions:
        qid = q.get("id")
        user_ans = answers.get(qid)
        if not user_ans:
            continue

        if q.get("type") == "mcq":
            correct = q.get("answer")
            is_correct = (user_ans == correct)

            topic_name = map_to_closest_topic(q.get("topic", "General"), allowed)

            topic_events.append({"topic": topic_name, "correct": is_correct})

            results[qid] = {
                "type": "mcq",
                "topic": topic_name,              # ✅ mapped
                "question": q.get("question"),
                "userAnswer": user_ans,
                "correctAnswer": correct,
                "isCorrect": is_correct,
                "understandingScore": 10 if is_correct else 0,
                "explanation": ""
            }

            if not is_correct:
                weak_topics.append(topic_name)   # ✅ mapped
                mcq_payload_for_explanations.append({
                    "id": qid,
                    "question": q.get("question"),
                    "options": q.get("options", []),
                    "correctAnswer": correct,
                    "userAnswer": user_ans
                })

    if mcq_payload_for_explanations:
        exp_prompt = f"""
Generate short, student-friendly explanations for WHY the correct option is correct.

Return ONLY JSON object keyed by question id:
{{
  "<question_id>": {{
    "explanation": "..."
  }}
}}

Data:
{json.dumps(mcq_payload_for_explanations, indent=2)}
"""
        exp_result = call_gemini(exp_prompt, expect_json=True) or {}

        for item in mcq_payload_for_explanations:
            qid = item["id"]
            if qid in results:
                results[qid]["explanation"] = (exp_result.get(qid, {}) or {}).get("explanation", "")

    # ---------- Descriptive LLM eval ----------
    desc_payload = []
    for q in questions:
        qid = q.get("id")
        user_ans = answers.get(qid)
        if not user_ans:
            continue
        if q.get("type") == "descriptive":
            desc_payload.append({
                "id": qid,
                "question": q.get("question"),
                "answer": user_ans,
                "topic": q.get("topic", "General")
            })

    if desc_payload:
        desc_prompt = f"""
Evaluate student understanding for descriptive answers.

Rules:
- Focus on conceptual correctness
- Ignore grammar
- Do NOT grade like an exam

Return ONLY JSON object keyed by the SAME question id:

{{
  "<question_id>": {{
    "understandingScore": 0-10,
    "coveredConcepts": [],
    "missingConcepts": [],
    "sampleAnswer": "A good answer would mention...",
    "explanation": "Explain what was right/wrong and how to improve."
  }}
}}

Data:
{json.dumps(desc_payload, indent=2)}
"""
        desc_result = call_gemini(desc_prompt, expect_json=True) or {}

        for item in desc_payload:
            qid = item["id"]
            r = desc_result.get(qid, {}) or {}
            score = float(r.get("understandingScore", 0) or 0)

            topic_name = map_to_closest_topic(item.get("topic", "General"), allowed)  # ✅ item, not q

            topic_events.append({"topic": topic_name, "correct": (score >= 6)})       # ✅ correct flag

            results[qid] = {
                "type": "descriptive",
                "topic": topic_name,              # ✅ mapped
                "question": item.get("question"),
                "userAnswer": item.get("answer"),
                "correctAnswer": None,
                "isCorrect": None,
                "understandingScore": score,
                "covered": r.get("coveredConcepts", []),
                "missing": r.get("missingConcepts", []),
                "sampleAnswer": r.get("sampleAnswer", ""),
                "explanation": r.get("explanation", "")
            }

            if score < 6:
                weak_topics.append(topic_name)     # ✅ mapped

    # ---------- Overall ----------
    scores = [float(v.get("understandingScore", 0) or 0) for v in results.values()]
    avg = sum(scores) / max(len(scores), 1)

    session.score = avg
    session.answers = json.dumps(answers)
    session.weak_topics_json = json.dumps(weak_topics)
    session.feedback_json = json.dumps(results)

    existing = json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}
    updated = update_topic_weakness(existing, topic_events, alpha=0.25)
    chat.weak_topics_json = json.dumps(updated)

    db.session.commit()

    return jsonify({
        "score": avg,
        "results": results,
        "weakTopics": updated,
        "weakTopicList": top_weak_topics(updated, k=5)
    })



@app.route("/api/chats/<chat_id>/history", methods=["GET"])
def chat_history(chat_id):
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
            "feedback": json.loads(s.feedback_json) if s.feedback_json else {},  # ✅ NEW
            "createdAt": s.created_at.isoformat()
        })

    return jsonify(result)


@app.route("/debug/chroma/<chat_id>")
def debug_chroma(chat_id):

    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    client = get_chroma_client()
    name = chroma_collection_name(user.id, chat_id)

    # col = client.get_or_create_collection(name=name)
    col = get_chroma_collection(client, name)

    return {
        "collection": name,
        "count": col.count()
    }


@app.route("/api/pdfs/<pdf_id>/retry", methods=["POST"])
def retry_pdf(pdf_id):
    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    pdf = PDFDocument.query.get(pdf_id)
    if not pdf:
        return jsonify({"error": "not found"}), 404
    
    if not (pdf.error or pdf.pdf_type == "failed"):
        return jsonify({"error": "PDF is not in failed state"}), 400

    chat = Chat.query.get(pdf.chat_id)
    if not chat or chat.user_id != user.id:
        return jsonify({"error": "unauthorized"}), 403

    pdf.is_processed = False
    pdf.error = None
    pdf.pdf_type = "pending"
    db.session.commit()

    process_pdf_task.delay(pdf.id, user.id, pdf.chat_id, pdf.file_path)

    return jsonify({"status": "requeued"}), 202

if __name__ == "__main__":
    app.run(debug=False, port=5000, host="0.0.0.0", use_reloader=False)