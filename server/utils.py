import os
import uuid
import json
import re
from datetime import datetime, timedelta
from jose import jwt
from jose.exceptions import JWTError
from werkzeug.security import generate_password_hash, check_password_hash
from PyPDF2 import PdfReader
from sentence_transformers import SentenceTransformer
from chromadb import PersistentClient
from llm import call_gemini
from models import *
import hashlib


SECRET_KEY = os.getenv("JWT_SECRET", "exam-secret")

_embedding_model = None
_chroma_client = None


# ---------------- BASIC ----------------

def generate_id():
    return str(uuid.uuid4())


def hash_password(p):
    return generate_password_hash(p)


def verify_password(h, p):
    return check_password_hash(h, p)


# ---------------- JWT ----------------

def generate_token(uid):
    payload = {
        "user_id": uid,
        "exp": datetime.utcnow() + timedelta(days=7)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def verify_token(token):
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return data.get("user_id")
    except JWTError:
        return None


# ---------------- PDF ----------------

def extract_text_from_pdf(path):
    reader = PdfReader(path)
    text = ""

    for i, page in enumerate(reader.pages):
        t = page.extract_text()
        if t:
            text += f"Page {i+1}:\n{t}\n"

    return text


# ---------------- EMBEDDINGS ----------------

def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedding_model


def create_embeddings(text, chunk_size=450):
    words = text.split()
    chunks = []

    for i in range(0, len(words), chunk_size):
        chunks.append(" ".join(words[i:i+chunk_size]))

    model = get_embedding_model()
    emb = model.encode(chunks)

    return chunks, emb.tolist()

# TEMPORARY EMBEDDING STUB (NO ML, NO MODELS)
# def create_embeddings(text, chunk_size=450):
#     """
#     TEMP MODE:
#     - Keeps same return format
#     - No sentence-transformer
#     - Embeddings are dummy placeholders
#     """

#     words = text.split()
#     chunks = []

#     for i in range(0, len(words), chunk_size):
#         chunks.append(" ".join(words[i:i+chunk_size]))

#     # Fake embeddings (small, constant vectors)
#     embeddings = [[0.0] * 8 for _ in chunks]

#     return chunks, embeddings


# ---------------- CHROMA ----------------

def get_chroma_client():
    global _chroma_client

    if _chroma_client is None:
        _chroma_client = PersistentClient(path="./chroma_db")

    return _chroma_client


def store_embeddings_in_chroma(user_id, chat_id, pdf_id, tagged_chunks, embeddings, pdf_type):

    client = get_chroma_client()
    name = f"user_{user_id}_chat_{chat_id}"

    collection = client.get_or_create_collection(name=name)

    docs, ids, meta = [], [], []

    for i, chunk in enumerate(tagged_chunks):
        docs.append(chunk["text"])
        ids.append(f"{pdf_id}_{i}")

        meta.append({
            "topics": ",".join(chunk["topics"]),
            "pdf_type": pdf_type
        })

    collection.add(documents=docs, embeddings=embeddings, ids=ids, metadatas=meta)




def fetch_topic_chunks(collection, topic, pdf_priority="notes"):

    res = collection.query(
        query_texts=[topic],
        where={"topics": {"$contains": topic}},
        n_results=8
    )

    if res and res.get("documents"):
        return "\n".join(res["documents"][0])

    return ""


# =====================================================
# 🔽 TEMP CHROMA STUB (IN-MEMORY STORE)
# =====================================================

# _TEMP_STORE = {}

# def get_chroma_client():
#     """
#     TEMP MODE:
#     Fake client object
#     """
#     return _TEMP_STORE

# def store_embeddings_in_chroma(user_id, chat_id, pdf_id, tagged_chunks, embeddings, pdf_type):
#     """
#     TEMP MODE:
#     Store chunks in memory by chat_id
#     """

#     key = f"user_{user_id}_chat_{chat_id}"

#     if key not in _TEMP_STORE:
#         _TEMP_STORE[key] = []

#     for i, chunk in enumerate(tagged_chunks):
#         _TEMP_STORE[key].append({
#             "text": chunk["text"],
#             "topics": chunk["topics"],
#             "pdf_type": pdf_type
#         })

# def fetch_topic_chunks(collection, topic, pdf_priority="notes"):
#     """
#     TEMP MODE:
#     Keyword-based retrieval instead of vector search
#     """

#     if not collection:
#         return ""

#     matched = []

#     for item in collection:
#         for t in item["topics"]:
#             if topic.lower() in t.lower():
#                 matched.append(item["text"])
#                 break

#     # Limit to avoid token explosion
#     return "\n".join(matched[:8])


# ---------------- TOPIC TAGGING ----------------

def tag_chunk_with_topics(chunk, topic_tree):
    matched = []

    for t in topic_tree:
        if t["topic"].lower() in chunk.lower():
            matched.append(t["topic"])

    if not matched:
        matched.append("General")

    return matched


# ---------------- GEMINI JSON SAFE ----------------

def safe_json_extract(text):
    try:
        match = re.search(r"\[.*\]", text, re.DOTALL)
        if match:
            return json.loads(match.group())
    except:
        pass
    return []


# ---------------- SYLLABUS EXTRACTION ----------------

def extract_topic_tree_from_text(text):

    prompt = f"""
Extract syllabus units and topics.

Return ONLY JSON array:
[{{"unit":"Unit","topic":"Topic"}}]

{text[:10000]}
"""

    raw = call_gemini(prompt)

    try:
        return json.loads(raw)
    except:
        return [{"unit": "General", "topic": "General"}]
    

# ---------------- WEAK TOPIC DETECTION ----------------
def update_weak_topics(existing, new_topics):
    """
    existing: dict
    new_topics: list[str]
    """
    if not existing:
        existing = {}

    for t in new_topics:
        existing[t] = existing.get(t, 0) + 1

    return existing


def detect_pdf_type_llm(text):
    prompt = f"""
Classify this document strictly into one category:
- syllabus
- notes
- question_paper

Return ONLY one word.

{text[:6000]}
"""
    result = call_gemini(prompt).lower()

    if "syllabus" in result:
        return "syllabus"
    if "question" in result:
        return "question_paper"
    return "notes"


def compute_topic_weights(collection):
    counts = {}
    total = 0

    for item in collection:
        for t in item["topics"]:
            counts[t] = counts.get(t, 0) + 1
            total += 1

    return {t: c / total for t, c in counts.items()} if total else {}


# def distribute_questions(weights, total_q):
#     allocation = {}

#     for t, w in weights.items():
#         allocation[t] = round(w * total_q)

#     while sum(allocation.values()) < total_q:
#         top = max(weights, key=weights.get)
#         allocation[top] += 1

#     return allocation

def distribute_questions(weights, total_q):

    if not weights:
        return {"General": total_q}

    allocation = {}

    for t, w in weights.items():
        allocation[t] = max(1, round(w * total_q))

    while sum(allocation.values()) > total_q:
        allocation[max(allocation, key=allocation.get)] -= 1

    while sum(allocation.values()) < total_q:
        allocation[max(weights, key=weights.get)] += 1

    return allocation


def calibrate_exam_config(chat, pyq_text):

    prompt = f"""
Analyze this previous year question paper.

Extract:
- total questions
- number of MCQs
- marks per MCQ
- number of descriptive questions
- marks per descriptive question

Return ONLY JSON:

{{
 "totalQuestions": number,
 "mcq": {{"count": number, "marks": number}},
 "descriptive": {{"count": number, "marks": number}}
}}

{pyq_text[:6000]}
"""

    raw = call_gemini(prompt)

    try:
        inferred = json.loads(raw)
        base = json.loads(chat.exam_config)

        # merge auto detected pattern
        base.update(inferred)

        chat.exam_config = json.dumps(base)
        db.session.commit()

    except:
        pass


def is_duplicate(chat_id, question, topic, weak_topics):
    h = hashlib.sha256(question.encode()).hexdigest()

    existing = GeneratedQuestion.query.filter_by(
        chat_id=chat_id,
        question_hash=h
    ).first()

    if existing and topic not in weak_topics:
        return True

    if existing:
        existing.times_asked += 1
    else:
        db.session.add(GeneratedQuestion(
            id=generate_id(),
            chat_id=chat_id,
            question_hash=h,
            topic=topic
        ))

    return False


def ensure_topics_exist(chat_id, text):
    """
    Ensures SubjectTopic exists.
    Used when syllabus is missing but notes/PYQ exist.
    """
    from server.models import SubjectTopic, db

    existing = SubjectTopic.query.filter_by(chat_id=chat_id).first()
    if existing:
        return

    prompt = f"""
Infer syllabus-style topics and units from this content.

Return ONLY JSON:
[{{"unit":"Unit","topic":"Topic"}}]

{text[:8000]}
"""

    raw = call_gemini(prompt)

    try:
        topics = json.loads(raw)
    except:
        topics = [{"unit": "General", "topic": "General"}]

    for t in topics:
        db.session.add(SubjectTopic(
            chat_id=chat_id,
            unit_name=t.get("unit", "General"),
            topic_name=t.get("topic", "General")
        ))

    db.session.commit()


def generate_without_pdfs(chat, user):
    """
    LLM-only fallback using exam_type + config + weak topics
    """

    exam_cfg = json.loads(chat.exam_config)
    bloom = chat.bloom_level or "understand"

    prompt = f"""
Generate exam questions using standard syllabus knowledge.

Exam Type: {chat.exam_type}
Bloom Level: {bloom}
Config: {json.dumps(exam_cfg)}

Return JSON array:
[
 {{
  "id":"q1",
  "type":"mcq|descriptive",
  "question":"...",
  "options":[],
  "answer":""
 }}
]
"""

    raw = call_gemini(prompt)
    return safe_json_extract(raw)
