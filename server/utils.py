# ✅ utils.py (UPDATED)

import os
import uuid
import json
import re
from datetime import datetime, timedelta
import time
from jose import jwt
from jose.exceptions import JWTError
from werkzeug.security import generate_password_hash, check_password_hash
from PyPDF2 import PdfReader
from sentence_transformers import SentenceTransformer
from chromadb import PersistentClient
from llm import call_gemini
from models import *
import hashlib
from logger import get_logger
import numpy as np
import string
logger = get_logger("utils")


SECRET_KEY = os.getenv("JWT_SECRET", "exam-secret")

_embedding_model = None
_chroma_client = None


# BASIC

def generate_id():
    return str(uuid.uuid4())


def hash_password(p):
    return generate_password_hash(p)


def verify_password(h, p):
    return check_password_hash(h, p)


# JWT

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


# PDF

def extract_text_from_pdf(path):
    reader = PdfReader(path)
    text = ""

    for i, page in enumerate(reader.pages):
        t = page.extract_text()
        if t:
            text += f"Page {i+1}:\n{t}\n"

    return text


# EMBEDDINGS

def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedding_model


def create_embeddings(text, chunk_size=450):

    logger.info(f"Creating embeddings for text length={len(text)}")

    words = text.split()
    chunks = []

    for i in range(0, len(words), chunk_size):
        chunks.append(" ".join(words[i:i+chunk_size]))

    logger.info(f"Chunks created: {len(chunks)}")

    model = get_embedding_model()
    emb = model.encode(chunks)

    logger.info("Embeddings generated successfully")

    return chunks, emb.tolist()


# CHROMA

def chroma_collection_name(user_id, chat_id):
    raw = f"{user_id}_{chat_id}"
    short = hashlib.md5(raw.encode()).hexdigest()[:24]
    return f"uc_{short}"


def get_chroma_client():
    global _chroma_client

    if _chroma_client is None:
        logger.info("Initializing Chroma client at ./chroma_db")
        _chroma_client = PersistentClient(path="./chroma_db")

    return _chroma_client


def get_chroma_collection(client, name, retries=5, sleep=0.2):
    for i in range(retries):
        try:
            return client.get_collection(name=name)
        except Exception:
            try:
                return client.create_collection(name=name)
            except Exception as e:
                # if it already exists due to race, wait and try get again
                if "already exists" in str(e).lower():
                    time.sleep(sleep * (i + 1))
                    continue
                raise
    return client.get_collection(name=name)


def store_embeddings_in_chroma(user_id, chat_id, pdf_id, tagged_chunks, embeddings, pdf_type):

    logger.info(f"Storing embeddings → user={user_id} chat={chat_id} pdf={pdf_id}")

    client = get_chroma_client()
    name = chroma_collection_name(user_id, chat_id)

    logger.info(f"Using Chroma collection: {name}")

    # collection = client.get_or_create_collection(name=name)
    collection = get_chroma_collection(client, name)

    docs, ids, meta = [], [], []

    for i, chunk in enumerate(tagged_chunks):
        docs.append(chunk["text"])
        ids.append(f"{pdf_id}_{i}")

        # meta.append({
        #     "topics": ",".join(chunk["topics"]),
        #     "pdf_type": pdf_type
        # })
        meta.append({
            "topics": json.dumps(chunk["topics"]),  # ✅ store as JSON array
            "pdf_type": pdf_type
        })

    collection.add(documents=docs, embeddings=embeddings, ids=ids, metadatas=meta)

    logger.info(f"Stored {len(docs)} embeddings in Chroma")



# def fetch_topic_chunks(collection, topic):

#     logger.info(f"Querying Chroma for topic: {topic}")

#     res = collection.query(
#         query_texts=[topic],
#         n_results=8
#     )

#     if res and res.get("documents"):
#         logger.info(f"Chunks found: {len(res['documents'][0])}")
#         return "\n".join(res["documents"][0])

#     logger.warning("No chunks found")
#     return ""

# def fetch_topic_chunks(collection, topic):
#     logger.info(f"Querying Chroma for topic: {topic}")

#     model = get_embedding_model()
#     q_emb = model.encode([topic]).tolist()   # <-- compute embedding yourself

#     res = collection.query(
#         query_embeddings=q_emb,             # <-- use embeddings
#         n_results=8
#     )

#     if res and res.get("documents"):
#         logger.info(f"Chunks found: {len(res['documents'][0])}")
#         return "\n".join(res["documents"][0])

#     logger.warning("No chunks found")
#     return ""


def fetch_topic_chunks(collection, topic, n_results=3):
    logger.info(f"Querying Chroma for topic: {topic}")

    model = get_embedding_model()
    q_emb = model.encode([topic]).tolist()

    res = collection.query(
        query_embeddings=q_emb,
        n_results=n_results
    )

    if res and res.get("documents"):
        return "\n".join(res["documents"][0])

    return ""


# TOPIC TAGGING

# def tag_chunk_with_topics(chunk, topic_tree):
#     # OLD
#     # matched = []
#     #
#     # for t in topic_tree:
#     #     if t["topic"].lower() in chunk.lower():
#     #         matched.append(t["topic"])
#     #
#     # if not matched:
#     #     matched.append("General")
#     #
#     # return matched

#     # UPDATED: cheap token-overlap scoring (NO LLM calls)
#     text = (chunk or "").lower()
#     tokens = set(re.findall(r"[a-zA-Z]{3,}", text))

#     best_topic = None
#     best_score = 0

#     for t in topic_tree:
#         topic = (t.get("topic") or "").lower()
#         topic_tokens = set(re.findall(r"[a-zA-Z]{3,}", topic))
#         if not topic_tokens:
#             continue

#         score = len(tokens.intersection(topic_tokens))
#         if score > best_score:
#             best_score = score
#             best_topic = t.get("topic")

#     if best_topic and best_score >= 1:
#         return [best_topic]

#     return ["General"]


def tag_chunk_with_topics(chunk, topic_tree):
    if not topic_tree:
        return ["General"]

    model = get_embedding_model()

    topics = [t["topic"] for t in topic_tree if t.get("topic")]
    if not topics:
        return ["General"]

    chunk_emb = model.encode([chunk])[0]
    topic_embs = model.encode(topics)

    # cosine similarity
    sims = np.dot(topic_embs, chunk_emb) / (np.linalg.norm(topic_embs, axis=1) * np.linalg.norm(chunk_emb) + 1e-9)
    best_idx = int(np.argmax(sims))

    return [topics[best_idx]]


# GEMINI JSON SAFE

# def safe_json_extract(text):
#     try:
#         match = re.search(r"\[.*\]", text, re.DOTALL)
#         if match:
#             return json.loads(match.group())
#     except:
#         pass
#     return []

# utils.py
# def safe_json_extract(text: str):
#     if not text:
#         return []

#     # 1) Prefer fenced ```json ... ```
#     fence = re.search(r"```json\s*(\[[\s\S]*?\])\s*```", text, re.IGNORECASE)
#     if fence:
#         try:
#             return json.loads(fence.group(1))
#         except:
#             pass

#     # 2) Any fenced ``` ... ```
#     fence2 = re.search(r"```\s*(\[[\s\S]*?\])\s*```", text)
#     if fence2:
#         try:
#             return json.loads(fence2.group(1))
#         except:
#             pass

#     # 3) Fallback: first bracketed array (non-greedy)
#     arr = re.search(r"(\[[\s\S]*?\])", text)
#     if arr:
#         try:
#             return json.loads(arr.group(1))
#         except:
#             pass

#     return []


def safe_json_extract(text: str):
    if not text:
        return []

    text = text.strip()

    # direct parse
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
    except:
        pass

    # fenced ```json ... ```
    fence = re.search(r"```json\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fence:
        block = fence.group(1).strip()
        try:
            parsed = json.loads(block)
            if isinstance(parsed, list):
                return parsed
        except:
            pass

    # generic fenced block
    fence2 = re.search(r"```\s*([\s\S]*?)\s*```", text)
    if fence2:
        block = fence2.group(1).strip()
        try:
            parsed = json.loads(block)
            if isinstance(parsed, list):
                return parsed
        except:
            pass

    # bracket-balanced array extraction
    start = text.find("[")
    if start == -1:
        return []

    depth = 0
    in_string = False
    escape = False

    for i in range(start, len(text)):
        ch = text[i]

        if escape:
            escape = False
            continue

        if ch == "\\":
            escape = True
            continue

        if ch == '"':
            in_string = not in_string
            continue

        if in_string:
            continue

        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                candidate = text[start:i + 1]
                try:
                    parsed = json.loads(candidate)
                    if isinstance(parsed, list):
                        return parsed
                except:
                    return []

    return []


# SYLLABUS EXTRACTION

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
        return [{"unit": "Unit", "topic": "General"}]


# WEAK TOPIC DETECTION
# def update_weak_topics(existing, new_topics):
#     """
#     existing: dict
#     new_topics: list[str]
#     """
#     if not existing:
#         existing = {}

#     for t in new_topics:
#         existing[t] = existing.get(t, 0) + 1

#     return existing

# def update_topic_weakness(existing: dict, topic_events: list[dict], alpha: float = 0.25):
#     """
#     existing: chat.weak_topics_json parsed dict
#       - old format: {"Topic": count}
#       - new format: {"Topic": {"score": float, "seen": int, "last": str}}

#     topic_events: list of events like:
#       [{"topic": "System Calls", "correct": True}, {"topic": "Memory", "correct": False}, ...]

#     alpha: smoothing factor (0.1 to 0.35 typical)
#       higher alpha => reacts faster to recent performance
#     """

#     if not existing:
#         existing = {}

#     # migrate old format (count) to new format
#     for t, v in list(existing.items()):
#         if isinstance(v, int):
#             # old count means "weak" historically -> start at moderate weakness
#             existing[t] = {"score": min(1.0, 0.5 + 0.1 * v), "seen": v, "last": None}

#     now = datetime.utcnow().isoformat()

#     # Aggregate per-topic performance for THIS submission
#     per_topic = {}
#     for ev in topic_events:
#         t = (ev.get("topic") or "General").strip()
#         correct = bool(ev.get("correct"))
#         if t not in per_topic:
#             per_topic[t] = {"correct": 0, "total": 0}
#         per_topic[t]["total"] += 1
#         if correct:
#             per_topic[t]["correct"] += 1

#     # Update EMA weakness per topic
#     for topic, stats in per_topic.items():
#         acc = stats["correct"] / max(stats["total"], 1)   # 0..1
#         target_weakness = 1.0 - acc                        # 0 (strong) .. 1 (weak)

#         rec = existing.get(topic)
#         if not rec or not isinstance(rec, dict):
#             rec = {"score": 0.5, "seen": 0, "last": None}

#         old = float(rec.get("score", 0.5))
#         new_score = (1 - alpha) * old + alpha * target_weakness

#         rec["score"] = round(float(new_score), 4)
#         rec["seen"] = int(rec.get("seen", 0)) + int(stats["total"])
#         rec["last"] = now

#         existing[topic] = rec

#     return existing


# def update_topic_weakness(existing: dict, topic_events: list[dict], alpha: float = 0.25):
#     """
#     existing:
#       old format: {"Topic": count}
#       new format: {"Topic": {"score": float, "seen": int, "last": str}}

#     topic_events example:
#     [
#         {
#             "topic": "Memory Management",
#             "correct": False,
#             "difficulty": "easy|medium|hard",
#             "score_ratio": 0.0
#         }
#     ]

#     score meaning:
#       0.0 = strong topic
#       1.0 = weak topic

#     Adaptive behavior:
#       - easy wrong   -> increases weakness more
#       - hard wrong   -> increases weakness less
#       - hard correct -> reduces weakness more
#       - partial descriptive answers are handled via score_ratio
#     """
#     if not existing:
#         existing = {}

#     # migrate old format
#     for t, v in list(existing.items()):
#         if isinstance(v, int):
#             existing[t] = {
#                 "score": min(1.0, 0.5 + 0.1 * v),
#                 "seen": v,
#                 "last": None
#             }

#     now = datetime.utcnow().isoformat()

#     difficulty_weights = {
#         "easy": 1.15,
#         "medium": 1.0,
#         "hard": 0.85
#     }

#     # Group events per topic
#     per_topic = {}
#     for ev in topic_events:
#         topic = (ev.get("topic") or "General").strip()
#         difficulty = str(ev.get("difficulty", "medium")).strip().lower()
#         difficulty = difficulty if difficulty in difficulty_weights else "medium"

#         # 0.0 good -> 1.0 weak
#         score_ratio = ev.get("score_ratio", None)
#         if score_ratio is None:
#             # backward compatibility
#             correct = bool(ev.get("correct"))
#             base_weakness = 0.0 if correct else 1.0
#         else:
#             try:
#                 score_ratio = float(score_ratio)
#             except Exception:
#                 score_ratio = 0.0
#             score_ratio = max(0.0, min(1.0, score_ratio))
#             base_weakness = 1.0 - score_ratio

#         # difficulty-aware adjustment
#         # wrong easy => more weakness
#         # wrong hard => slightly less weakness
#         adjusted_weakness = base_weakness * difficulty_weights[difficulty]
#         adjusted_weakness = max(0.0, min(1.0, adjusted_weakness))

#         if topic not in per_topic:
#             per_topic[topic] = {
#                 "weighted_weakness_sum": 0.0,
#                 "count": 0
#             }

#         per_topic[topic]["weighted_weakness_sum"] += adjusted_weakness
#         per_topic[topic]["count"] += 1

#     for topic, stats in per_topic.items():
#         target_weakness = stats["weighted_weakness_sum"] / max(stats["count"], 1)

#         rec = existing.get(topic)
#         if not rec or not isinstance(rec, dict):
#             rec = {"score": 0.5, "seen": 0, "last": None}

#         old_score = float(rec.get("score", 0.5))
#         new_score = (1 - alpha) * old_score + alpha * target_weakness

#         rec["score"] = round(float(new_score), 4)
#         rec["seen"] = int(rec.get("seen", 0)) + int(stats["count"])
#         rec["last"] = now
#         existing[topic] = rec

#     return existing


def update_topic_weakness(existing: dict, topic_events: list[dict], alpha: float = 0.25):
    """
    existing old/new formats supported.

    New stored format:
    {
      "Memory Management": {
        "score": 0.72,
        "seen": 9,
        "last": "...",
        "byDifficulty": {
          "easy": {"score": 0.8, "seen": 3},
          "medium": {"score": 0.7, "seen": 4},
          "hard": {"score": 0.5, "seen": 2}
        },
        "byType": {
          "mcq": {"score": 0.6, "seen": 5},
          "descriptive": {"score": 0.8, "seen": 4}
        },
        "byBloom": {
          "Remember": {"score": 0.3, "seen": 2},
          "Apply": {"score": 0.8, "seen": 4},
          "Analyze": {"score": 0.9, "seen": 3}
        }
      }
    }

    topic_events example:
    [
      {
        "topic": "Memory Management",
        "correct": False,
        "difficulty": "easy",
        "score_ratio": 0.0,
        "question_type": "mcq",
        "bloom_level": "Apply"
      }
    ]
    """

    if not existing:
        existing = {}

    difficulty_weights = {
        "easy": 1.15,
        "medium": 1.0,
        "hard": 0.85
    }

    question_type_weights = {
        "mcq": 1.0,
        "fill_blank": 1.0,
        "true_false": 0.85,
        "descriptive": 1.25
    }

    valid_difficulties = {"easy", "medium", "hard"}
    valid_types = {"mcq", "fill_blank", "true_false", "descriptive"}

    def normalize_bloom(v):
        s = str(v or "").strip().title()
        valid = {"Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"}
        return s if s in valid else "Understand"

    def ensure_record(rec):
        if not isinstance(rec, dict):
            rec = {}

        rec.setdefault("score", 0.5)
        rec.setdefault("seen", 0)
        rec.setdefault("last", None)
        rec.setdefault("byDifficulty", {})
        rec.setdefault("byType", {})
        rec.setdefault("byBloom", {})

        # old shape migration safety
        if not isinstance(rec["byDifficulty"], dict):
            rec["byDifficulty"] = {}
        if not isinstance(rec["byType"], dict):
            rec["byType"] = {}
        if not isinstance(rec["byBloom"], dict):
            rec["byBloom"] = {}

        return rec

    def ensure_bucket(bucket_map, key):
        bucket = bucket_map.get(key)
        if not isinstance(bucket, dict):
            bucket = {"score": 0.5, "seen": 0}
        bucket.setdefault("score", 0.5)
        bucket.setdefault("seen", 0)
        return bucket

    # migrate old format:
    # {"Topic": 4}
    for t, v in list(existing.items()):
        if isinstance(v, int):
            existing[t] = {
                "score": min(1.0, 0.5 + 0.1 * v),
                "seen": v,
                "last": None,
                "byDifficulty": {},
                "byType": {},
                "byBloom": {}
            }
        elif isinstance(v, dict):
            existing[t] = ensure_record(v)

    now = datetime.utcnow().isoformat()

    # aggregate per topic for main score
    per_topic = {}

    for ev in topic_events:
        topic = (ev.get("topic") or "General").strip()
        difficulty = str(ev.get("difficulty", "medium")).strip().lower()
        if difficulty not in valid_difficulties:
            difficulty = "medium"

        qtype = str(ev.get("question_type", "mcq")).strip().lower()
        if qtype not in valid_types:
            qtype = "mcq"

        bloom_level = normalize_bloom(ev.get("bloom_level"))

        score_ratio = ev.get("score_ratio", None)
        if score_ratio is None:
            correct = bool(ev.get("correct"))
            base_weakness = 0.0 if correct else 1.0
        else:
            try:
                score_ratio = float(score_ratio)
            except Exception:
                score_ratio = 0.0
            score_ratio = max(0.0, min(1.0, score_ratio))
            base_weakness = 1.0 - score_ratio

        adjusted_weakness = (
            base_weakness
            * difficulty_weights.get(difficulty, 1.0)
            * question_type_weights.get(qtype, 1.0)
        )
        adjusted_weakness = max(0.0, min(1.0, adjusted_weakness))

        if topic not in per_topic:
            per_topic[topic] = {
                "weighted_weakness_sum": 0.0,
                "count": 0,
                "byDifficulty": {},
                "byType": {},
                "byBloom": {}
            }

        per_topic[topic]["weighted_weakness_sum"] += adjusted_weakness
        per_topic[topic]["count"] += 1

        # difficulty bucket aggregate
        d = per_topic[topic]["byDifficulty"].setdefault(difficulty, {
            "weighted_weakness_sum": 0.0,
            "count": 0
        })
        d["weighted_weakness_sum"] += adjusted_weakness
        d["count"] += 1

        # type bucket aggregate
        t = per_topic[topic]["byType"].setdefault(qtype, {
            "weighted_weakness_sum": 0.0,
            "count": 0
        })
        t["weighted_weakness_sum"] += adjusted_weakness
        t["count"] += 1

        # bloom bucket aggregate
        b = per_topic[topic]["byBloom"].setdefault(bloom_level, {
            "weighted_weakness_sum": 0.0,
            "count": 0
        })
        b["weighted_weakness_sum"] += adjusted_weakness
        b["count"] += 1

    # EMA update
    for topic, stats in per_topic.items():
        rec = ensure_record(existing.get(topic))

        target_weakness = stats["weighted_weakness_sum"] / max(stats["count"], 1)
        old_score = float(rec.get("score", 0.5))
        new_score = (1 - alpha) * old_score + alpha * target_weakness

        rec["score"] = round(float(new_score), 4)
        rec["seen"] = int(rec.get("seen", 0)) + int(stats["count"])
        rec["last"] = now

        # byDifficulty
        for difficulty, d_stats in stats["byDifficulty"].items():
            bucket = ensure_bucket(rec["byDifficulty"], difficulty)
            target = d_stats["weighted_weakness_sum"] / max(d_stats["count"], 1)
            bucket["score"] = round((1 - alpha) * float(bucket.get("score", 0.5)) + alpha * target, 4)
            bucket["seen"] = int(bucket.get("seen", 0)) + int(d_stats["count"])
            rec["byDifficulty"][difficulty] = bucket

        # byType
        for qtype, t_stats in stats["byType"].items():
            bucket = ensure_bucket(rec["byType"], qtype)
            target = t_stats["weighted_weakness_sum"] / max(t_stats["count"], 1)
            bucket["score"] = round((1 - alpha) * float(bucket.get("score", 0.5)) + alpha * target, 4)
            bucket["seen"] = int(bucket.get("seen", 0)) + int(t_stats["count"])
            rec["byType"][qtype] = bucket

        # byBloom
        for bloom_level, b_stats in stats["byBloom"].items():
            bucket = ensure_bucket(rec["byBloom"], bloom_level)
            target = b_stats["weighted_weakness_sum"] / max(b_stats["count"], 1)
            bucket["score"] = round((1 - alpha) * float(bucket.get("score", 0.5)) + alpha * target, 4)
            bucket["seen"] = int(bucket.get("seen", 0)) + int(b_stats["count"])
            rec["byBloom"][bloom_level] = bucket

        existing[topic] = rec

    return existing

def top_weak_topics(existing: dict, k: int = 5, min_seen: int = 1):
    """
    Returns topics sorted by weakness score desc.
    """
    if not existing:
        return []

    items = []
    for t, v in existing.items():
        if isinstance(v, dict):
            seen = int(v.get("seen", 0))
            if seen >= min_seen:
                items.append((t, float(v.get("score", 0.0)), seen))
        elif isinstance(v, int):
            # old format fallback
            items.append((t, min(1.0, 0.5 + 0.1 * v), v))

    items.sort(key=lambda x: (x[1], x[2]), reverse=True)  # weakness then seen
    return [t for (t, _, __) in items[:k]]


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


# def compute_topic_weights(collection):

#     data = collection.get(include=["metadatas"])
#     metas = data.get("metadatas", [])

#     logger.info(f"Chroma metadata count: {len(metas)}")

#     counts = {}
#     total = 0

#     for m in metas:
#         topics = m.get("topics", "").split(",")
#         for t in topics:
#             counts[t] = counts.get(t, 0) + 1
#             total += 1

#     weights = {t: c/total for t, c in counts.items()} if total else {}

#     logger.info(f"Computed topic weights: {weights}")

#     return weights

# def compute_topic_weights(collection):
#     data = collection.get(include=["metadatas"])
#     metas = data.get("metadatas", [])

#     counts = {}
#     total = 0

#     for m in metas:
#         raw = m.get("topics", "[]")

#         # ✅ read list safely
#         try:
#             topics = json.loads(raw) if isinstance(raw, str) else (raw or [])
#         except:
#             topics = []

#         for t in topics:
#             t = (t or "").strip()
#             if not t:
#                 continue
#             counts[t] = counts.get(t, 0) + 1
#             total += 1

#     return {t: c / total for t, c in counts.items()} if total else {}


def compute_topic_weights(collection):
    data = collection.get(include=["metadatas"])
    metas = data.get("metadatas", [])

    counts = {}
    total = 0

    for m in metas:
        raw = m.get("topics", "[]")

        topics = []
        if isinstance(raw, list):
            topics = raw
        elif isinstance(raw, str):
            s = raw.strip()
            if s.startswith("["):
                try:
                    topics = json.loads(s)
                except:
                    topics = []
            else:
                # ✅ backward compat: comma-separated
                topics = [x.strip() for x in s.split(",") if x.strip()]

        for t in topics:
            t = (t or "").strip()
            if not t:
                continue
            counts[t] = counts.get(t, 0) + 1
            total += 1

    return {t: c / total for t, c in counts.items()} if total else {}


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
    # OLD
    # from server.models import SubjectTopic, db

    # UPDATED: local models import already available
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
        topics = [{"unit": "Unit", "topic": "General"}]

    for t in topics:
        db.session.add(SubjectTopic(
            chat_id=chat_id,
            unit_name=t.get("unit", "Unit"),
            topic_name=t.get("topic", "General")
        ))

    db.session.commit()


def generate_without_pdfs(chat, user):
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


def normalize_exam_pattern(exam_pattern: dict) -> dict:
    """
    Converts old or partial examPattern into the generic new schema:
    {
      "questionTypes": {
        "mcq": {...},
        "fill_blank": {...},
        "true_false": {...},
        "descriptive": {...}
      }
    }
    """
    default_qtypes = {
        "mcq": {"count": 0, "marks": 0, "negativeMarks": 0},
        "fill_blank": {"count": 0, "marks": 0, "negativeMarks": 0},
        "true_false": {"count": 0, "marks": 0, "negativeMarks": 0},
        "descriptive": {"count": 0, "marks": 0, "negativeMarks": 0},
    }

    if not isinstance(exam_pattern, dict):
        return {"questionTypes": default_qtypes}

    # New format already
    if isinstance(exam_pattern.get("questionTypes"), dict):
        raw = exam_pattern.get("questionTypes") or {}
        normalized = {}

        for qtype, base in default_qtypes.items():
            cfg = raw.get(qtype) or {}
            normalized[qtype] = {
                "count": int(cfg.get("count", base["count"]) or 0),
                "marks": float(cfg.get("marks", base["marks"]) or 0),
                "negativeMarks": 0.0 if qtype == "descriptive" else float(cfg.get("negativeMarks", 0) or 0),
            }

        return {"questionTypes": normalized}

    # Old format fallback
    normalized = dict(default_qtypes)

    old_mcq = exam_pattern.get("mcq") or {}
    old_desc = exam_pattern.get("descriptive") or {}

    normalized["mcq"] = {
        "count": int(old_mcq.get("count", 0) or 0),
        "marks": float(old_mcq.get("marks", 0) or 0),
        "negativeMarks": float(old_mcq.get("negativeMarks", 0) or 0),
    }

    normalized["descriptive"] = {
        "count": int(old_desc.get("count", 0) or 0),
        "marks": float(old_desc.get("marks", 0) or 0),
        "negativeMarks": 0.0,
    }

    return {"questionTypes": normalized}


def analyze_pdf_intelligence(text):
    # OLD
    # prompt = f"""
    # Analyze this academic PDF.
    #
    # Tasks:
    # 1. Classify type: syllabus | notes | question_paper
    # 2. If syllabus → extract units & topics
    # 3. If question_paper → infer exam pattern
    # 4. Infer topics if syllabus missing
    #
    # Return ONLY JSON:
    # {{
    #   "type": "syllabus|notes|question_paper",
    #   "topics": [{{"unit":"Unit","topic":"Topic"}}],
    #   "examPattern": {{
    #     "mcq": {{"count": 0, "marks": 0}},
    #     "descriptive": {{"count": 0, "marks": 0}}
    #   }}
    # }}
    #
    # {text[:8000]}
    # """
    # raw = call_gemini(prompt)
    #
    # try:
    #     return json.loads(raw)
    # except:
    #     return {
    #         "type": "notes",
    #         "topics": [{"unit": "General", "topic": "General"}],
    #         "examPattern": {}
    #     }

    # UPDATED (still ONE LLM call, richer output)
#     prompt = f"""
# You are analyzing ONE academic PDF for an exam prep app.

# Goals:
# 1) Classify the PDF type strictly: syllabus | notes | question_paper
# 2) Detect the SUBJECT name (example: "Operating Systems", "DBMS", "CN", etc.)
# 3) Extract a clean topic list that can be used for practice generation.

# Rules:
# - Return ONLY JSON.
# - topics must be practical exam topics, not generic words like "General".
# - Keep topics <= 12 items.
# - unit can be "Unit 1", "Module 2", "Chapter 3", etc. If unknown use "Unit".
# - If it is a question_paper, also infer which topics appear frequently (topicFrequency).
#   topicFrequency should be a dict: {{"Topic": countEstimate}} (rough estimate is ok).

# Return JSON schema:
# {{
#   "type": "syllabus|notes|question_paper",
#   "subject": "Subject Name or Unknown",
#   "topics": [{{"unit":"Unit/Module","topic":"Topic"}}],
#   "topicFrequency": {{"Topic": 0}},
#   "examPattern": {{
#     "mcq": {{"count": 0, "marks": 0}},
#     "descriptive": {{"count": 0, "marks": 0}}
#   }}
# }}

# PDF Text (partial):
# {text[:12000]}
# """

    prompt = f"""
You are analyzing ONE academic PDF for an exam prep app.

Goals:
1) Classify the PDF type strictly: syllabus | notes | question_paper
2) Detect the SUBJECT name (example: "Operating Systems", "DBMS", "CN", etc.)
3) Extract a clean topic list that can be used for practice generation.
4) If the PDF is a question paper, infer the exam pattern using the generic question type schema.

Rules:
- Return ONLY JSON.
- topics must be practical exam topics, not generic words like "General".
- Keep topics <= 12 items.
- unit can be "Unit 1", "Module 2", "Chapter 3", etc. If unknown use "Unit".
- If it is a question_paper, also infer which topics appear frequently (topicFrequency).
- topicFrequency should be a dict: {{"Topic": countEstimate}} (rough estimate is ok).
- examPattern must support all question types:
  - mcq
  - fill_blank
  - true_false
  - descriptive
- If a type does not appear, set its count and marks to 0.
- negativeMarks should default to 0.

Return JSON schema:
{{
  "type": "syllabus|notes|question_paper",
  "subject": "Subject Name or Unknown",
  "topics": [{{"unit":"Unit/Module","topic":"Topic"}}],
  "topicFrequency": {{"Topic": 0}},
  "examPattern": {{
    "questionTypes": {{
      "mcq": {{"count": 0, "marks": 0, "negativeMarks": 0}},
      "fill_blank": {{"count": 0, "marks": 0, "negativeMarks": 0}},
      "true_false": {{"count": 0, "marks": 0, "negativeMarks": 0}},
      "descriptive": {{"count": 0, "marks": 0, "negativeMarks": 0}}
    }}
  }}
}}

Important:
- Infer counts and per-question marks as best as possible from the paper.
- If the paper mixes sections, combine totals by question type.
- Do not omit any supported question type keys.

PDF Text (partial):
{text[:12000]}
"""
    parsed = call_gemini(prompt, expect_json=True)
    logger.warning("Gemini Parsed PDF Analysis:\n%s", json.dumps(parsed, indent=2))

    # parsed = None
    # try:
    #     parsed = json.loads(raw)
    # except:
    #     parsed = None

    # if not parsed:
    #     return {
    #         "type": "notes",
    #         "subject": "Unknown",
    #         "topics": [{"unit": "Unit", "topic": "General"}],
    #         "topicFrequency": {},
    #         "examPattern": {}
    #     }

    if not parsed:
        return {
            "type": "notes",
            "subject": "Unknown",
            "topics": [{"unit": "Unit", "topic": "General"}],
            "topicFrequency": {},
            "examPattern": {
                "questionTypes": {
                    "mcq": {"count": 0, "marks": 0, "negativeMarks": 0},
                    "fill_blank": {"count": 0, "marks": 0, "negativeMarks": 0},
                    "true_false": {"count": 0, "marks": 0, "negativeMarks": 0},
                    "descriptive": {"count": 0, "marks": 0, "negativeMarks": 0},
                }
            }
        }

    parsed.setdefault("subject", "Unknown")
    parsed.setdefault("topics", [{"unit": "Unit", "topic": "General"}])
    parsed.setdefault("topicFrequency", {})
    parsed.setdefault("examPattern", {})

    if not parsed["topics"]:
        parsed["topics"] = [{"unit": "Unit", "topic": "General"}]

    # normalize examPattern
    parsed["examPattern"] = normalize_exam_pattern(parsed.get("examPattern") or {})

    return parsed


def merge_context_by_topics(collection, topics, limit_per_topic=4):
    merged = []
    for t in topics:
        ctx = fetch_topic_chunks(collection, t)
        if ctx:
            merged.append(f"\n### {t}\n{ctx}")
    return "\n".join(merged)


# utils.py

_topic_emb_cache = {}   # { tuple(topics): np.ndarray }
_topic_list_cache = {}  # { tuple(topics): list[str] }

def map_to_closest_topic(given_topic: str, allowed_topics: list[str], threshold: float = 0.35) -> str:
    """
    Maps unknown/variant topic string to the closest allowed topic using sentence-transformers.
    If similarity is below threshold -> returns "General" (or first allowed).
    """
    if not allowed_topics:
        return "General"

    given = (given_topic or "").strip()
    if not given:
        return allowed_topics[0] if allowed_topics else "General"

    # exact / case-insensitive exact
    for t in allowed_topics:
        if given.lower() == (t or "").strip().lower():
            return t

    model = get_embedding_model()

    # cache embeddings for allowed topics
    key = tuple(allowed_topics)
    if key not in _topic_emb_cache:
        embs = model.encode(list(allowed_topics))
        _topic_emb_cache[key] = np.asarray(embs, dtype=np.float32)
        _topic_list_cache[key] = list(allowed_topics)

    topic_embs = _topic_emb_cache[key]
    q_emb = np.asarray(model.encode([given])[0], dtype=np.float32)

    # cosine similarity
    denom = (np.linalg.norm(topic_embs, axis=1) * (np.linalg.norm(q_emb) + 1e-9)) + 1e-9
    sims = (topic_embs @ q_emb) / denom

    best_idx = int(np.argmax(sims))
    best_score = float(sims[best_idx])

    if best_score >= float(threshold):
        return _topic_list_cache[key][best_idx]

    # fallback
    if "General" in allowed_topics:
        return "General"
    return allowed_topics[0]


# utils.py
# utils.py
def merge_context_by_topics_budgeted(
    collection,
    topics: list[str],
    per_topic_results: int = 2,      # how many chunks per topic from Chroma
    max_chars: int = 12000,          # total prompt budget
    max_chars_per_topic: int = 900   # limit each topic block
):
    merged = []
    used = 0

    for t in topics:
        t = (t or "").strip()
        if not t:
            continue

        ctx = fetch_topic_chunks(collection, t, n_results=per_topic_results)
        if not ctx:
            continue

        ctx_small = ctx[:max_chars_per_topic].strip()
        block = f"\n### {t}\n{ctx_small}\n"

        if used + len(block) > max_chars:
            break

        merged.append(block)
        used += len(block)

    return "".join(merged).strip()


def top_n_weights(weights: dict, n: int = 10):
    if not weights:
        return {}
    items = sorted(weights.items(), key=lambda x: x[1], reverse=True)[:n]
    return {k: float(v) for k, v in items}

def get_allowed_topics_for_chat(chat_id: str) -> list[str]:
    db_topics = SubjectTopic.query.filter_by(chat_id=chat_id).all()
    allowed = [t.topic_name.strip() for t in db_topics if t.topic_name and t.topic_name.strip()]
    return allowed or ["General"]


# -------------------------
# NEW HELPERS FOR GENERIC EXAM TYPES
# -------------------------

def parse_bloom_levels(raw):
    if not raw:
        return ["Understand"]

    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]

    s = str(raw).strip()
    if not s:
        return ["Understand"]

    # backward compat
    legacy_map = {
        "easy": ["Remember"],
        "medium": ["Understand", "Apply"],
        "hard": ["Analyze", "Evaluate"]
    }
    if s.lower() in legacy_map:
        return legacy_map[s.lower()]

    try:
        parsed = json.loads(s)
        if isinstance(parsed, list):
            cleaned = [str(x).strip() for x in parsed if str(x).strip()]
            return cleaned or ["Understand"]
    except:
        pass

    return [s]


def default_question_type_config(qtype: str):
    if qtype == "descriptive":
        return {"count": 0, "marks": 10, "negativeMarks": 0}
    if qtype == "mcq":
        return {"count": 0, "marks": 1, "negativeMarks": 0}
    if qtype == "fill_blank":
        return {"count": 0, "marks": 1, "negativeMarks": 0}
    if qtype == "true_false":
        return {"count": 0, "marks": 1, "negativeMarks": 0}
    return {"count": 0, "marks": 1, "negativeMarks": 0}


def get_question_types_config(exam_cfg: dict):
    # old_mcq = exam_cfg.get("mcq") or {"count": 0, "marks": 1}
    # old_desc = exam_cfg.get("descriptive") or {"count": 0, "marks": 10}

    question_types = exam_cfg.get("questionTypes")
    if isinstance(question_types, dict) and question_types:
        normalized = {}
        for qtype in ["mcq", "fill_blank", "descriptive", "true_false"]:
            raw = question_types.get(qtype) or {}
            base = default_question_type_config(qtype)
            neg = float(raw.get("negativeMarks", base["negativeMarks"]) or 0)
            if qtype == "descriptive":
                neg = 0.0  # ✅ force off for descriptive
            normalized[qtype] = {
                "count": int(raw.get("count", base["count"]) or 0),
                "marks": float(raw.get("marks", base["marks"]) or 0),
                "negativeMarks": neg,
            }
        return normalized

    # backward compatibility
    old_mcq = exam_cfg.get("mcq") or {"count": 0, "marks": 1}
    old_desc = exam_cfg.get("descriptive") or {"count": 0, "marks": 10}
    return {
        "mcq": {
            "count": int(old_mcq.get("count", 0) or 0),
            "marks": float(old_mcq.get("marks", 1) or 0),
            "negativeMarks": 0.0
        },
        "fill_blank": {"count": 0, "marks": 1, "negativeMarks": 0.0},
        "descriptive": {
            "count": int(old_desc.get("count", 0) or 0),
            "marks": float(old_desc.get("marks", 10) or 0),
            "negativeMarks": 0.0
        },
        "true_false": {"count": 0, "marks": 1, "negativeMarks": 0.0},
    }


def normalize_text_answer(v):
    return re.sub(r"\s+", " ", str(v or "").strip()).lower()


def compare_objective_answer(user_ans, correct_ans, qtype="mcq"):
    if qtype == "mcq":
        ua = str(user_ans or "").strip().upper()
        ca = str(correct_ans or "").strip().upper()
        return ua == ca

    if qtype == "true_false":
        ua = normalize_text_answer(user_ans)
        ca = normalize_text_answer(correct_ans)

        truthy = {"true", "t", "yes"}
        falsy = {"false", "f", "no"}

        if ua in truthy:
            ua = "true"
        elif ua in falsy:
            ua = "false"

        if ca in truthy:
            ca = "true"
        elif ca in falsy:
            ca = "false"

        return ua == ca

    # if qtype == "fill_blank":
    #     ua = normalize_text_answer(user_ans)
    #     ca = correct_ans

    #     if isinstance(ca, list):
    #         return ua in [normalize_text_answer(x) for x in ca]

    #     return ua == normalize_text_answer(ca)

    if qtype == "fill_blank":
        # fast deterministic local match first
        if is_fill_blank_match(user_ans, correct_ans):
            return True

        # optional LLM fallback for semantic equivalence
        return llm_check_fill_blank_equivalence(user_ans, correct_ans)

    return normalize_text_answer(user_ans) == normalize_text_answer(correct_ans)


def normalize_fill_blank_text(v: str) -> str:
    s = str(v or "").strip().lower()

    # replace hyphens/underscores/slashes with spaces
    s = re.sub(r"[-_/]+", " ", s)

    # remove punctuation
    s = s.translate(str.maketrans("", "", string.punctuation))

    # collapse whitespace
    s = re.sub(r"\s+", " ", s).strip()

    return s


def token_set(s: str) -> set:
    return set(normalize_fill_blank_text(s).split())


def is_fill_blank_match(user_ans, correct_ans) -> bool:
    """
    Flexible local matcher for fill-in-the-blank answers.
    Supports:
    - exact normalized match
    - list of accepted answers
    - punctuation/hyphen-insensitive matching
    - subset token matching for short phrases
    """
    ua = normalize_fill_blank_text(user_ans)
    if not ua:
        return False

    accepted = correct_ans if isinstance(correct_ans, list) else [correct_ans]

    normalized_accepted = []
    for ans in accepted:
        na = normalize_fill_blank_text(ans)
        if na:
            normalized_accepted.append(na)

    if not normalized_accepted:
        return False

    # 1) exact normalized match
    if ua in normalized_accepted:
        return True

    ua_tokens = token_set(ua)

    for ca in normalized_accepted:
        ca_tokens = token_set(ca)

        # 2) token equality
        if ua_tokens == ca_tokens and ua_tokens:
            return True

        # 3) subset match for short phrases
        # e.g. "mutex" vs "mutex lock"
        if ua_tokens and ca_tokens:
            if ua_tokens.issubset(ca_tokens) or ca_tokens.issubset(ua_tokens):
                # avoid very weak one-word accidental matches unless meaningful
                if min(len(ua_tokens), len(ca_tokens)) >= 1 and max(len(ua_tokens), len(ca_tokens)) <= 3:
                    return True

    return False

def llm_check_fill_blank_equivalence(user_ans: str, correct_ans) -> bool:
    """
    Uses LLM as a fallback only when local matching fails.
    Returns True only for clear semantic equivalence.
    """
    accepted = correct_ans if isinstance(correct_ans, list) else [correct_ans]

    prompt = f"""
You are grading a fill-in-the-blank answer.

Decide whether the student's answer should be accepted as correct.

Rules:
- Accept differences in capitalization, punctuation, hyphenation, pluralization, and very close phrasing.
- Accept short equivalent technical phrases only if they clearly mean the same thing in this context.
- Be strict. Do NOT accept loosely related answers.
- Return ONLY JSON:
{{"isCorrect": true}}

or

{{"isCorrect": false}}

Student answer:
{json.dumps(str(user_ans or ""))}

Accepted correct answers:
{json.dumps(accepted, indent=2)}
"""
    try:
        result = call_gemini(prompt, expect_json=True) or {}
        return bool(result.get("isCorrect", False))
    except Exception:
        return False



def pick_bloom_level_for_question(question: dict, allowed_blooms: list[str]) -> str:
    """
    Tries to preserve model-provided bloom level if present.
    Otherwise falls back safely.
    """
    valid = {"Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"}

    raw = question.get("bloomLevel") or question.get("bloom") or ""
    s = str(raw).strip().title()

    if s in valid:
        if allowed_blooms and s in allowed_blooms:
            return s
        if not allowed_blooms:
            return s

    # fallback preference
    cleaned = [str(x).strip().title() for x in (allowed_blooms or []) if str(x).strip().title() in valid]
    if cleaned:
        return cleaned[0]

    return "Understand"


def summarize_topic_analytics(weak_map: dict, top_k: int = 5):
    result = []

    for topic, rec in (weak_map or {}).items():
        if not isinstance(rec, dict):
            continue

        by_bloom = sorted(
            [(k, v.get("score", 0.0), v.get("seen", 0)) for k, v in (rec.get("byBloom") or {}).items()],
            key=lambda x: (x[1], x[2]),
            reverse=True
        )

        by_type = sorted(
            [(k, v.get("score", 0.0), v.get("seen", 0)) for k, v in (rec.get("byType") or {}).items()],
            key=lambda x: (x[1], x[2]),
            reverse=True
        )

        by_difficulty = sorted(
            [(k, v.get("score", 0.0), v.get("seen", 0)) for k, v in (rec.get("byDifficulty") or {}).items()],
            key=lambda x: (x[1], x[2]),
            reverse=True
        )

        result.append({
            "topic": topic,
            "score": rec.get("score", 0.0),
            "seen": rec.get("seen", 0),
            "topWeakBlooms": [x[0] for x in by_bloom[:top_k]],
            "topWeakTypes": [x[0] for x in by_type[:top_k]],
            "topWeakDifficulties": [x[0] for x in by_difficulty[:top_k]],
        })

    result.sort(key=lambda x: (x["score"], x["seen"]), reverse=True)
    return result






















# # ✅ utils.py (UPDATED)

# import os
# import uuid
# import json
# import re
# from datetime import datetime, timedelta
# import time
# from jose import jwt
# from jose.exceptions import JWTError
# from werkzeug.security import generate_password_hash, check_password_hash
# from PyPDF2 import PdfReader
# from sentence_transformers import SentenceTransformer
# from chromadb import PersistentClient
# from llm import call_gemini
# from models import *
# import hashlib
# from logger import get_logger
# import numpy as np
# logger = get_logger("utils")


# SECRET_KEY = os.getenv("JWT_SECRET", "exam-secret")

# _embedding_model = None
# _chroma_client = None


# # BASIC

# def generate_id():
#     return str(uuid.uuid4())


# def hash_password(p):
#     return generate_password_hash(p)


# def verify_password(h, p):
#     return check_password_hash(h, p)


# # JWT

# def generate_token(uid):
#     payload = {
#         "user_id": uid,
#         "exp": datetime.utcnow() + timedelta(days=7)
#     }
#     return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


# def verify_token(token):
#     try:
#         data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
#         return data.get("user_id")
#     except JWTError:
#         return None


# # PDF

# def extract_text_from_pdf(path):
#     reader = PdfReader(path)
#     text = ""

#     for i, page in enumerate(reader.pages):
#         t = page.extract_text()
#         if t:
#             text += f"Page {i+1}:\n{t}\n"

#     return text


# # EMBEDDINGS

# def get_embedding_model():
#     global _embedding_model
#     if _embedding_model is None:
#         _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
#     return _embedding_model


# def create_embeddings(text, chunk_size=450):

#     logger.info(f"Creating embeddings for text length={len(text)}")

#     words = text.split()
#     chunks = []

#     for i in range(0, len(words), chunk_size):
#         chunks.append(" ".join(words[i:i+chunk_size]))

#     logger.info(f"Chunks created: {len(chunks)}")

#     model = get_embedding_model()
#     emb = model.encode(chunks)

#     logger.info("Embeddings generated successfully")

#     return chunks, emb.tolist()


# # CHROMA

# def chroma_collection_name(user_id, chat_id):
#     raw = f"{user_id}_{chat_id}"
#     short = hashlib.md5(raw.encode()).hexdigest()[:24]
#     return f"uc_{short}"


# def get_chroma_client():
#     global _chroma_client

#     if _chroma_client is None:
#         logger.info("Initializing Chroma client at ./chroma_db")
#         _chroma_client = PersistentClient(path="./chroma_db")

#     return _chroma_client


# def get_chroma_collection(client, name, retries=5, sleep=0.2):
#     for i in range(retries):
#         try:
#             return client.get_collection(name=name)
#         except Exception:
#             try:
#                 return client.create_collection(name=name)
#             except Exception as e:
#                 # if it already exists due to race, wait and try get again
#                 if "already exists" in str(e).lower():
#                     time.sleep(sleep * (i + 1))
#                     continue
#                 raise
#     return client.get_collection(name=name)


# def store_embeddings_in_chroma(user_id, chat_id, pdf_id, tagged_chunks, embeddings, pdf_type):

#     logger.info(f"Storing embeddings → user={user_id} chat={chat_id} pdf={pdf_id}")

#     client = get_chroma_client()
#     name = chroma_collection_name(user_id, chat_id)

#     logger.info(f"Using Chroma collection: {name}")

#     # collection = client.get_or_create_collection(name=name)
#     collection = get_chroma_collection(client, name)

#     docs, ids, meta = [], [], []

#     for i, chunk in enumerate(tagged_chunks):
#         docs.append(chunk["text"])
#         ids.append(f"{pdf_id}_{i}")

#         # meta.append({
#         #     "topics": ",".join(chunk["topics"]),
#         #     "pdf_type": pdf_type
#         # })
#         meta.append({
#             "topics": json.dumps(chunk["topics"]),  # ✅ store as JSON array
#             "pdf_type": pdf_type
#         })

#     collection.add(documents=docs, embeddings=embeddings, ids=ids, metadatas=meta)

#     logger.info(f"Stored {len(docs)} embeddings in Chroma")



# # def fetch_topic_chunks(collection, topic):

# #     logger.info(f"Querying Chroma for topic: {topic}")

# #     res = collection.query(
# #         query_texts=[topic],
# #         n_results=8
# #     )

# #     if res and res.get("documents"):
# #         logger.info(f"Chunks found: {len(res['documents'][0])}")
# #         return "\n".join(res["documents"][0])

# #     logger.warning("No chunks found")
# #     return ""

# # def fetch_topic_chunks(collection, topic):
# #     logger.info(f"Querying Chroma for topic: {topic}")

# #     model = get_embedding_model()
# #     q_emb = model.encode([topic]).tolist()   # <-- compute embedding yourself

# #     res = collection.query(
# #         query_embeddings=q_emb,             # <-- use embeddings
# #         n_results=8
# #     )

# #     if res and res.get("documents"):
# #         logger.info(f"Chunks found: {len(res['documents'][0])}")
# #         return "\n".join(res["documents"][0])

# #     logger.warning("No chunks found")
# #     return ""


# def fetch_topic_chunks(collection, topic, n_results=3):
#     logger.info(f"Querying Chroma for topic: {topic}")

#     model = get_embedding_model()
#     q_emb = model.encode([topic]).tolist()

#     res = collection.query(
#         query_embeddings=q_emb,
#         n_results=n_results
#     )

#     if res and res.get("documents"):
#         return "\n".join(res["documents"][0])

#     return ""


# # TOPIC TAGGING

# # def tag_chunk_with_topics(chunk, topic_tree):
# #     # OLD
# #     # matched = []
# #     #
# #     # for t in topic_tree:
# #     #     if t["topic"].lower() in chunk.lower():
# #     #         matched.append(t["topic"])
# #     #
# #     # if not matched:
# #     #     matched.append("General")
# #     #
# #     # return matched

# #     # UPDATED: cheap token-overlap scoring (NO LLM calls)
# #     text = (chunk or "").lower()
# #     tokens = set(re.findall(r"[a-zA-Z]{3,}", text))

# #     best_topic = None
# #     best_score = 0

# #     for t in topic_tree:
# #         topic = (t.get("topic") or "").lower()
# #         topic_tokens = set(re.findall(r"[a-zA-Z]{3,}", topic))
# #         if not topic_tokens:
# #             continue

# #         score = len(tokens.intersection(topic_tokens))
# #         if score > best_score:
# #             best_score = score
# #             best_topic = t.get("topic")

# #     if best_topic and best_score >= 1:
# #         return [best_topic]

# #     return ["General"]


# def tag_chunk_with_topics(chunk, topic_tree):
#     if not topic_tree:
#         return ["General"]

#     model = get_embedding_model()

#     topics = [t["topic"] for t in topic_tree if t.get("topic")]
#     if not topics:
#         return ["General"]

#     chunk_emb = model.encode([chunk])[0]
#     topic_embs = model.encode(topics)

#     # cosine similarity
#     sims = np.dot(topic_embs, chunk_emb) / (np.linalg.norm(topic_embs, axis=1) * np.linalg.norm(chunk_emb) + 1e-9)
#     best_idx = int(np.argmax(sims))

#     return [topics[best_idx]]


# # GEMINI JSON SAFE

# # def safe_json_extract(text):
# #     try:
# #         match = re.search(r"\[.*\]", text, re.DOTALL)
# #         if match:
# #             return json.loads(match.group())
# #     except:
# #         pass
# #     return []

# # utils.py
# def safe_json_extract(text: str):
#     if not text:
#         return []

#     # 1) Prefer fenced ```json ... ```
#     fence = re.search(r"```json\s*(\[[\s\S]*?\])\s*```", text, re.IGNORECASE)
#     if fence:
#         try:
#             return json.loads(fence.group(1))
#         except:
#             pass

#     # 2) Any fenced ``` ... ```
#     fence2 = re.search(r"```\s*(\[[\s\S]*?\])\s*```", text)
#     if fence2:
#         try:
#             return json.loads(fence2.group(1))
#         except:
#             pass

#     # 3) Fallback: first bracketed array (non-greedy)
#     arr = re.search(r"(\[[\s\S]*?\])", text)
#     if arr:
#         try:
#             return json.loads(arr.group(1))
#         except:
#             pass

#     return []


# # SYLLABUS EXTRACTION

# def extract_topic_tree_from_text(text):

#     prompt = f"""
# Extract syllabus units and topics.

# Return ONLY JSON array:
# [{{"unit":"Unit","topic":"Topic"}}]

# {text[:10000]}
# """

#     raw = call_gemini(prompt)

#     try:
#         return json.loads(raw)
#     except:
#         return [{"unit": "Unit", "topic": "General"}]


# # WEAK TOPIC DETECTION
# # def update_weak_topics(existing, new_topics):
# #     """
# #     existing: dict
# #     new_topics: list[str]
# #     """
# #     if not existing:
# #         existing = {}

# #     for t in new_topics:
# #         existing[t] = existing.get(t, 0) + 1

# #     return existing

# def update_topic_weakness(existing: dict, topic_events: list[dict], alpha: float = 0.25):
#     """
#     existing: chat.weak_topics_json parsed dict
#       - old format: {"Topic": count}
#       - new format: {"Topic": {"score": float, "seen": int, "last": str}}

#     topic_events: list of events like:
#       [{"topic": "System Calls", "correct": True}, {"topic": "Memory", "correct": False}, ...]

#     alpha: smoothing factor (0.1 to 0.35 typical)
#       higher alpha => reacts faster to recent performance
#     """

#     if not existing:
#         existing = {}

#     # migrate old format (count) to new format
#     for t, v in list(existing.items()):
#         if isinstance(v, int):
#             # old count means "weak" historically -> start at moderate weakness
#             existing[t] = {"score": min(1.0, 0.5 + 0.1 * v), "seen": v, "last": None}

#     now = datetime.utcnow().isoformat()

#     # Aggregate per-topic performance for THIS submission
#     per_topic = {}
#     for ev in topic_events:
#         t = (ev.get("topic") or "General").strip()
#         correct = bool(ev.get("correct"))
#         if t not in per_topic:
#             per_topic[t] = {"correct": 0, "total": 0}
#         per_topic[t]["total"] += 1
#         if correct:
#             per_topic[t]["correct"] += 1

#     # Update EMA weakness per topic
#     for topic, stats in per_topic.items():
#         acc = stats["correct"] / max(stats["total"], 1)   # 0..1
#         target_weakness = 1.0 - acc                        # 0 (strong) .. 1 (weak)

#         rec = existing.get(topic)
#         if not rec or not isinstance(rec, dict):
#             rec = {"score": 0.5, "seen": 0, "last": None}

#         old = float(rec.get("score", 0.5))
#         new_score = (1 - alpha) * old + alpha * target_weakness

#         rec["score"] = round(float(new_score), 4)
#         rec["seen"] = int(rec.get("seen", 0)) + int(stats["total"])
#         rec["last"] = now

#         existing[topic] = rec

#     return existing


# def top_weak_topics(existing: dict, k: int = 5, min_seen: int = 1):
#     """
#     Returns topics sorted by weakness score desc.
#     """
#     if not existing:
#         return []

#     items = []
#     for t, v in existing.items():
#         if isinstance(v, dict):
#             seen = int(v.get("seen", 0))
#             if seen >= min_seen:
#                 items.append((t, float(v.get("score", 0.0)), seen))
#         elif isinstance(v, int):
#             # old format fallback
#             items.append((t, min(1.0, 0.5 + 0.1 * v), v))

#     items.sort(key=lambda x: (x[1], x[2]), reverse=True)  # weakness then seen
#     return [t for (t, _, __) in items[:k]]


# def detect_pdf_type_llm(text):
#     prompt = f"""
# Classify this document strictly into one category:
# - syllabus
# - notes
# - question_paper

# Return ONLY one word.

# {text[:6000]}
# """
#     result = call_gemini(prompt).lower()

#     if "syllabus" in result:
#         return "syllabus"
#     if "question" in result:
#         return "question_paper"
#     return "notes"


# # def compute_topic_weights(collection):

# #     data = collection.get(include=["metadatas"])
# #     metas = data.get("metadatas", [])

# #     logger.info(f"Chroma metadata count: {len(metas)}")

# #     counts = {}
# #     total = 0

# #     for m in metas:
# #         topics = m.get("topics", "").split(",")
# #         for t in topics:
# #             counts[t] = counts.get(t, 0) + 1
# #             total += 1

# #     weights = {t: c/total for t, c in counts.items()} if total else {}

# #     logger.info(f"Computed topic weights: {weights}")

# #     return weights

# # def compute_topic_weights(collection):
# #     data = collection.get(include=["metadatas"])
# #     metas = data.get("metadatas", [])

# #     counts = {}
# #     total = 0

# #     for m in metas:
# #         raw = m.get("topics", "[]")

# #         # ✅ read list safely
# #         try:
# #             topics = json.loads(raw) if isinstance(raw, str) else (raw or [])
# #         except:
# #             topics = []

# #         for t in topics:
# #             t = (t or "").strip()
# #             if not t:
# #                 continue
# #             counts[t] = counts.get(t, 0) + 1
# #             total += 1

# #     return {t: c / total for t, c in counts.items()} if total else {}


# def compute_topic_weights(collection):
#     data = collection.get(include=["metadatas"])
#     metas = data.get("metadatas", [])

#     counts = {}
#     total = 0

#     for m in metas:
#         raw = m.get("topics", "[]")

#         topics = []
#         if isinstance(raw, list):
#             topics = raw
#         elif isinstance(raw, str):
#             s = raw.strip()
#             if s.startswith("["):
#                 try:
#                     topics = json.loads(s)
#                 except:
#                     topics = []
#             else:
#                 # ✅ backward compat: comma-separated
#                 topics = [x.strip() for x in s.split(",") if x.strip()]

#         for t in topics:
#             t = (t or "").strip()
#             if not t:
#                 continue
#             counts[t] = counts.get(t, 0) + 1
#             total += 1

#     return {t: c / total for t, c in counts.items()} if total else {}


# def distribute_questions(weights, total_q):

#     if not weights:
#         return {"General": total_q}

#     allocation = {}

#     for t, w in weights.items():
#         allocation[t] = max(1, round(w * total_q))

#     while sum(allocation.values()) > total_q:
#         allocation[max(allocation, key=allocation.get)] -= 1

#     while sum(allocation.values()) < total_q:
#         allocation[max(weights, key=weights.get)] += 1

#     return allocation


# def calibrate_exam_config(chat, pyq_text):

#     prompt = f"""
# Analyze this previous year question paper.

# Extract:
# - total questions
# - number of MCQs
# - marks per MCQ
# - number of descriptive questions
# - marks per descriptive question

# Return ONLY JSON:

# {{
#  "totalQuestions": number,
#  "mcq": {{"count": number, "marks": number}},
#  "descriptive": {{"count": number, "marks": number}}
# }}

# {pyq_text[:6000]}
# """

#     raw = call_gemini(prompt)

#     try:
#         inferred = json.loads(raw)
#         base = json.loads(chat.exam_config)

#         base.update(inferred)

#         chat.exam_config = json.dumps(base)
#         db.session.commit()

#     except:
#         pass


# def is_duplicate(chat_id, question, topic, weak_topics):
#     h = hashlib.sha256(question.encode()).hexdigest()

#     existing = GeneratedQuestion.query.filter_by(
#         chat_id=chat_id,
#         question_hash=h
#     ).first()

#     if existing and topic not in weak_topics:
#         return True

#     if existing:
#         existing.times_asked += 1
#     else:
#         db.session.add(GeneratedQuestion(
#             id=generate_id(),
#             chat_id=chat_id,
#             question_hash=h,
#             topic=topic
#         ))

#     return False


# def ensure_topics_exist(chat_id, text):
#     """
#     Ensures SubjectTopic exists.
#     Used when syllabus is missing but notes/PYQ exist.
#     """
#     # OLD
#     # from server.models import SubjectTopic, db

#     # UPDATED: local models import already available
#     existing = SubjectTopic.query.filter_by(chat_id=chat_id).first()
#     if existing:
#         return

#     prompt = f"""
# Infer syllabus-style topics and units from this content.

# Return ONLY JSON:
# [{{"unit":"Unit","topic":"Topic"}}]

# {text[:8000]}
# """

#     raw = call_gemini(prompt)

#     try:
#         topics = json.loads(raw)
#     except:
#         topics = [{"unit": "Unit", "topic": "General"}]

#     for t in topics:
#         db.session.add(SubjectTopic(
#             chat_id=chat_id,
#             unit_name=t.get("unit", "Unit"),
#             topic_name=t.get("topic", "General")
#         ))

#     db.session.commit()


# def generate_without_pdfs(chat, user):
#     exam_cfg = json.loads(chat.exam_config)
#     bloom = chat.bloom_level or "understand"

#     prompt = f"""
# Generate exam questions using standard syllabus knowledge.

# Exam Type: {chat.exam_type}
# Bloom Level: {bloom}
# Config: {json.dumps(exam_cfg)}

# Return JSON array:
# [
#  {{
#   "id":"q1",
#   "type":"mcq|descriptive",
#   "question":"...",
#   "options":[],
#   "answer":""
#  }}
# ]
# """

#     raw = call_gemini(prompt)
#     return safe_json_extract(raw)


# def analyze_pdf_intelligence(text):
#     # OLD
#     # prompt = f"""
#     # Analyze this academic PDF.
#     #
#     # Tasks:
#     # 1. Classify type: syllabus | notes | question_paper
#     # 2. If syllabus → extract units & topics
#     # 3. If question_paper → infer exam pattern
#     # 4. Infer topics if syllabus missing
#     #
#     # Return ONLY JSON:
#     # {{
#     #   "type": "syllabus|notes|question_paper",
#     #   "topics": [{{"unit":"Unit","topic":"Topic"}}],
#     #   "examPattern": {{
#     #     "mcq": {{"count": 0, "marks": 0}},
#     #     "descriptive": {{"count": 0, "marks": 0}}
#     #   }}
#     # }}
#     #
#     # {text[:8000]}
#     # """
#     # raw = call_gemini(prompt)
#     #
#     # try:
#     #     return json.loads(raw)
#     # except:
#     #     return {
#     #         "type": "notes",
#     #         "topics": [{"unit": "General", "topic": "General"}],
#     #         "examPattern": {}
#     #     }

#     # UPDATED (still ONE LLM call, richer output)
#     prompt = f"""
# You are analyzing ONE academic PDF for an exam prep app.

# Goals:
# 1) Classify the PDF type strictly: syllabus | notes | question_paper
# 2) Detect the SUBJECT name (example: "Operating Systems", "DBMS", "CN", etc.)
# 3) Extract a clean topic list that can be used for practice generation.

# Rules:
# - Return ONLY JSON.
# - topics must be practical exam topics, not generic words like "General".
# - Keep topics <= 12 items.
# - unit can be "Unit 1", "Module 2", "Chapter 3", etc. If unknown use "Unit".
# - If it is a question_paper, also infer which topics appear frequently (topicFrequency).
#   topicFrequency should be a dict: {{"Topic": countEstimate}} (rough estimate is ok).

# Return JSON schema:
# {{
#   "type": "syllabus|notes|question_paper",
#   "subject": "Subject Name or Unknown",
#   "topics": [{{"unit":"Unit/Module","topic":"Topic"}}],
#   "topicFrequency": {{"Topic": 0}},
#   "examPattern": {{
#     "mcq": {{"count": 0, "marks": 0}},
#     "descriptive": {{"count": 0, "marks": 0}}
#   }}
# }}

# PDF Text (partial):
# {text[:12000]}
# """
#     parsed = call_gemini(prompt, expect_json=True)
#     logger.warning("Gemini Parsed PDF Analysis:\n%s", json.dumps(parsed, indent=2))

#     # parsed = None
#     # try:
#     #     parsed = json.loads(raw)
#     # except:
#     #     parsed = None

#     if not parsed:
#         return {
#             "type": "notes",
#             "subject": "Unknown",
#             "topics": [{"unit": "Unit", "topic": "General"}],
#             "topicFrequency": {},
#             "examPattern": {}
#         }

#     parsed.setdefault("subject", "Unknown")
#     parsed.setdefault("topics", [{"unit": "Unit", "topic": "General"}])
#     parsed.setdefault("topicFrequency", {})
#     parsed.setdefault("examPattern", {})

#     if not parsed["topics"]:
#         parsed["topics"] = [{"unit": "Unit", "topic": "General"}]

#     return parsed


# def merge_context_by_topics(collection, topics, limit_per_topic=4):
#     merged = []
#     for t in topics:
#         ctx = fetch_topic_chunks(collection, t)
#         if ctx:
#             merged.append(f"\n### {t}\n{ctx}")
#     return "\n".join(merged)


# # utils.py

# _topic_emb_cache = {}   # { tuple(topics): np.ndarray }
# _topic_list_cache = {}  # { tuple(topics): list[str] }

# def map_to_closest_topic(given_topic: str, allowed_topics: list[str], threshold: float = 0.35) -> str:
#     """
#     Maps unknown/variant topic string to the closest allowed topic using sentence-transformers.
#     If similarity is below threshold -> returns "General" (or first allowed).
#     """
#     if not allowed_topics:
#         return "General"

#     given = (given_topic or "").strip()
#     if not given:
#         return allowed_topics[0] if allowed_topics else "General"

#     # exact / case-insensitive exact
#     for t in allowed_topics:
#         if given.lower() == (t or "").strip().lower():
#             return t

#     model = get_embedding_model()

#     # cache embeddings for allowed topics
#     key = tuple(allowed_topics)
#     if key not in _topic_emb_cache:
#         embs = model.encode(list(allowed_topics))
#         _topic_emb_cache[key] = np.asarray(embs, dtype=np.float32)
#         _topic_list_cache[key] = list(allowed_topics)

#     topic_embs = _topic_emb_cache[key]
#     q_emb = np.asarray(model.encode([given])[0], dtype=np.float32)

#     # cosine similarity
#     denom = (np.linalg.norm(topic_embs, axis=1) * (np.linalg.norm(q_emb) + 1e-9)) + 1e-9
#     sims = (topic_embs @ q_emb) / denom

#     best_idx = int(np.argmax(sims))
#     best_score = float(sims[best_idx])

#     if best_score >= float(threshold):
#         return _topic_list_cache[key][best_idx]

#     # fallback
#     if "General" in allowed_topics:
#         return "General"
#     return allowed_topics[0]


# # utils.py
# # utils.py
# def merge_context_by_topics_budgeted(
#     collection,
#     topics: list[str],
#     per_topic_results: int = 2,      # how many chunks per topic from Chroma
#     max_chars: int = 12000,          # total prompt budget
#     max_chars_per_topic: int = 900   # limit each topic block
# ):
#     merged = []
#     used = 0

#     for t in topics:
#         t = (t or "").strip()
#         if not t:
#             continue

#         ctx = fetch_topic_chunks(collection, t, n_results=per_topic_results)
#         if not ctx:
#             continue

#         ctx_small = ctx[:max_chars_per_topic].strip()
#         block = f"\n### {t}\n{ctx_small}\n"

#         if used + len(block) > max_chars:
#             break

#         merged.append(block)
#         used += len(block)

#     return "".join(merged).strip()


# def top_n_weights(weights: dict, n: int = 10):
#     if not weights:
#         return {}
#     items = sorted(weights.items(), key=lambda x: x[1], reverse=True)[:n]
#     return {k: float(v) for k, v in items}

# def get_allowed_topics_for_chat(chat_id: str) -> list[str]:
#     db_topics = SubjectTopic.query.filter_by(chat_id=chat_id).all()
#     allowed = [t.topic_name.strip() for t in db_topics if t.topic_name and t.topic_name.strip()]
#     return allowed or ["General"]

