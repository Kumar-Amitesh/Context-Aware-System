import json
import hashlib
import time
from chromadb import PersistentClient
from logger import get_logger
from services.embedding_service import get_embedding_model

logger = get_logger("utils")

_chroma_client = None


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

    collection = get_chroma_collection(client, name)

    docs, ids, meta = [], [], []

    for i, chunk in enumerate(tagged_chunks):
        docs.append(chunk["text"])
        ids.append(f"{pdf_id}_{i}")
        meta.append({
            "topics": json.dumps(chunk["topics"]),
            "pdf_type": pdf_type
        })

    collection.add(documents=docs, embeddings=embeddings, ids=ids, metadatas=meta)

    logger.info(f"Stored {len(docs)} embeddings in Chroma")


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
                topics = [x.strip() for x in s.split(",") if x.strip()]

        for t in topics:
            t = (t or "").strip()
            if not t:
                continue
            counts[t] = counts.get(t, 0) + 1
            total += 1

    return {t: c / total for t, c in counts.items()} if total else {}


def merge_context_by_topics(collection, topics, limit_per_topic=4):
    merged = []
    for t in topics:
        ctx = fetch_topic_chunks(collection, t)
        if ctx:
            merged.append(f"\n### {t}\n{ctx}")
    return "\n".join(merged)


def merge_context_by_topics_budgeted(
    collection,
    topics: list[str],
    per_topic_results: int = 2,
    max_chars: int = 12000,
    max_chars_per_topic: int = 900
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