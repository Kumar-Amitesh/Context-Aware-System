from sentence_transformers import SentenceTransformer
from logger import get_logger

logger = get_logger("utils")

_embedding_model = None


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