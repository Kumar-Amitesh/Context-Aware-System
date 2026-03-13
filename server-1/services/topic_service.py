import json
import numpy as np
from models import SubjectTopic
from extensions import db
from llm import call_gemini
from services.embedding_service import get_embedding_model

_topic_emb_cache = {}
_topic_list_cache = {}


def tag_chunk_with_topics(chunk, topic_tree):
    if not topic_tree:
        return ["General"]

    model = get_embedding_model()

    topics = [t["topic"] for t in topic_tree if t.get("topic")]
    if not topics:
        return ["General"]

    chunk_emb = model.encode([chunk])[0]
    topic_embs = model.encode(topics)

    sims = np.dot(topic_embs, chunk_emb) / (np.linalg.norm(topic_embs, axis=1) * np.linalg.norm(chunk_emb) + 1e-9)
    best_idx = int(np.argmax(sims))

    return [topics[best_idx]]


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


def ensure_topics_exist(chat_id, text):
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


def map_to_closest_topic(given_topic: str, allowed_topics: list[str], threshold: float = 0.35) -> str:
    if not allowed_topics:
        return "General"

    given = (given_topic or "").strip()
    if not given:
        return allowed_topics[0] if allowed_topics else "General"

    for t in allowed_topics:
        if given.lower() == (t or "").strip().lower():
            return t

    model = get_embedding_model()

    key = tuple(allowed_topics)
    if key not in _topic_emb_cache:
        embs = model.encode(list(allowed_topics))
        _topic_emb_cache[key] = np.asarray(embs, dtype=np.float32)
        _topic_list_cache[key] = list(allowed_topics)

    topic_embs = _topic_emb_cache[key]
    q_emb = np.asarray(model.encode([given])[0], dtype=np.float32)

    denom = (np.linalg.norm(topic_embs, axis=1) * (np.linalg.norm(q_emb) + 1e-9)) + 1e-9
    sims = (topic_embs @ q_emb) / denom

    best_idx = int(np.argmax(sims))
    best_score = float(sims[best_idx])

    if best_score >= float(threshold):
        return _topic_list_cache[key][best_idx]

    if "General" in allowed_topics:
        return "General"
    return allowed_topics[0]


def top_n_weights(weights: dict, n: int = 10):
    if not weights:
        return {}
    items = sorted(weights.items(), key=lambda x: x[1], reverse=True)[:n]
    return {k: float(v) for k, v in items}


def get_allowed_topics_for_chat(chat_id: str) -> list[str]:
    db_topics = SubjectTopic.query.filter_by(chat_id=chat_id).all()
    allowed = [t.topic_name.strip() for t in db_topics if t.topic_name and t.topic_name.strip()]
    return allowed or ["General"]


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