# ✅ celery_worker.py 

from extensions import celery, db
from models import Chat, PDFDocument, SubjectTopic
from utils import *
from flask import Flask
from logger import get_logger
from llm import NonRetryableError
logger = get_logger("celery")


@celery.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 10},
    retry_backoff=True
)
def process_pdf_task(self, pdf_id, user_id, chat_id, path):
    from app import app

    with app.app_context():

        pdf = PDFDocument.query.get(pdf_id)
        if not pdf:
            logger.error(f"PDF missing {pdf_id}")
            return
        chat = Chat.query.get(chat_id)
        if not chat:
            logger.error(f"Chat missing {chat_id}")
            return

        try:
            logger.info(f"[CELERY] Processing PDF {pdf_id}")
            text = extract_text_from_pdf(path)
            logger.info(f"[CELERY] Extracted text length={len(text)}")

            # SINGLE LLM CALL HERE
            analysis = analyze_pdf_intelligence(text) or {
                "type": "notes",
                "subject": "Unknown",
                "topics": [{"unit": "Unit", "topic": "General"}],
                "topicFrequency": {},
                # "examPattern": {}
                "examPattern": {
                    "questionTypes": {
                        "mcq": {"count": 0, "marks": 0, "negativeMarks": 0},
                        "fill_blank": {"count": 0, "marks": 0, "negativeMarks": 0},
                        "true_false": {"count": 0, "marks": 0, "negativeMarks": 0},
                        "descriptive": {"count": 0, "marks": 0, "negativeMarks": 0}
                    }
                }
            }

            # ---------- PDF TYPE ----------
            pdf.pdf_type = analysis["type"]

            # ---------- SUBJECT ENFORCEMENT (single subject per chat) ----------
            # OLD: nothing
            # UPDATED:
            base_cfg = json.loads(chat.exam_config or "{}")
            detected_subject = analysis.get("subject", "Unknown")

            if "subject" not in base_cfg:
                base_cfg["subject"] = detected_subject
                chat.exam_config = json.dumps(base_cfg)
            else:
                existing_subject = (base_cfg.get("subject") or "Unknown").strip().lower()
                if detected_subject and detected_subject != "Unknown":
                    if existing_subject != "unknown" and detected_subject.strip().lower() != existing_subject:
                        pdf.error = f"Subject mismatch. Chat subject={base_cfg.get('subject')} but uploaded={detected_subject}"
                        # pdf.error = "Subject mismatch..."
                        pdf.pdf_type = "failed"
                        pdf.is_processed = True
                        db.session.commit()
                        return

            # ---------- TOPICS ----------
            for t in analysis.get("topics", []):
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

            # ---------- EXAM PATTERN (ONLY FOR PYQ) ----------
            # if analysis["type"] == "question_paper" and analysis.get("examPattern"):
            #     base = json.loads(chat.exam_config or "{}")
            #     base.update(analysis["examPattern"])
            #     chat.exam_config = json.dumps(base)

            # if analysis["type"] == "question_paper" and analysis.get("examPattern"):
            #     base = json.loads(chat.exam_config or "{}")

            #     inferred_pattern = normalize_exam_pattern(analysis.get("examPattern") or {})
            #     inferred_qtypes = inferred_pattern.get("questionTypes") or {}

            #     existing_qtypes = base.get("questionTypes") or {}

            #     merged_qtypes = {}
            #     for qtype in ["mcq", "fill_blank", "true_false", "descriptive"]:
            #         old_cfg = existing_qtypes.get(qtype) or {}
            #         new_cfg = inferred_qtypes.get(qtype) or {}

            #         merged_qtypes[qtype] = {
            #             "count": int(new_cfg.get("count", old_cfg.get("count", 0)) or 0),
            #             "marks": float(new_cfg.get("marks", old_cfg.get("marks", 0)) or 0),
            #             "negativeMarks": (
            #                 0.0 if qtype == "descriptive"
            #                 else float(new_cfg.get("negativeMarks", old_cfg.get("negativeMarks", 0)) or 0)
            #             ),
            #         }

            #     base["questionTypes"] = merged_qtypes
            #     chat.exam_config = json.dumps(base)

            if analysis["type"] == "question_paper" and analysis.get("examPattern"):
                base = json.loads(chat.exam_config or "{}")

                inferred_pattern = normalize_exam_pattern(analysis.get("examPattern") or {})
                inferred_qtypes = inferred_pattern.get("questionTypes") or {}

                existing_qtypes = base.get("questionTypes") or {}

                merged_qtypes = {}
                for qtype in ["mcq", "fill_blank", "true_false", "descriptive"]:
                    old_cfg = existing_qtypes.get(qtype) or {}
                    new_cfg = inferred_qtypes.get(qtype) or {}

                    merged_qtypes[qtype] = {
                        "count": int(old_cfg.get("count", new_cfg.get("count", 0)) or 0),
                        "marks": float(old_cfg.get("marks", new_cfg.get("marks", 0)) or 0),
                        "negativeMarks": (
                            0.0 if qtype == "descriptive"
                            else float(old_cfg.get("negativeMarks", new_cfg.get("negativeMarks", 0)) or 0)
                        ),
                    }

                base["questionTypes"] = merged_qtypes
                chat.exam_config = json.dumps(base)

            # ---------- PYQ TOPIC FREQUENCY (ONLY FOR PYQ) ----------
            # OLD: nothing
            # UPDATED:
            if analysis["type"] == "question_paper" and analysis.get("topicFrequency"):
                base = json.loads(chat.exam_config or "{}")
                # base["pyqTopicFrequency"] = analysis["topicFrequency"]
                # UPDATED (accumulate)
                old = base.get("pyqTopicFrequency", {}) or {}
                new = analysis.get("topicFrequency", {}) or {}
                for k, v in new.items():
                    try:
                        old[k] = old.get(k, 0) + int(v or 0)
                    except:
                        old[k] = old.get(k, 0) + 0
                base["pyqTopicFrequency"] = old
                chat.exam_config = json.dumps(base)

            topic_tree = SubjectTopic.query.filter_by(chat_id=chat_id).all()
            topic_map = [{"topic": t.topic_name, "unit": t.unit_name} for t in topic_tree]

            chunks, emb = create_embeddings(text)
            logger.info(f"[CELERY] Embeddings count={len(emb)}")

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
                pdf.pdf_type
            )
            logger.info("[CELERY] Stored in chroma")

            pdf.is_processed = True
            pdf.error = None
            db.session.commit()
            logger.info("[CELERY] DONE")

        except NonRetryableError as e:
            # ✅ DO NOT RETRY (bad config)
            pdf.error = str(e)
            pdf.pdf_type = "failed"
            pdf.is_processed = True
            db.session.commit()
            logger.error(f"[CELERY] Non-retryable error: {e}")
            return

        except Exception as e:
            # transient errors still retry
            pdf.error = str(e)
            pdf.pdf_type = "failed"
            pdf.is_processed = True
            db.session.commit()
            raise




