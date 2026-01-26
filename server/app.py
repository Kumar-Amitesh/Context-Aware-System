from flask import Flask, request, jsonify
from flask_cors import CORS
from models import *
from utils import *
import os
import json
from werkzeug.utils import secure_filename
from celery_worker import process_pdf_task
from extensions import db, celery


app = Flask(__name__)
CORS(app, origin="*", supports_credentials=True)

# ---------------- CONFIG ----------------

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///exam_prep.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

app.config['UPLOAD_FOLDER'] = "uploads"

os.makedirs("uploads", exist_ok=True)

db.init_app(app)

celery.conf.update(app.config)

with app.app_context():
    db.create_all()


# ---------------- AUTH ----------------

def get_user_from_token():
    token = request.headers.get('Authorization')
    if token and token.startswith('Bearer '):
        token = token[7:]
        user_id = verify_token(token)
        if user_id:
            return User.query.get(user_id)
    return None

# ---------------- BASIC ----------------

@app.route('/', methods=['GET'])
def home():
    return jsonify({"message": "Exam Prep AI Backend Running"}), 200

# ---------------- AUTH ROUTES ----------------

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


# ---------------- CHAT CREATE ----------------

@app.route("/api/chats", methods=["GET","POST"])
def create_chat():

    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    # ---------- GET: list chats ----------
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
                "weakTopics": chat.get_weak_topics_summary(),
                "pdfCount": len(chat.pdfs)
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


# ---------------- PDF UPLOAD ----------------

@app.route("/api/chats/<chat_id>/pdfs", methods=["POST"])
def upload_pdf(chat_id):

    user = get_user_from_token()
    chat = Chat.query.get(chat_id)

    if not chat or chat.user_id != user.id:
        return jsonify({"error": "invalid chat"}), 403

    file = request.files["pdf"]

    original_name = secure_filename(file.filename)
    unique_name = f"{generate_id()}_{original_name}"
    path = os.path.join(app.config["UPLOAD_FOLDER"], unique_name)

    file.save(path)

    # ---- PDF TYPE WILL BE DETECTED INSIDE CELERY ----
    pdf = PDFDocument(
        id=generate_id(),
        chat_id=chat_id,
        filename=original_name,
        file_path=path,
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


# ---------------- QUESTION GENERATION ----------------

@app.route("/api/chats/<chat_id>/questions/generate/full", methods=["POST"])
def generate_full_exam(chat_id):

    user = get_user_from_token()
    chat = Chat.query.get(chat_id)

    pending = PDFDocument.query.filter_by(chat_id=chat_id, is_processed=False).count()
    if pending > 0:
        return jsonify({"error": "PDFs still processing"}), 400

    exam_cfg = json.loads(chat.exam_config)

    mcq_cfg = exam_cfg.get("mcq")
    desc_cfg = exam_cfg.get("descriptive")

    bloom = chat.bloom_level or "understand"

    client = get_chroma_client()
    collection = client.get(f"user_{user.id}_chat_{chat_id}", [])

    # ---------- NO PDF FALLBACK ----------
    if not collection:
        questions = generate_without_pdfs(chat, user)

        session = PracticeSession(
            id=generate_id(),
            chat_id=chat_id,
            session_type="full_fallback",
            questions=json.dumps(questions)
        )
        db.session.add(session)
        db.session.commit()

        return jsonify({
            "sessionId": session.id,
            "questions": questions,
            "fallback": True
        })

    weights = compute_topic_weights(collection)

    questions = []

    # ---------------- MCQ GENERATION ----------------

    if mcq_cfg:

        allocation = distribute_questions(weights, mcq_cfg["count"])

        for topic, count in allocation.items():

            ctx = fetch_topic_chunks(collection, topic)

            prompt = f"""
Generate {count} MCQs.

Rules:
- 4 options
- single correct
- Bloom level: {bloom}
- Difficulty: moderate

Topic: {topic}

Context:
{ctx}

Return JSON array:
[
 {{
  "id":"q1",
  "type":"mcq",
  "question":"...",
  "options":["A","B","C","D"],
  "answer":"A"
 }}
]
"""

            raw = call_gemini(prompt)
            qs = safe_json_extract(raw)
            weak_topics = json.loads(chat.weak_topics_json) if chat.weak_topics_json else []

            for q in qs:
                duplicate = is_duplicate(
                    chat_id=chat_id,
                    question=q["question"],
                    topic=topic,
                    weak_topics=weak_topics
                )

                if duplicate:
                    continue 
                q["topic"] = topic
                questions.append(q)

    # ---------------- DESCRIPTIVE GENERATION ----------------

    if desc_cfg:

        allocation = distribute_questions(weights, desc_cfg["count"])

        for topic, count in allocation.items():

            ctx = fetch_topic_chunks(collection, topic)

            prompt = f"""
Generate {count} descriptive questions.

Marks per question: {desc_cfg["marks"]}
Bloom Level: {bloom}

Topic: {topic}

Context:
{ctx}

Return ONLY JSON array.
"""

            raw = call_gemini(prompt)
            qs = safe_json_extract(raw)

            weak_topics = json.loads(chat.weak_topics_json) if chat.weak_topics_json else []

            for q in qs:
                duplicate = is_duplicate(
                    chat_id=chat_id,
                    question=q["question"],
                    topic=topic,
                    weak_topics=weak_topics
                )

                if duplicate:
                    continue 
                q["topic"] = topic
                questions.append(q)

    session = PracticeSession(
        id=generate_id(),
        chat_id=chat_id,
        session_type="full",
        questions=json.dumps(questions)
    )

    db.session.add(session)
    db.session.commit()

    return jsonify({
        "sessionId": session.id,
        "questions": questions
    })


@app.route("/api/chats/<chat_id>/questions/generate/weak", methods=["POST"])
def generate_weak_exam(chat_id):

    user = get_user_from_token()
    chat = Chat.query.get(chat_id)

    weak_topics_map = json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}

    if not weak_topics_map:
        return jsonify({"error": "No weak topics"}), 400

    exam_cfg = json.loads(chat.exam_config)

    mcq_cfg = exam_cfg.get("mcq")
    desc_cfg = exam_cfg.get("descriptive")

    bloom = chat.bloom_level or "understand"

    client = get_chroma_client()
    collection = client.get(f"user_{user.id}_chat_{chat_id}", [])

    weak_topics = list(weak_topics_map.keys())

    questions = []

    # ---------------- WEAK MCQs ----------------

    if mcq_cfg:

        per_topic = max(1, mcq_cfg["count"] // len(weak_topics))

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
            qs = safe_json_extract(raw)

            for q in qs:
                q["topic"] = topic
                questions.append(q)

            if len([q for q in questions if q["type"] == "mcq"]) >= mcq_cfg["count"]:
                break

    # ---------------- WEAK DESCRIPTIVE ----------------

    if desc_cfg:

        per_topic = max(1, desc_cfg["count"] // len(weak_topics))

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
            qs = safe_json_extract(raw)

            for q in qs:
                q["topic"] = topic
                questions.append(q)

            if len([q for q in questions if q["type"] == "descriptive"]) >= desc_cfg["count"]:
                break

    session = PracticeSession(
        id=generate_id(),
        chat_id=chat_id,
        session_type="weak",
        questions=json.dumps(questions)
    )

    db.session.add(session)
    db.session.commit()

    return jsonify({
        "sessionId": session.id,
        "questions": questions
    })


# ---------------- ANSWER SUBMIT ----------------

@app.route("/api/sessions/<sid>/submit", methods=["POST"])
def submit_answers(sid):

    user = get_user_from_token()
    session = PracticeSession.query.get(sid)

    chat = Chat.query.get(session.chat_id)

    if chat.user_id != user.id:
        return jsonify({"error": "unauthorized"}), 403

    data = request.json
    answers = data["answers"]

    questions = json.loads(session.questions)

    total = 0
    count = 0

    weak_topics = []
    feedback = {}  

    for q in questions:
        ans = answers.get(q["id"], "")
        if not ans:
            continue

        eval_prompt = f"""
You are an AI tutor.

Evaluate student's understanding based on KEY CONCEPTS.

Do NOT grade like exam.
Do NOT penalize grammar.
Focus on:

- conceptual correctness
- important idea coverage
- reasoning quality

Question:
{q['question']}

Student Answer:
{ans}

Return ONLY JSON:

{{
 "understandingScore": number between 0-10,
 "coveredConcepts": ["concept1","concept2"],
 "missingConcepts": ["conceptA","conceptB"]
}}
"""

        result = call_gemini(eval_prompt)

        try:
            parsed = json.loads(result)

            score = parsed.get("understandingScore", 0)

            covered = parsed.get("coveredConcepts", [])
            missing = parsed.get("missingConcepts", [])
            feedback[q["id"]] = {
                "covered": covered,
                "missing": missing
            }
        except:
            score = 0

        total += score
        count += 1

        if score < 6 or len(missing) > len(covered):
            weak_topics.append(q.get("topic", "General"))

    avg = total / max(count, 1)

    session.score = avg
    session.answers = json.dumps(answers)
    session.weak_topics_json = json.dumps(weak_topics)
    session.feedback_json = json.dumps(feedback)

    # ---- UPDATE CHAT LEVEL ----
    existing = json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}
    updated = update_weak_topics(existing, weak_topics)
    chat.weak_topics_json = json.dumps(updated)

    db.session.commit()

    return jsonify({
        "score": avg,
        "feedback": feedback
    })


@app.route("/api/chats/<chat_id>/history", methods=["GET"])
def chat_history(chat_id):
    user = get_user_from_token()
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


if __name__ == "__main__":
    app.run(debug=False, port=5000, host="0.0.0.0", use_reloader=False)