import os
from flask import Flask
from flask_cors import CORS
from config import Config
from extensions import db, celery
# from routes import auth_bp, chat_bp, pdf_bp, question_bp, session_bp, debug_bp
from routes import auth_bp, chat_bp, pdf_bp, question_bp, session_bp, debug_bp, flashcard_bp, video_bp, video_session_bp

app = Flask(__name__)
app.config.from_object(Config)

CORS(app, origin="*", supports_credentials=True)

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

db.init_app(app)
celery.conf.update(app.config)

with app.app_context():
    db.create_all()

app.register_blueprint(auth_bp)
app.register_blueprint(chat_bp)
app.register_blueprint(pdf_bp)
app.register_blueprint(question_bp)
app.register_blueprint(session_bp)
app.register_blueprint(debug_bp)
app.register_blueprint(flashcard_bp)   
app.register_blueprint(video_bp)
app.register_blueprint(video_session_bp)

if __name__ == "__main__":
    app.run(debug=False, port=5000, host="0.0.0.0", use_reloader=False)