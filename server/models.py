# from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import json
from extensions import db

# db = SQLAlchemy()


class User(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    chats = db.relationship('Chat', backref='user', lazy=True, cascade='all, delete-orphan')


class Chat(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.String(50), db.ForeignKey('user.id'))

    exam_type = db.Column(db.String(50))
    exam_config = db.Column(db.Text)         # user + pyq calibrated
    bloom_level = db.Column(db.String(20))

    weak_topics_json = db.Column(db.Text)
    preparedness_score = db.Column(db.Float)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    pdfs = db.relationship('PDFDocument', backref='chat', lazy=True, cascade='all, delete-orphan')
    sessions = db.relationship('PracticeSession', backref='chat', lazy=True, cascade='all, delete-orphan')

    def get_weak_topics_summary(self):
        if not self.weak_topics_json:
            return []
        return json.loads(self.weak_topics_json)


# class PDFDocument(db.Model):
#     id = db.Column(db.String(50), primary_key=True)
#     chat_id = db.Column(db.String(50), db.ForeignKey('chat.id'))

#     filename = db.Column(db.String(200))
#     file_path = db.Column(db.String(300))

#     pdf_type = db.Column(db.String(50))   # syllabus / notes / question_paper
#     is_processed = db.Column(db.Boolean, default=False)
#     error = db.Column(db.Text) 

#     uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)

class PDFDocument(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    chat_id = db.Column(db.String(50), db.ForeignKey('chat.id'))

    filename = db.Column(db.String(200))
    file_path = db.Column(db.String(300))

    file_hash = db.Column(db.String(64), index=True)  # ✅ NEW

    pdf_type = db.Column(db.String(50))   # syllabus / notes / question_paper
    is_processed = db.Column(db.Boolean, default=False)
    error = db.Column(db.Text)

    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("chat_id", "file_hash", name="uix_chat_filehash"),
    )


class SubjectTopic(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.String(50), db.ForeignKey('chat.id'))

    topic_name = db.Column(db.String(200))
    unit_name = db.Column(db.String(200))


class PracticeSession(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    chat_id = db.Column(db.String(50), db.ForeignKey('chat.id'))

    session_type = db.Column(db.String(50))  # full / weak
    questions = db.Column(db.Text)
    answers = db.Column(db.Text)

    score = db.Column(db.Float)
    weak_topics_json = db.Column(db.Text)
    feedback_json = db.Column(db.Text)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class GeneratedQuestion(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    chat_id = db.Column(db.String(50))

    question_hash = db.Column(db.String(64))
    topic = db.Column(db.String(200))

    times_asked = db.Column(db.Integer, default=1)
    avg_score = db.Column(db.Float, default=0.0)


class ExamPattern(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    exam_type = db.Column(db.String(50))

    question_style = db.Column(db.String(100))   # theory / trace / design
    bloom_level = db.Column(db.String(50))
    marks = db.Column(db.Integer)
