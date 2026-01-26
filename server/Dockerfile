FROM  python:3.10-slim
WORKDIR /app
COPY requirements.txt .
# RUN pip install --no-cache-dir -r requirements.txt
RUN apt-get update && apt-get install -y \
    gcc \
    ca-certificates \
    && update-ca-certificates \
    && pip install --upgrade pip \
    && pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt \
    && python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')" \
    && apt-get purge -y gcc \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

ENV HF_HOME=/root/.cache/huggingface
ENV TRANSFORMERS_OFFLINE=1
ENV CHROMA_TELEMETRY_DISABLED=1
COPY . .
CMD ["python", "app.py"]