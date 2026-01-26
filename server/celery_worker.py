# from celery import Celery
# from app import app, db
# from models import Chat, PDFDocument, SubjectTopic
# from utils import *

from extensions import celery, db
from models import Chat, PDFDocument, SubjectTopic
from utils import *
from flask import Flask
from app import app 

# celery = Celery(
#     "worker",
#     broker="redis://localhost:6379/0",
# )

@celery.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 10},
    retry_backoff=True
)
def process_pdf_task(self, pdf_id, user_id, chat_id, path):

    with app.app_context():

        pdf = PDFDocument.query.get(pdf_id)
        chat = Chat.query.get(chat_id)

        try:
            text = extract_text_from_pdf(path)

            detected_type = detect_pdf_type_llm(text)
            pdf.pdf_type = detected_type

            # ---------- SYLLABUS ----------
            if detected_type == "syllabus":
                topic_tree = extract_topic_tree_from_text(text)

                for t in topic_tree:
                    exists = SubjectTopic.query.filter_by(
                        chat_id=chat_id,
                        topic_name=t["topic"],
                        unit_name=t["unit"]
                    ).first()

                    if not exists:
                        db.session.add(SubjectTopic(
                            chat_id=chat_id,
                            topic_name=t["topic"],
                            unit_name=t["unit"]
                        ))

            # ---------- PYQ ----------
            if detected_type == "question_paper":
                calibrate_exam_config(chat, text)

            # ---------- AUTO TOPIC INFERENCE ----------
            ensure_topics_exist(chat_id, text)

            topic_tree = SubjectTopic.query.filter_by(chat_id=chat_id).all()
            topic_map = [{"topic": t.topic_name, "unit": t.unit_name} for t in topic_tree]

            chunks, emb = create_embeddings(text)

            tagged = [{
                "text": c,
                "topics": tag_chunk_with_topics(c, topic_map)
            } for c in chunks]

            store_embeddings_in_chroma(
                user_id,
                chat_id,
                pdf.id,
                tagged,
                emb,
                detected_type
            )

            pdf.is_processed = True
            pdf.error = None
            db.session.commit()

        except Exception as e:
            pdf.error = str(e)
            db.session.commit()
            raise e

