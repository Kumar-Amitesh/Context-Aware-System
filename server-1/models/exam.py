from extensions import db


class ExamPattern(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    exam_type = db.Column(db.String(50))

    question_style = db.Column(db.String(100))
    bloom_level = db.Column(db.String(50))
    marks = db.Column(db.Integer)