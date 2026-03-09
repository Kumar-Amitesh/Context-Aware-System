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
    # if request.method == "GET":
    #     chats = (
    #         Chat.query
    #         .filter_by(user_id=user.id)
    #         .order_by(Chat.created_at.desc())
    #         .all()
    #     )

    #     return jsonify([
    #         {
    #             "chatId": chat.id,
    #             "examType": chat.exam_type,
    #             "createdAt": chat.created_at.isoformat(),
    #             # "weakTopics": chat.get_weak_topics_summary(),
    #             "weakTopics": top_weak_topics(json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}, k=5),
    #             "pdfCount": len(chat.pdfs),
    #             "subject": (json.loads(chat.exam_config or "{}").get("subject")),
    #             "bloomLevels": parse_bloom_levels(chat.bloom_level)
    #         }
    #         for chat in chats
    #     ])

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
                "weakTopics": top_weak_topics(json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}, k=5),
                "pdfCount": len(chat.pdfs),
                "subject": (json.loads(chat.exam_config or "{}").get("subject")),
                "bloomLevels": parse_bloom_levels(chat.bloom_level),
                "examConfig": json.loads(chat.exam_config or "{}"),   # ✅ added
                "analytics": summarize_topic_analytics(
                    json.loads(chat.weak_topics_json) if chat.weak_topics_json else {},
                    top_k=3
                )
            }
            for chat in chats
        ])

    data = request.json or {}

    # chat = Chat(
    #     id=generate_id(),
    #     user_id=user.id,
    #     exam_type=data["examType"],
    #     bloom_level=data.get("bloom"),
    #     exam_config=json.dumps(data["examConfig"])
    # )

    bloom_levels = data.get("bloomLevels") or data.get("blooms") or []
    if not bloom_levels and data.get("bloom"):
        bloom_levels = [data.get("bloom")]

    chat = Chat(
        id=generate_id(),
        user_id=user.id,
        exam_type=data["examType"],
        bloom_level=json.dumps(bloom_levels or ["Understand"]),
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
        # delete file
        try:
            if os.path.exists(path):
                os.remove(path)
        except:
            pass
        return jsonify({
            "error": "This PDF was already uploaded in this chat.",
            "pdfId": existing.id,
            "status": "duplicate"
        }), 409

    # ✅ If it exists but is pending/processing, also block
    if existing and not existing.error and not existing.is_processed:
        try:
            if os.path.exists(path):
                os.remove(path)
        except:
            pass

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
    if not user:
        return jsonify({"error": "unauthorized"}), 401

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
    
    successful_pdf_count = PDFDocument.query.filter_by(
        chat_id=chat_id,
        is_processed=True
    ).filter(PDFDocument.error.is_(None)).count()

    if successful_pdf_count == 0:
        return jsonify({"error": "At least one successfully processed PDF is required"}), 400

    exam_cfg = json.loads(chat.exam_config or "{}")
    # mcq_cfg = exam_cfg.get("mcq") or {"count": 0, "marks": 1}
    # desc_cfg = exam_cfg.get("descriptive") or {"count": 0, "marks": 10}
    # bloom = chat.bloom_level or "understand"

    question_types = get_question_types_config(exam_cfg)
    bloom_levels = parse_bloom_levels(chat.bloom_level)
    bloom_prompt = ", ".join(bloom_levels)

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
    # if mcq_cfg.get("count", 0) > 0:
    #     prompt = f"""
    # Generate {mcq_cfg["count"]} MCQs.
    #
    # Allowed topics (choose topic EXACTLY from this list):
    # {json.dumps(allowed, indent=2)}
    #
    # If PYQ topic frequency is available, bias questions toward frequently asked topics:
    # PYQ topicFrequency:
    # {json.dumps(pyq_freq, indent=2)}
    #
    # Topic weight distribution (optional bias): 
    # {json.dumps(weights_small, indent=2)}
    #
    # Rules:
    # - Bloom level: {bloom}
    # - 4 options
    # - One correct answer
    # - Moderate difficulty
    #
    # Context:
    # {merged_context}
    #
    # Return JSON array with fields:
    # id, type="mcq", question, options, answer, topic
    # """
    #     raw = call_gemini(prompt)
    #     questions += safe_json_extract(raw)

    for qtype, cfg in question_types.items():
        count = int(cfg.get("count", 0) or 0)
        if count <= 0:
            continue

        if qtype == "mcq":
            prompt = f"""
Generate {count} MCQs.

Allowed topics (choose topic EXACTLY from this list):
{json.dumps(allowed, indent=2)}

If PYQ topic frequency is available, bias questions toward frequently asked topics:
PYQ topicFrequency:
{json.dumps(pyq_freq, indent=2)}

Topic weight distribution (optional bias): 
{json.dumps(weights_small, indent=2)}

Rules:
- Target Bloom levels: {bloom_prompt}
- Include bloomLevel field as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- bloomLevel must be chosen from these allowed target levels: {bloom_prompt}
- Generate a natural mix of easy, medium, and hard questions across the full set
- 4 options
- One correct answer
- Return answer as ONE CAPITAL LETTER only: A / B / C / D
- Include difficulty field as one of: easy, medium, hard

Context:
{merged_context}

Return JSON array with fields:
id, type="mcq", question, options, answer, topic, difficulty, bloomLevel
"""
            raw = call_gemini(prompt)
            questions += safe_json_extract(raw)

        elif qtype == "fill_blank":
            prompt = f"""
Generate {count} fill in the blank questions.

Allowed topics (choose topic EXACTLY from this list):
{json.dumps(allowed, indent=2)}

If PYQ topic frequency is available, bias questions toward frequently asked topics:
PYQ topicFrequency:
{json.dumps(pyq_freq, indent=2)}

Topic weight distribution (optional bias): 
{json.dumps(weights_small, indent=2)}

Rules:
- Target Bloom levels: {bloom_prompt}
- Include bloomLevel field as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- bloomLevel must be chosen from these allowed target levels: {bloom_prompt}
- Generate a natural mix of easy, medium, and hard questions across the full set
- The question must clearly contain a blank like _____
- Return answer as short text
- Include difficulty field as one of: easy, medium, hard

Context:
{merged_context}

Return JSON array with fields:
id, type="fill_blank", question, answer, acceptedAnswers, topic, difficulty, bloomLevel

Rules for acceptedAnswers:
- Must be a JSON array
- Include 2 to 5 valid variants where appropriate
- Include capitalization/hyphen variants only when meaningful
- Do not include vague or overly broad synonyms
"""
            raw = call_gemini(prompt)
            questions += safe_json_extract(raw)

        elif qtype == "true_false":
            prompt = f"""
Generate {count} true/false questions.

Allowed topics (choose topic EXACTLY from this list):
{json.dumps(allowed, indent=2)}

If PYQ topic frequency is available, bias questions toward frequently asked topics:
PYQ topicFrequency:
{json.dumps(pyq_freq, indent=2)}

Topic weight distribution (optional bias): 
{json.dumps(weights_small, indent=2)}

Rules:
- Target Bloom levels: {bloom_prompt}
- Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
- Generate a natural mix of easy, medium, and hard questions across the full set
- Return answer as exactly "True" or "False"
- Include difficulty field as one of: easy, medium, hard

Context:
{merged_context}

Return JSON array with fields:
id, type="true_false", question, answer, topic, difficulty, bloomLevel
"""
            raw = call_gemini(prompt)
            questions += safe_json_extract(raw)

        elif qtype == "descriptive":
            prompt = f"""
Generate {count} descriptive questions.

Allowed topics (choose topic EXACTLY from this list):
{json.dumps(allowed, indent=2)}

If PYQ topic frequency is available, bias questions toward frequently asked topics:
PYQ topicFrequency:
{json.dumps(pyq_freq, indent=2)}

Rules:
- Target Bloom levels: {bloom_prompt}
- Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
- Generate a natural mix of easy, medium, and hard questions across the full set
- Include difficulty field as one of: easy, medium, hard

Context:
{merged_context}

Return JSON array with:
id, type="descriptive", question, topic, difficulty, bloomLevel
"""
            raw = call_gemini(prompt)
            questions += safe_json_extract(raw)

    # ✅ Normalize ALL topics once
    for q in questions:
        q["topic"] = map_to_closest_topic(q.get("topic", ""), allowed, threshold=0.35)
        q["difficulty"] = str(q.get("difficulty", "medium")).strip().lower()
        if q["difficulty"] not in {"easy", "medium", "hard"}:
            q["difficulty"] = "medium"

        q["bloomLevel"] = pick_bloom_level_for_question(q, bloom_levels)

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
    # mcq_cfg = exam_cfg.get("mcq") or {"count": 0, "marks": 1}
    # desc_cfg = exam_cfg.get("descriptive") or {"count": 0, "marks": 10}
    # bloom = chat.bloom_level or "understand"

    question_types = get_question_types_config(exam_cfg)
    bloom_levels = parse_bloom_levels(chat.bloom_level)
    bloom_prompt = ", ".join(bloom_levels)

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
    # if mcq_cfg.get("count", 0) > 0:
    #     per_topic = max(1, mcq_cfg["count"] // max(len(weak_topics), 1))
    #     for topic in weak_topics:
    #         ctx = fetch_topic_chunks(collection, topic)
    #         prompt = f"""
    # Generate {per_topic} MCQs for REMEDIAL PRACTICE.
    #
    # Rules:
    # - Focus on conceptual mistakes
    # - Bloom level: {bloom}
    # - 4 options
    # - One correct answer
    #
    # Topic: {topic}
    #
    # Context:
    # {ctx}
    #
    # Return JSON array.
    # """
    #         raw = call_gemini(prompt)
    #         qs = safe_json_extract(raw) or []
    #         for q in qs:
    #             q["topic"] = topic
    #             questions.append(q)
    #
    #         if len([q for q in questions if q.get("type") == "mcq"]) >= mcq_cfg["count"]:
    #             break

#     for qtype, cfg in question_types.items():
#         count = int(cfg.get("count", 0) or 0)
#         if count <= 0:
#             continue

#         per_topic = max(1, count // max(len(weak_topics), 1))
#         collected_for_type = 0

#         for topic in weak_topics:
#             ctx = fetch_topic_chunks(collection, topic)

#             if qtype == "mcq":
#                 prompt = f"""
# Generate {per_topic} MCQs for REMEDIAL PRACTICE.

# Rules:
# - Focus on conceptual mistakes
# - Target Bloom levels: {bloom_prompt}
# - Generate a natural mix of easy, medium, and hard questions
# - 4 options
# - One correct answer
# - Return answer as ONE CAPITAL LETTER only: A / B / C / D
# - Include difficulty field as one of: easy, medium, hard

# Topic: {topic}

# Context:
# {ctx}

# Return ONLY JSON array with:
# id, type="mcq", question, options, answer, topic, difficulty
# """
#             elif qtype == "fill_blank":
#                 prompt = f"""
# Generate {per_topic} fill in the blank REMEDIAL questions.

# Rules:
# - Focus on conceptual mistakes
# - Target Bloom levels: {bloom_prompt}
# - Generate a natural mix of easy, medium, and hard questions
# - Use _____ in the question
# - Return answer as short text
# - Include difficulty field as one of: easy, medium, hard

# Topic: {topic}

# Context:
# {ctx}

# Return ONLY JSON array with:
# id, type="fill_blank", question, answer, topic, difficulty
# """
#             elif qtype == "true_false":
#                 prompt = f"""
# Generate {per_topic} true/false REMEDIAL questions.

# Rules:
# - Focus on conceptual mistakes
# - Target Bloom levels: {bloom_prompt}
# - Generate a natural mix of easy, medium, and hard questions
# - Return answer exactly as "True" or "False"
# - Include difficulty field as one of: easy, medium, hard

# Topic: {topic}

# Context:
# {ctx}

# Return ONLY JSON array with:
# id, type="true_false", question, answer, topic, difficulty
# """
#             else:
#                 prompt = f"""
# Generate {per_topic} DESCRIPTIVE REMEDIAL questions.

# Rules:
# - Focus on weak understanding
# - Emphasize concepts and reasoning
# - Target Bloom levels: {bloom_prompt}
# - Generate a natural mix of easy, medium, and hard questions
# - Include difficulty field as one of: easy, medium, hard

# Topic: {topic}

# Context:
# {ctx}

# Return ONLY JSON array with:
# id, type="descriptive", question, topic, difficulty
# """

#             raw = call_gemini(prompt)
#             qs = safe_json_extract(raw) or []
#             for q in qs:
#                 q["topic"] = topic
#                 q["type"] = q.get("type") or qtype
#                 questions.append(q)
#                 collected_for_type += 1

#             if collected_for_type >= count:
#                 break


    for qtype, cfg in question_types.items():
        count = int(cfg.get("count", 0) or 0)
        if count <= 0:
            continue

        remaining = count
        topic_index = 0
        per_round = 1

        while remaining > 0 and weak_topics:
            topic = weak_topics[topic_index % len(weak_topics)]
            ctx = fetch_topic_chunks(collection, topic)

            ask_count = min(per_round, remaining)

            if qtype == "mcq":
                prompt = f"""
Generate {ask_count} MCQs for REMEDIAL PRACTICE.

Rules:
- Focus on conceptual mistakes
- Target Bloom levels: {bloom_prompt}
- Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
- Generate a natural mix of easy, medium, and hard questions
- 4 options
- One correct answer
- Return answer as ONE CAPITAL LETTER only: A / B / C / D
- Include difficulty field as one of: easy, medium, hard

Topic: {topic}

Context:
{ctx}

Return ONLY JSON array with:
id, type="mcq", question, options, answer, topic, difficulty, bloomLevel
"""
            elif qtype == "fill_blank":
                prompt = f"""
Generate {ask_count} fill in the blank REMEDIAL questions.

Rules:
- Focus on conceptual mistakes
- Target Bloom levels: {bloom_prompt}
- Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
- Generate a natural mix of easy, medium, and hard questions
- Use _____ in the question
- Return answer as short text
- Include difficulty field as one of: easy, medium, hard

Topic: {topic}

Context:
{ctx}

Return ONLY JSON array with:
id, type="fill_blank", question, answer, acceptedAnswers, topic, difficulty, bloomLevel
"""
            elif qtype == "true_false":
                prompt = f"""
Generate {ask_count} true/false REMEDIAL questions.

Rules:
- Focus on conceptual mistakes
- Target Bloom levels: {bloom_prompt}
- Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
- Generate a natural mix of easy, medium, and hard questions
- Return answer exactly as "True" or "False"
- Include difficulty field as one of: easy, medium, hard

Topic: {topic}

Context:
{ctx}

Return ONLY JSON array with:
id, type="true_false", question, answer, topic, difficulty, bloomLevel
"""
            else:
                prompt = f"""
Generate {ask_count} DESCRIPTIVE REMEDIAL questions.

Rules:
- Focus on weak understanding
- Emphasize concepts and reasoning
- Target Bloom levels: {bloom_prompt}
- Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
- Generate a natural mix of easy, medium, and hard questions
- Include difficulty field as one of: easy, medium, hard

Topic: {topic}

Context:
{ctx}

Return ONLY JSON array with:
id, type="descriptive", question, topic, difficulty, bloomLevel
"""

            raw = call_gemini(prompt)
            qs = safe_json_extract(raw) or []

            qs = qs[:ask_count]

            for q in qs:
                q["topic"] = topic
                q["type"] = q.get("type") or qtype
                questions.append(q)

            remaining -= len(qs)
            topic_index += 1

            # fallback stop if model keeps returning nothing
            if topic_index > len(weak_topics) * 3 and remaining > 0:
                break

    # ✅ Normalize topics (even here)
    for q in questions:
        q["topic"] = map_to_closest_topic(q.get("topic", ""), allowed, threshold=0.35)
        q["difficulty"] = str(q.get("difficulty", "medium")).strip().lower()
        if q["difficulty"] not in {"easy", "medium", "hard"}:
            q["difficulty"] = "medium"

        q["bloomLevel"] = pick_bloom_level_for_question(q, bloom_levels)

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

    exam_cfg = json.loads(chat.exam_config or "{}")
    question_types_cfg = get_question_types_config(exam_cfg)

    results = {}
    weak_topics = []
    topic_events = []

    # ---------- MCQs deterministic ----------
    mcq_payload_for_explanations = []

    total_possible_marks = 0.0
    total_awarded_marks = 0.0

    for q in questions:
        qid = q.get("id")
        qtype = q.get("type")
        qcfg = question_types_cfg.get(qtype, default_question_type_config(qtype))
        max_marks = float(qcfg.get("marks", 0) or 0)
        negative_marks = float(qcfg.get("negativeMarks", 0) or 0)

        total_possible_marks += max_marks

        user_ans = answers.get(qid)
        if user_ans in [None, ""]:
            # unanswered => zero marks
            continue

        # if qtype == "mcq":
        #     correct = q.get("answer")
        #     is_correct = compare_objective_answer(user_ans, correct, qtype=qtype)

        #     topic_name = map_to_closest_topic(q.get("topic", "General"), allowed)

        #     topic_events.append({"topic": topic_name, "correct": is_correct})

        #     awarded_marks = max_marks if is_correct else (-negative_marks if negative_marks > 0 else 0.0)
        #     total_awarded_marks += awarded_marks

        #     results[qid] = {
        #         "type": "mcq",
        #         "topic": topic_name,              # ✅ mapped
        #         "question": q.get("question"),
        #         "userAnswer": user_ans,
        #         "correctAnswer": correct,
        #         "isCorrect": is_correct,
        #         "understandingScore": 10 if is_correct else 0,
        #         "awardedMarks": awarded_marks,
        #         "maxMarks": max_marks,
        #         "negativeMarks": negative_marks,
        #         "difficulty": q.get("difficulty"),
        #         "explanation": ""
        #     }

        #     if not is_correct:
        #         weak_topics.append(topic_name)   # ✅ mapped
        #         mcq_payload_for_explanations.append({
        #             "id": qid,
        #             "question": q.get("question"),
        #             "options": q.get("options", []),
        #             "correctAnswer": correct,
        #             "userAnswer": user_ans,
        #             "type": "mcq"
        #         })

        if qtype == "mcq":
            correct = q.get("answer")
            is_correct = compare_objective_answer(user_ans, correct, qtype=qtype)
            topic_name = map_to_closest_topic(q.get("topic", "General"), allowed)

            awarded_marks = max_marks if is_correct else (-negative_marks if negative_marks > 0 else 0.0)
            total_awarded_marks += awarded_marks

            score_ratio = 1.0 if is_correct else 0.0

            # topic_events.append({
            #     "topic": topic_name,
            #     "correct": is_correct,
            #     "difficulty": q.get("difficulty", "medium"),
            #     "score_ratio": score_ratio
            # })
            topic_events.append({
                "topic": topic_name,
                "correct": is_correct,
                "difficulty": q.get("difficulty", "medium"),
                "score_ratio": score_ratio,
                "question_type": "mcq",
                "bloom_level": q.get("bloomLevel", "Understand")
            })

            results[qid] = {
                "type": "mcq",
                "topic": topic_name,
                "question": q.get("question"),
                "userAnswer": user_ans,
                "correctAnswer": correct,
                "isCorrect": is_correct,
                "understandingScore": 10 if is_correct else 0,
                "awardedMarks": awarded_marks,
                "maxMarks": max_marks,
                "negativeMarks": negative_marks,
                "difficulty": q.get("difficulty"),
                "explanation": "",
                "bloomLevel": q.get("bloomLevel", "Understand"),
            }

            if not is_correct:
                weak_topics.append(topic_name)

            mcq_payload_for_explanations.append({
                "id": qid,
                "question": q.get("question"),
                "options": q.get("options", []),
                "correctAnswer": correct,
                "userAnswer": user_ans,
                "type": "mcq"
            })

        # elif qtype == "true_false":
        #     correct = q.get("answer")
        #     is_correct = compare_objective_answer(user_ans, correct, qtype=qtype)

        #     topic_name = map_to_closest_topic(q.get("topic", "General"), allowed)
        #     topic_events.append({"topic": topic_name, "correct": is_correct})

        #     awarded_marks = max_marks if is_correct else (-negative_marks if negative_marks > 0 else 0.0)
        #     total_awarded_marks += awarded_marks

        #     results[qid] = {
        #         "type": "true_false",
        #         "topic": topic_name,
        #         "question": q.get("question"),
        #         "userAnswer": user_ans,
        #         "correctAnswer": correct,
        #         "isCorrect": is_correct,
        #         "understandingScore": 10 if is_correct else 0,
        #         "awardedMarks": awarded_marks,
        #         "maxMarks": max_marks,
        #         "negativeMarks": negative_marks,
        #         "difficulty": q.get("difficulty"),
        #         "explanation": ""
        #     }

        #     if not is_correct:
        #         weak_topics.append(topic_name)
        #         mcq_payload_for_explanations.append({
        #             "id": qid,
        #             "question": q.get("question"),
        #             "correctAnswer": correct,
        #             "userAnswer": user_ans,
        #             "type": "true_false"
        #         })

        elif qtype == "true_false":
            correct = q.get("answer")
            is_correct = compare_objective_answer(user_ans, correct, qtype=qtype)
            topic_name = map_to_closest_topic(q.get("topic", "General"), allowed)

            awarded_marks = max_marks if is_correct else (-negative_marks if negative_marks > 0 else 0.0)
            total_awarded_marks += awarded_marks

            score_ratio = 1.0 if is_correct else 0.0

            # topic_events.append({
            #     "topic": topic_name,
            #     "correct": is_correct,
            #     "difficulty": q.get("difficulty", "medium"),
            #     "score_ratio": score_ratio
            # })
            topic_events.append({
                "topic": topic_name,
                "correct": is_correct,
                "difficulty": q.get("difficulty", "medium"),
                "score_ratio": score_ratio,
                "question_type": "true_false",
                "bloom_level": q.get("bloomLevel", "Understand")
            })

            results[qid] = {
                "type": "true_false",
                "topic": topic_name,
                "question": q.get("question"),
                "userAnswer": user_ans,
                "correctAnswer": correct,
                "isCorrect": is_correct,
                "understandingScore": 10 if is_correct else 0,
                "awardedMarks": awarded_marks,
                "maxMarks": max_marks,
                "negativeMarks": negative_marks,
                "difficulty": q.get("difficulty"),
                "explanation": "",
                "bloomLevel": q.get("bloomLevel", "Understand"),
            }

            if not is_correct:
                weak_topics.append(topic_name)

            mcq_payload_for_explanations.append({
                "id": qid,
                "question": q.get("question"),
                "correctAnswer": correct,
                "userAnswer": user_ans,
                "type": "true_false"
            })

        # elif qtype == "fill_blank":
        #     correct = q.get("answer")
        #     is_correct = compare_objective_answer(user_ans, correct, qtype=qtype)

        #     topic_name = map_to_closest_topic(q.get("topic", "General"), allowed)
        #     topic_events.append({"topic": topic_name, "correct": is_correct})

        #     awarded_marks = max_marks if is_correct else (-negative_marks if negative_marks > 0 else 0.0)
        #     total_awarded_marks += awarded_marks

        #     results[qid] = {
        #         "type": "fill_blank",
        #         "topic": topic_name,
        #         "question": q.get("question"),
        #         "userAnswer": user_ans,
        #         "correctAnswer": correct,
        #         "isCorrect": is_correct,
        #         "understandingScore": 10 if is_correct else 0,
        #         "awardedMarks": awarded_marks,
        #         "maxMarks": max_marks,
        #         "negativeMarks": negative_marks,
        #         "difficulty": q.get("difficulty"),
        #         "explanation": ""
        #     }

        #     if not is_correct:
        #         weak_topics.append(topic_name)
        #         mcq_payload_for_explanations.append({
        #             "id": qid,
        #             "question": q.get("question"),
        #             "correctAnswer": correct,
        #             "userAnswer": user_ans,
        #             "type": "fill_blank"
        #         })

        elif qtype == "fill_blank":
            # correct = q.get("answer")
            # is_correct = compare_objective_answer(user_ans, correct, qtype=qtype)

            correct = q.get("answer")
            accepted = q.get("acceptedAnswers") or correct
            is_correct = compare_objective_answer(user_ans, accepted, qtype=qtype)
            topic_name = map_to_closest_topic(q.get("topic", "General"), allowed)

            awarded_marks = max_marks if is_correct else (-negative_marks if negative_marks > 0 else 0.0)
            total_awarded_marks += awarded_marks

            score_ratio = 1.0 if is_correct else 0.0

            # topic_events.append({
            #     "topic": topic_name,
            #     "correct": is_correct,
            #     "difficulty": q.get("difficulty", "medium"),
            #     "score_ratio": score_ratio
            # })
            topic_events.append({
                "topic": topic_name,
                "correct": is_correct,
                "difficulty": q.get("difficulty", "medium"),
                "score_ratio": score_ratio,
                "question_type": "fill_blank",
                "bloom_level": q.get("bloomLevel", "Understand")
            })

            results[qid] = {
                "type": "fill_blank",
                "topic": topic_name,
                "question": q.get("question"),
                "userAnswer": user_ans,
                "correctAnswer": correct,
                "isCorrect": is_correct,
                "understandingScore": 10 if is_correct else 0,
                "awardedMarks": awarded_marks,
                "maxMarks": max_marks,
                "negativeMarks": negative_marks,
                "difficulty": q.get("difficulty"),
                "explanation": "",
                "bloomLevel": q.get("bloomLevel", "Understand"),
            }

            if not is_correct:
                weak_topics.append(topic_name)

            mcq_payload_for_explanations.append({
                "id": qid,
                "question": q.get("question"),
                "correctAnswer": correct,
                "userAnswer": user_ans,
                "type": "fill_blank"
            })

    if mcq_payload_for_explanations:
        exp_prompt = f"""
Generate short, student-friendly explanations.

Rules:
- For MCQ: explain why the correct option is correct
- For true/false: explain why the statement is true or false
- For fill in the blank: explain the correct missing term/phrase
- Return ONLY JSON object keyed by question id

Return format:
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
            qcfg = question_types_cfg.get("descriptive", default_question_type_config("descriptive"))
            # desc_payload.append({
            #     "id": qid,
            #     "question": q.get("question"),
            #     "answer": user_ans,
            #     "topic": q.get("topic", "General"),
            #     "difficulty": q.get("difficulty"),
            #     "marks": float(qcfg.get("marks", 0) or 0),
            #     "negativeMarks": float(qcfg.get("negativeMarks", 0) or 0)
            # })
            desc_payload.append({
                "id": qid,
                "question": q.get("question"),
                "answer": user_ans,
                "topic": q.get("topic", "General"),
                "difficulty": q.get("difficulty"),
                "bloomLevel": q.get("bloomLevel", "Understand"),
                "marks": float(qcfg.get("marks", 0) or 0),
                "negativeMarks": float(qcfg.get("negativeMarks", 0) or 0)
            })

    if desc_payload:
        desc_prompt = f"""
Evaluate student understanding for descriptive answers.

Rules:
- Focus on conceptual correctness
- Ignore grammar
- Do NOT grade like an exam
- understandingScore must be between 0 and 10
- Return ONLY JSON object keyed by the SAME question id

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

            # topic_events.append({"topic": topic_name, "correct": (score >= 6)})       # ✅ correct flag

            score_ratio = max(0.0, min(1.0, score / 10.0))

            # topic_events.append({
            #     "topic": topic_name,
            #     "correct": (score >= 6),
            #     "difficulty": item.get("difficulty", "medium"),
            #     "score_ratio": score_ratio
            # })
            topic_events.append({
                "topic": topic_name,
                "correct": (score >= 6),
                "difficulty": item.get("difficulty", "medium"),
                "score_ratio": score_ratio,
                "question_type": "descriptive",
                "bloom_level": item.get("bloomLevel", "Understand")
            })

            max_marks = float(item.get("marks", 0) or 0)
            # descriptive_negative = float(item.get("negativeMarks", 0) or 0)
            # NOTE:
            # negative marking is NOT applied to descriptive answers because they are partially scored by understanding level.
            descriptive_negative = 0.0

            awarded_marks = round((score / 10.0) * max_marks, 2)
            total_awarded_marks += awarded_marks

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
                "explanation": r.get("explanation", ""),
                "awardedMarks": awarded_marks,
                "maxMarks": max_marks,
                "negativeMarks": descriptive_negative,
                "difficulty": item.get("difficulty"),
                "bloomLevel": item.get("bloomLevel", "Understand"),
            }

            if score < 6:
                weak_topics.append(topic_name)     # ✅ mapped

    # ---------- Overall ----------
    # scores = [float(v.get("understandingScore", 0) or 0) for v in results.values()]
    # avg = sum(scores) / max(len(scores), 1)

    # session.score = avg
    normalized_score = 0.0
    if total_possible_marks > 0:
        normalized_score = round(max(0.0, (total_awarded_marks / total_possible_marks) * 10.0), 2)

    session.score = normalized_score
    session.answers = json.dumps(answers)
    session.weak_topics_json = json.dumps(weak_topics)
    session.feedback_json = json.dumps(results)

    existing = json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}
    updated = update_topic_weakness(existing, topic_events, alpha=0.25)
    chat.weak_topics_json = json.dumps(updated)

    db.session.commit()

    return jsonify({
        # "score": avg,
        "score": normalized_score,
        "rawMarks": round(total_awarded_marks, 2),
        "totalMarks": round(total_possible_marks, 2),
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





























# from flask import Flask, request, jsonify
# from flask_cors import CORS
# from models import *
# from utils import *
# import os
# import json
# from werkzeug.utils import secure_filename
# from celery_worker import process_pdf_task
# from extensions import db, celery
# from logger import get_logger
# import hashlib
# logger = get_logger("server")


# app = Flask(__name__)
# CORS(app, origin="*", supports_credentials=True)

# # CONFIG 

# app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
# app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
# app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
# app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# app.config['UPLOAD_FOLDER'] = "uploads"

# os.makedirs("uploads", exist_ok=True)

# db.init_app(app)

# celery.conf.update(app.config)

# with app.app_context():
#     db.create_all()


# def sha256_file(path: str) -> str:
#     h = hashlib.sha256()
#     with open(path, "rb") as f:
#         for chunk in iter(lambda: f.read(1024 * 1024), b""):
#             h.update(chunk)
#     return h.hexdigest()


# # AUTH

# def get_user_from_token():
#     token = request.headers.get('Authorization')
#     if token and token.startswith('Bearer '):
#         token = token[7:]
#         user_id = verify_token(token)
#         if user_id:
#             return User.query.get(user_id)
#     return None

# # BASIC 

# @app.route('/', methods=['GET'])
# def home():
#     return jsonify({"message": "Exam Prep AI Backend Running"}), 200

# # AUTH ROUTES

# @app.route('/api/auth/register', methods=['POST'])
# def register():
#     data = request.json

#     if User.query.filter_by(email=data['email']).first():
#         return jsonify({'error': 'User already exists'}), 400

#     user = User(
#         id=generate_id(),
#         email=data['email'],
#         name=data['name'],
#         password_hash=hash_password(data['password'])
#     )

#     db.session.add(user)
#     db.session.commit()

#     token = generate_token(user.id)

#     return jsonify({
#         'token': token,
#         'user': {
#             'id': user.id,
#             'email': user.email,
#             'name': user.name
#         }
#     }), 201


# @app.route('/api/auth/login', methods=['POST'])
# def login():
#     data = request.json

#     user = User.query.filter_by(email=data['email']).first()

#     if not user or not verify_password(user.password_hash, data['password']):
#         return jsonify({'error': 'Invalid credentials'}), 401

#     token = generate_token(user.id)

#     return jsonify({
#         'token': token,
#         'user': {
#             'id': user.id,
#             'email': user.email,
#             'name': user.name
#         }
#     })


# # CHAT CREATE 

# @app.route("/api/chats", methods=["GET","POST"])
# def create_chat():

#     user = get_user_from_token()
#     if not user:
#         return jsonify({"error": "unauthorized"}), 401

#     # GET: list chats
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
#                 # "weakTopics": chat.get_weak_topics_summary(),
#                 "weakTopics": top_weak_topics(json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}, k=5),
#                 "pdfCount": len(chat.pdfs),
#                 "subject": (json.loads(chat.exam_config or "{}").get("subject"))
#             }
#             for chat in chats
#         ])

#     data = request.json

#     chat = Chat(
#         id=generate_id(),
#         user_id=user.id,
#         exam_type=data["examType"],
#         bloom_level=data.get("bloom"),
#         exam_config=json.dumps(data["examConfig"])
#     )

#     db.session.add(chat)
#     db.session.commit()

#     return jsonify({"chatId": chat.id})


# # PDF UPLOAD

# @app.route("/api/chats/<chat_id>/pdfs", methods=["POST"])
# def upload_pdf(chat_id):

#     user = get_user_from_token()
#     if not user:
#         return jsonify({"error": "unauthorized"}), 401
#     chat = Chat.query.get(chat_id)

#     if not chat or chat.user_id != user.id:
#         return jsonify({"error": "invalid chat"}), 403

#     file = request.files["pdf"]

#     original_name = secure_filename(file.filename)
#     unique_name = f"{generate_id()}_{original_name}"
#     path = os.path.join(app.config["UPLOAD_FOLDER"], unique_name)

#     file.save(path)

#     file_hash = sha256_file(path)

#     existing = (PDFDocument.query
#         .filter_by(chat_id=chat_id, file_hash=file_hash)
#         .order_by(PDFDocument.uploaded_at.desc())
#         .first()
#     )

#     # ✅ Block re-upload if already uploaded and not failed
#     if existing and not existing.error and existing.is_processed:
#         return jsonify({
#             "error": "This PDF was already uploaded in this chat.",
#             "pdfId": existing.id,
#             "status": "duplicate"
#         }), 409

#     # ✅ If it exists but is pending/processing, also block
#     if existing and not existing.error and not existing.is_processed:
#         return jsonify({
#             "error": "This PDF is already uploaded and still processing.",
#             "pdfId": existing.id,
#             "status": "duplicate_processing"
#         }), 409

#     # ✅ If it exists and failed/error => REUSE + retry instead of creating new row
#     if existing and (existing.error or existing.pdf_type == "failed"):
#         existing.filename = original_name
#         existing.file_path = path
#         existing.file_hash = file_hash
#         existing.pdf_type = "pending"
#         existing.is_processed = False
#         existing.error = None
#         db.session.commit()

#         process_pdf_task.delay(existing.id, user.id, chat_id, path)

#         return jsonify({
#             "pdfId": existing.id,
#             "status": "requeued",
#             "processing": True
#         }), 202


#     # PDF TYPE WILL BE DETECTED INSIDE CELERY
#     pdf = PDFDocument(
#         id=generate_id(),
#         chat_id=chat_id,
#         filename=original_name,
#         file_path=path,
#         file_hash=file_hash,
#         pdf_type="pending",     # temporary placeholder
#         is_processed=False
#     )

#     db.session.add(pdf)
#     db.session.commit()

#     # async processing
#     process_pdf_task.delay(
#         pdf.id,
#         user.id,
#         chat_id,
#         path
#     )
#     logger.info(f"PDF uploaded → {original_name}")
#     logger.info(f"Saved path → {path}")
#     logger.info("Triggering Celery PDF processing")

#     return jsonify({
#         "pdfId": pdf.id,
#         "status": "uploaded",
#         "processing": True
#     }), 202

    


# @app.route("/api/chats/<chat_id>/pdfs", methods=["GET"])
# def list_pdfs(chat_id):
#     user = get_user_from_token()
#     chat = Chat.query.get(chat_id)

#     if not chat or chat.user_id != user.id:
#         return jsonify({"error": "unauthorized"}), 403

#     return jsonify([
#         {
#             "pdfId": pdf.id,
#             "filename": pdf.filename,
#             "type": pdf.pdf_type,
#             "processed": pdf.is_processed,
#             "error": pdf.error, 
#             "uploadedAt": pdf.uploaded_at.isoformat()
#         }
#         for pdf in chat.pdfs
#     ])


# @app.route("/api/chats/<chat_id>/questions/generate/full", methods=["POST"])
# def generate_full_exam(chat_id):
#     logger.info("Generate full exam called")

#     user = get_user_from_token()
#     if not user:
#         return jsonify({"error": "unauthorized"}), 401

#     chat = Chat.query.get(chat_id)
#     if not chat or chat.user_id != user.id:
#         return jsonify({"error": "invalid chat"}), 403

#     pending = PDFDocument.query.filter_by(chat_id=chat_id, is_processed=False).count()
#     if pending > 0:
#         return jsonify({"error": "PDFs still processing"}), 400

#     exam_cfg = json.loads(chat.exam_config or "{}")
#     mcq_cfg = exam_cfg.get("mcq") or {"count": 0, "marks": 1}
#     desc_cfg = exam_cfg.get("descriptive") or {"count": 0, "marks": 10}
#     bloom = chat.bloom_level or "understand"

#     client = get_chroma_client()
#     collection_name = chroma_collection_name(user.id, chat_id)
#     collection = get_chroma_collection(client, collection_name)

#     # allowed topics from DB
#     db_topics = SubjectTopic.query.filter_by(chat_id=chat_id).all()
#     allowed = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

#     weights = compute_topic_weights(collection)
#     weights_small = top_n_weights(weights, n=10)
#     # merged_context = merge_context_by_topics(collection, allowed)
#     # Keep context small so you don't blow TPM
#     merged_context = merge_context_by_topics_budgeted(
#         collection,
#         allowed,
#         per_topic_results=2,
#         max_chars=12000,
#         max_chars_per_topic=900
#     )

#     pyq_freq = exam_cfg.get("pyqTopicFrequency", {}) or {}

#     questions = []

#     # MCQs
#     if mcq_cfg.get("count", 0) > 0:
#         prompt = f"""
# Generate {mcq_cfg["count"]} MCQs.

# Allowed topics (choose topic EXACTLY from this list):
# {json.dumps(allowed, indent=2)}

# If PYQ topic frequency is available, bias questions toward frequently asked topics:
# PYQ topicFrequency:
# {json.dumps(pyq_freq, indent=2)}

# Topic weight distribution (optional bias): 
# {json.dumps(weights_small, indent=2)}

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
#         raw = call_gemini(prompt)
#         questions += safe_json_extract(raw)

#     # Descriptive
#     if desc_cfg.get("count", 0) > 0:
#         prompt = f"""
# Generate {desc_cfg["count"]} descriptive questions.

# Allowed topics (choose topic EXACTLY from this list):
# {json.dumps(allowed, indent=2)}

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
#         raw = call_gemini(prompt)
#         questions += safe_json_extract(raw)

#     # ✅ Normalize ALL topics once
#     for q in questions:
#         q["topic"] = map_to_closest_topic(q.get("topic", ""), allowed, threshold=0.35)

#     # assign ids
#     session_id = generate_id()
#     for i, q in enumerate(questions):
#         q["id"] = f"{session_id}_q{i+1}"

#     session = PracticeSession(
#         id=session_id,
#         chat_id=chat_id,
#         session_type="full",
#         questions=json.dumps(questions)
#     )
#     db.session.add(session)
#     db.session.commit()

#     return jsonify({"sessionId": session.id, "questions": questions})



# @app.route("/api/chats/<chat_id>/questions/generate/weak", methods=["POST"])
# def generate_weak_exam(chat_id):
#     user = get_user_from_token()
#     if not user:
#         return jsonify({"error": "unauthorized"}), 401

#     chat = Chat.query.get(chat_id)
#     if not chat or chat.user_id != user.id:
#         return jsonify({"error": "invalid chat"}), 403

#     weak_topics_map = json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}
#     if not weak_topics_map:
#         return jsonify({"error": "No weak topics"}), 400

#     exam_cfg = json.loads(chat.exam_config or "{}")
#     mcq_cfg = exam_cfg.get("mcq") or {"count": 0, "marks": 1}
#     desc_cfg = exam_cfg.get("descriptive") or {"count": 0, "marks": 10}
#     bloom = chat.bloom_level or "understand"

#     client = get_chroma_client()
#     collection_name = chroma_collection_name(user.id, chat_id)
#     collection = get_chroma_collection(client, collection_name)

#     # allowed topics from DB
#     db_topics = SubjectTopic.query.filter_by(chat_id=chat_id).all()
#     allowed = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

#     # sort weak topics by score/seen
#     weak_topics = sorted(
#         weak_topics_map.keys(),
#         key=lambda t: (weak_topics_map.get(t, {}).get("score", 0.0),
#                        weak_topics_map.get(t, {}).get("seen", 0)),
#         reverse=True
#     )

#     questions = []

#     # MCQs
#     if mcq_cfg.get("count", 0) > 0:
#         per_topic = max(1, mcq_cfg["count"] // max(len(weak_topics), 1))
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
#             qs = safe_json_extract(raw) or []
#             for q in qs:
#                 q["topic"] = topic
#                 questions.append(q)

#             if len([q for q in questions if q.get("type") == "mcq"]) >= mcq_cfg["count"]:
#                 break

#     # Descriptive
#     if desc_cfg.get("count", 0) > 0:
#         per_topic = max(1, desc_cfg["count"] // max(len(weak_topics), 1))
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
#             qs = safe_json_extract(raw) or []
#             for q in qs:
#                 q["topic"] = topic
#                 questions.append(q)

#             if len([q for q in questions if q.get("type") == "descriptive"]) >= desc_cfg["count"]:
#                 break

#     # ✅ Normalize topics (even here)
#     for q in questions:
#         q["topic"] = map_to_closest_topic(q.get("topic", ""), allowed, threshold=0.35)

#     session_id = generate_id()
#     for i, q in enumerate(questions):
#         q["id"] = f"{session_id}_q{i+1}"

#     session = PracticeSession(
#         id=session_id,
#         chat_id=chat_id,
#         session_type="weak",
#         questions=json.dumps(questions)
#     )
#     db.session.add(session)
#     db.session.commit()

#     return jsonify({"sessionId": session.id, "questions": questions})


# # ANSWER SUBMIT

# @app.route("/api/sessions/<sid>/submit", methods=["POST"])
# def submit_answers(sid):
#     user = get_user_from_token()
#     if not user:
#         return jsonify({"error": "unauthorized"}), 401

#     session = PracticeSession.query.get(sid)
#     if not session:
#         return jsonify({"error": "invalid session"}), 404

#     chat = Chat.query.get(session.chat_id)
#     if not chat or chat.user_id != user.id:
#         return jsonify({"error": "unauthorized"}), 403

#     data = request.json or {}
#     answers = data.get("answers", {})
#     questions = json.loads(session.questions or "[]")

#     # ✅ get allowed topics ONCE
#     db_topics = SubjectTopic.query.filter_by(chat_id=chat.id).all()
#     allowed = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

#     for q in questions:
#         q["topic"] = map_to_closest_topic(q.get("topic", ""), allowed, threshold=0.35)

#     results = {}
#     weak_topics = []
#     topic_events = []

#     # ---------- MCQs deterministic ----------
#     mcq_payload_for_explanations = []

#     for q in questions:
#         qid = q.get("id")
#         user_ans = answers.get(qid)
#         if not user_ans:
#             continue

#         if q.get("type") == "mcq":
#             correct = q.get("answer")
#             is_correct = (user_ans == correct)

#             topic_name = map_to_closest_topic(q.get("topic", "General"), allowed)

#             topic_events.append({"topic": topic_name, "correct": is_correct})

#             results[qid] = {
#                 "type": "mcq",
#                 "topic": topic_name,              # ✅ mapped
#                 "question": q.get("question"),
#                 "userAnswer": user_ans,
#                 "correctAnswer": correct,
#                 "isCorrect": is_correct,
#                 "understandingScore": 10 if is_correct else 0,
#                 "explanation": ""
#             }

#             if not is_correct:
#                 weak_topics.append(topic_name)   # ✅ mapped
#                 mcq_payload_for_explanations.append({
#                     "id": qid,
#                     "question": q.get("question"),
#                     "options": q.get("options", []),
#                     "correctAnswer": correct,
#                     "userAnswer": user_ans
#                 })

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
#         exp_result = call_gemini(exp_prompt, expect_json=True) or {}

#         for item in mcq_payload_for_explanations:
#             qid = item["id"]
#             if qid in results:
#                 results[qid]["explanation"] = (exp_result.get(qid, {}) or {}).get("explanation", "")

#     # ---------- Descriptive LLM eval ----------
#     desc_payload = []
#     for q in questions:
#         qid = q.get("id")
#         user_ans = answers.get(qid)
#         if not user_ans:
#             continue
#         if q.get("type") == "descriptive":
#             desc_payload.append({
#                 "id": qid,
#                 "question": q.get("question"),
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
#         desc_result = call_gemini(desc_prompt, expect_json=True) or {}

#         for item in desc_payload:
#             qid = item["id"]
#             r = desc_result.get(qid, {}) or {}
#             score = float(r.get("understandingScore", 0) or 0)

#             topic_name = map_to_closest_topic(item.get("topic", "General"), allowed)  # ✅ item, not q

#             topic_events.append({"topic": topic_name, "correct": (score >= 6)})       # ✅ correct flag

#             results[qid] = {
#                 "type": "descriptive",
#                 "topic": topic_name,              # ✅ mapped
#                 "question": item.get("question"),
#                 "userAnswer": item.get("answer"),
#                 "correctAnswer": None,
#                 "isCorrect": None,
#                 "understandingScore": score,
#                 "covered": r.get("coveredConcepts", []),
#                 "missing": r.get("missingConcepts", []),
#                 "sampleAnswer": r.get("sampleAnswer", ""),
#                 "explanation": r.get("explanation", "")
#             }

#             if score < 6:
#                 weak_topics.append(topic_name)     # ✅ mapped

#     # ---------- Overall ----------
#     scores = [float(v.get("understandingScore", 0) or 0) for v in results.values()]
#     avg = sum(scores) / max(len(scores), 1)

#     session.score = avg
#     session.answers = json.dumps(answers)
#     session.weak_topics_json = json.dumps(weak_topics)
#     session.feedback_json = json.dumps(results)

#     existing = json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}
#     updated = update_topic_weakness(existing, topic_events, alpha=0.25)
#     chat.weak_topics_json = json.dumps(updated)

#     db.session.commit()

#     return jsonify({
#         "score": avg,
#         "results": results,
#         "weakTopics": updated,
#         "weakTopicList": top_weak_topics(updated, k=5)
#     })



# @app.route("/api/chats/<chat_id>/history", methods=["GET"])
# def chat_history(chat_id):
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
#             "feedback": json.loads(s.feedback_json) if s.feedback_json else {},  # ✅ NEW
#             "createdAt": s.created_at.isoformat()
#         })

#     return jsonify(result)


# @app.route("/debug/chroma/<chat_id>")
# def debug_chroma(chat_id):

#     user = get_user_from_token()
#     if not user:
#         return jsonify({"error": "unauthorized"}), 401

#     client = get_chroma_client()
#     name = chroma_collection_name(user.id, chat_id)

#     # col = client.get_or_create_collection(name=name)
#     col = get_chroma_collection(client, name)

#     return {
#         "collection": name,
#         "count": col.count()
#     }


# @app.route("/api/pdfs/<pdf_id>/retry", methods=["POST"])
# def retry_pdf(pdf_id):
#     user = get_user_from_token()
#     if not user:
#         return jsonify({"error": "unauthorized"}), 401

#     pdf = PDFDocument.query.get(pdf_id)
#     if not pdf:
#         return jsonify({"error": "not found"}), 404
    
#     if not (pdf.error or pdf.pdf_type == "failed"):
#         return jsonify({"error": "PDF is not in failed state"}), 400

#     chat = Chat.query.get(pdf.chat_id)
#     if not chat or chat.user_id != user.id:
#         return jsonify({"error": "unauthorized"}), 403

#     pdf.is_processed = False
#     pdf.error = None
#     pdf.pdf_type = "pending"
#     db.session.commit()

#     process_pdf_task.delay(pdf.id, user.id, pdf.chat_id, pdf.file_path)

#     return jsonify({"status": "requeued"}), 202

# if __name__ == "__main__":
#     app.run(debug=False, port=5000, host="0.0.0.0", use_reloader=False)