import os
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from models import Chat, PDFDocument
from extensions import db
from utils import generate_id, sha256_file
from services.auth_service import get_user_from_token
from tasks.pdf_tasks import process_pdf_task

bp = Blueprint("pdf_routes", __name__)


@bp.route("/api/chats/<chat_id>/pdfs", methods=["POST"])
def upload_pdf(chat_id):
    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401
    chat = Chat.query.get(chat_id)

    if not chat or chat.user_id != user.id:
        return jsonify({"error": "invalid chat"}), 403

    file = request.files["pdf"]

    original_name = secure_filename(file.filename)
    unique_name = f"{generate_id()}_{original_name}"
    path = os.path.join(current_app.config["UPLOAD_FOLDER"], unique_name)

    file.save(path)

    file_hash = sha256_file(path)

    existing = (PDFDocument.query
        .filter_by(chat_id=chat_id, file_hash=file_hash)
        .order_by(PDFDocument.uploaded_at.desc())
        .first()
    )

    if existing and not existing.error and existing.is_processed:
        try:
            if os.path.exists(path):
                os.remove(path)
        except:
            pass
        return jsonify({
            "error": "This PDF was already uploaded in this chat.",
            "pdfId": existing.id,
            "status": "duplicate"
        }), 409

    if existing and not existing.error and not existing.is_processed:
        try:
            if os.path.exists(path):
                os.remove(path)
        except:
            pass

        return jsonify({
            "error": "This PDF is already uploaded and still processing.",
            "pdfId": existing.id,
            "status": "duplicate_processing"
        }), 409

    if existing and (existing.error or existing.pdf_type == "failed"):
        existing.filename = original_name
        existing.file_path = path
        existing.file_hash = file_hash
        existing.pdf_type = "pending"
        existing.is_processed = False
        existing.error = None
        db.session.commit()

        process_pdf_task.delay(existing.id, user.id, chat_id, path)

        return jsonify({
            "pdfId": existing.id,
            "status": "requeued",
            "processing": True
        }), 202

    pdf = PDFDocument(
        id=generate_id(),
        chat_id=chat_id,
        filename=original_name,
        file_path=path,
        file_hash=file_hash,
        pdf_type="pending",
        is_processed=False
    )

    db.session.add(pdf)
    db.session.commit()

    process_pdf_task.delay(
        pdf.id,
        user.id,
        chat_id,
        path
    )

    return jsonify({
        "pdfId": pdf.id,
        "status": "uploaded",
        "processing": True
    }), 202


@bp.route("/api/chats/<chat_id>/pdfs", methods=["GET"])
def list_pdfs(chat_id):
    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    chat = Chat.query.get(chat_id)

    if not chat or chat.user_id != user.id:
        return jsonify({"error": "unauthorized"}), 403

    return jsonify([
        {
            "pdfId": pdf.id,
            "filename": pdf.filename,
            "type": pdf.pdf_type,
            "processed": pdf.is_processed,
            "error": pdf.error,
            "uploadedAt": pdf.uploaded_at.isoformat()
        }
        for pdf in chat.pdfs
    ])


@bp.route("/api/pdfs/<pdf_id>/retry", methods=["POST"])
def retry_pdf(pdf_id):
    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    pdf = PDFDocument.query.get(pdf_id)
    if not pdf:
        return jsonify({"error": "not found"}), 404

    if not (pdf.error or pdf.pdf_type == "failed"):
        return jsonify({"error": "PDF is not in failed state"}), 400

    chat = Chat.query.get(pdf.chat_id)
    if not chat or chat.user_id != user.id:
        return jsonify({"error": "unauthorized"}), 403

    pdf.is_processed = False
    pdf.error = None
    pdf.pdf_type = "pending"
    db.session.commit()

    process_pdf_task.delay(pdf.id, user.id, pdf.chat_id, pdf.file_path)

    return jsonify({"status": "requeued"}), 202