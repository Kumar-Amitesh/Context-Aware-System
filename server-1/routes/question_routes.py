import json
from flask import Blueprint, request, jsonify
from models import Chat, PDFDocument, SubjectTopic, PracticeSession
from extensions import db
from utils import generate_id, safe_json_extract
from services.auth_service import get_user_from_token
from services.chroma_service import (
    get_chroma_client,
    chroma_collection_name,
    get_chroma_collection,
    compute_topic_weights,
    fetch_topic_chunks,
    merge_context_by_topics_budgeted,
)
from services.exam_service import (
    get_question_types_config,
    parse_bloom_levels,
    pick_bloom_level_for_question,
)
from services.topic_service import map_to_closest_topic, top_n_weights
from services.evaluation_service import top_weak_topics
from services.cache_service import invalidate_chat
from llm import call_gemini

bp = Blueprint("question_routes", __name__)


@bp.route("/api/chats/<chat_id>/questions/generate/full", methods=["POST"])
def generate_full_exam(chat_id):
    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    chat = Chat.query.get(chat_id)
    if not chat or chat.user_id != user.id:
        return jsonify({"error": "invalid chat"}), 403

    pending = PDFDocument.query.filter_by(chat_id=chat_id, is_processed=False).count()
    if pending > 0:
        return jsonify({"error": "PDFs still processing"}), 400

    successful_pdf_count = PDFDocument.query.filter_by(
        chat_id=chat_id,
        is_processed=True
    ).filter(PDFDocument.error.is_(None)).count()

    if successful_pdf_count == 0:
        return jsonify({"error": "At least one successfully processed PDF is required"}), 400

    # ── Read ALL config from DB — never from request body ────────────────
    exam_cfg = json.loads(chat.exam_config or "{}")
    question_types = get_question_types_config(exam_cfg)
    bloom_levels = parse_bloom_levels(chat.bloom_level)
    bloom_prompt = ", ".join(bloom_levels)

    client = get_chroma_client()
    collection_name = chroma_collection_name(user.id, chat_id)
    collection = get_chroma_collection(client, collection_name)

    db_topics = SubjectTopic.query.filter_by(chat_id=chat_id).all()
    allowed = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

    weights = compute_topic_weights(collection)
    weights_small = top_n_weights(weights, n=10)

    merged_context = merge_context_by_topics_budgeted(
        collection,
        allowed,
        per_topic_results=2,
        max_chars=12000,
        max_chars_per_topic=900
    )

    pyq_freq = exam_cfg.get("pyqTopicFrequency", {}) or {}

    questions = []

    for qtype, cfg in question_types.items():
        count = int(cfg.get("count", 0) or 0)
        if count <= 0:
            continue

        if qtype == "mcq":
            prompt = f"""
Generate {count} MCQs.

Allowed topics (choose topic EXACTLY from this list):
{json.dumps(allowed, indent=2)}

If PYQ topic frequency is available, bias questions toward frequently asked topics:
PYQ topicFrequency:
{json.dumps(pyq_freq, indent=2)}

Topic weight distribution (optional bias): 
{json.dumps(weights_small, indent=2)}

Rules:
- Target Bloom levels: {bloom_prompt}
- Include bloomLevel field as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- bloomLevel must be chosen from these allowed target levels: {bloom_prompt}
- Generate a natural mix of easy, medium, and hard questions across the full set
- 4 options
- options MUST be a JSON ARRAY of 4 strings, not an object.
- Example: "options": ["option1","option2","option3","option4"]
- One correct answer
- Return answer as ONE CAPITAL LETTER only: A / B / C / D
- Include difficulty field as one of: easy, medium, hard

Context:
{merged_context}

Return JSON array with fields:
id, type="mcq", question, options, answer, topic, difficulty, bloomLevel
"""
            raw = call_gemini(prompt)
            questions += safe_json_extract(raw)

        elif qtype == "fill_blank":
            prompt = f"""
Generate {count} fill in the blank questions.

Allowed topics (choose topic EXACTLY from this list):
{json.dumps(allowed, indent=2)}

If PYQ topic frequency is available, bias questions toward frequently asked topics:
PYQ topicFrequency:
{json.dumps(pyq_freq, indent=2)}

Topic weight distribution (optional bias): 
{json.dumps(weights_small, indent=2)}

Rules:
- Target Bloom levels: {bloom_prompt}
- Include bloomLevel field as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- bloomLevel must be chosen from these allowed target levels: {bloom_prompt}
- Generate a natural mix of easy, medium, and hard questions across the full set
- The question must clearly contain a blank like _____
- Return answer as short text
- Include difficulty field as one of: easy, medium, hard

Context:
{merged_context}

Return JSON array with fields:
id, type="fill_blank", question, answer, acceptedAnswers, topic, difficulty, bloomLevel

Rules for acceptedAnswers:
- Must be a JSON array
- Include 2 to 5 valid variants where appropriate
- Include capitalization/hyphen variants only when meaningful
- Do not include vague or overly broad synonyms
"""
            raw = call_gemini(prompt)
            questions += safe_json_extract(raw)

        elif qtype == "true_false":
            prompt = f"""
Generate {count} true/false questions.

Allowed topics (choose topic EXACTLY from this list):
{json.dumps(allowed, indent=2)}

If PYQ topic frequency is available, bias questions toward frequently asked topics:
PYQ topicFrequency:
{json.dumps(pyq_freq, indent=2)}

Topic weight distribution (optional bias): 
{json.dumps(weights_small, indent=2)}

Rules:
- Target Bloom levels: {bloom_prompt}
- Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
- Generate a natural mix of easy, medium, and hard questions across the full set
- Return answer as exactly "True" or "False"
- Include difficulty field as one of: easy, medium, hard

Context:
{merged_context}

Return JSON array with fields:
id, type="true_false", question, answer, topic, difficulty, bloomLevel
"""
            raw = call_gemini(prompt)
            questions += safe_json_extract(raw)

        elif qtype == "descriptive":
            prompt = f"""
Generate {count} descriptive questions.

Allowed topics (choose topic EXACTLY from this list):
{json.dumps(allowed, indent=2)}

If PYQ topic frequency is available, bias questions toward frequently asked topics:
PYQ topicFrequency:
{json.dumps(pyq_freq, indent=2)}

Rules:
- Target Bloom levels: {bloom_prompt}
- Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
- Generate a natural mix of easy, medium, and hard questions across the full set
- Include difficulty field as one of: easy, medium, hard

Context:
{merged_context}

Return JSON array with:
id, type="descriptive", question, topic, difficulty, bloomLevel
"""
            raw = call_gemini(prompt)
            questions += safe_json_extract(raw)

    questions = [q for q in questions if isinstance(q, dict)]
    for q in questions:
        q["topic"] = map_to_closest_topic(q.get("topic", ""), allowed, threshold=0.35)
        q["difficulty"] = str(q.get("difficulty", "medium")).strip().lower()
        if q["difficulty"] not in {"easy", "medium", "hard"}:
            q["difficulty"] = "medium"
        q["bloomLevel"] = pick_bloom_level_for_question(q, bloom_levels)

    session_id = generate_id()
    for i, q in enumerate(questions):
        q["id"] = f"{session_id}_q{i+1}"

    # ── Derive session_type from DB config — ignore any frontend param ───
    session_mode = exam_cfg.get("sessionMode", "normal")
    if session_mode == "video":
        session_type = "video_full"
    elif session_mode == "voice":
        session_type = "voice_full"
    else:
        session_type = "full"

    session = PracticeSession(
        id=session_id,
        chat_id=chat_id,
        session_type=session_type,
        questions=json.dumps(questions)
    )
    db.session.add(session)
    db.session.commit()

    return jsonify({"sessionId": session.id, "questions": questions})


@bp.route("/api/chats/<chat_id>/questions/generate/weak", methods=["POST"])
def generate_weak_exam(chat_id):
    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    chat = Chat.query.get(chat_id)
    if not chat or chat.user_id != user.id:
        return jsonify({"error": "invalid chat"}), 403

    weak_topics_map = json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}
    if not weak_topics_map:
        return jsonify({"error": "No weak topics"}), 400

    # ── Read ALL config from DB ───────────────────────────────────────────
    exam_cfg = json.loads(chat.exam_config or "{}")
    question_types = get_question_types_config(exam_cfg)
    bloom_levels = parse_bloom_levels(chat.bloom_level)
    bloom_prompt = ", ".join(bloom_levels)

    client = get_chroma_client()
    collection_name = chroma_collection_name(user.id, chat_id)
    collection = get_chroma_collection(client, collection_name)

    db_topics = SubjectTopic.query.filter_by(chat_id=chat_id).all()
    allowed = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

    weak_topics = sorted(
        weak_topics_map.keys(),
        key=lambda t: (weak_topics_map.get(t, {}).get("score", 0.0),
                       weak_topics_map.get(t, {}).get("seen", 0)),
        reverse=True
    )

    questions = []

    for qtype, cfg in question_types.items():
        count = int(cfg.get("count", 0) or 0)
        if count <= 0:
            continue

        remaining = count
        topic_index = 0
        per_round = 1

        while remaining > 0 and weak_topics:
            topic = weak_topics[topic_index % len(weak_topics)]
            ctx = fetch_topic_chunks(collection, topic)

            ask_count = min(per_round, remaining)

            if qtype == "mcq":
                prompt = f"""
Generate {ask_count} MCQs for REMEDIAL PRACTICE.

Rules:
- Focus on conceptual mistakes
- Target Bloom levels: {bloom_prompt}
- Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
- Generate a natural mix of easy, medium, and hard questions
- 4 options
- One correct answer
- Return answer as ONE CAPITAL LETTER only: A / B / C / D
- Include difficulty field as one of: easy, medium, hard

Topic: {topic}

Context:
{ctx}

Return ONLY JSON array with:
id, type="mcq", question, options, answer, topic, difficulty, bloomLevel
"""
            elif qtype == "fill_blank":
                prompt = f"""
Generate {ask_count} fill in the blank REMEDIAL questions.

Rules:
- Focus on conceptual mistakes
- Target Bloom levels: {bloom_prompt}
- Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
- Generate a natural mix of easy, medium, and hard questions
- Use _____ in the question
- Return answer as short text
- Include difficulty field as one of: easy, medium, hard

Topic: {topic}

Context:
{ctx}

Return ONLY JSON array with:
id, type="fill_blank", question, answer, acceptedAnswers, topic, difficulty, bloomLevel
"""
            elif qtype == "true_false":
                prompt = f"""
Generate {ask_count} true/false REMEDIAL questions.

Rules:
- Focus on conceptual mistakes
- Target Bloom levels: {bloom_prompt}
- Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
- Generate a natural mix of easy, medium, and hard questions
- Return answer exactly as "True" or "False"
- Include difficulty field as one of: easy, medium, hard

Topic: {topic}

Context:
{ctx}

Return ONLY JSON array with:
id, type="true_false", question, answer, topic, difficulty, bloomLevel
"""
            else:
                prompt = f"""
Generate {ask_count} DESCRIPTIVE REMEDIAL questions.

Rules:
- Focus on weak understanding
- Emphasize concepts and reasoning
- Target Bloom levels: {bloom_prompt}
- Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
- bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
- Generate a natural mix of easy, medium, and hard questions
- Include difficulty field as one of: easy, medium, hard

Topic: {topic}

Context:
{ctx}

Return ONLY JSON array with:
id, type="descriptive", question, topic, difficulty, bloomLevel
"""

            raw = call_gemini(prompt)
            qs = safe_json_extract(raw) or []
            qs = qs[:ask_count]

            for q in qs:
                q["topic"] = topic
                q["type"] = q.get("type") or qtype
                questions.append(q)

            remaining -= len(qs)
            topic_index += 1

            if topic_index > len(weak_topics) * 3 and remaining > 0:
                break

    questions = [q for q in questions if isinstance(q, dict)]
    for q in questions:
        q["topic"] = map_to_closest_topic(q.get("topic", ""), allowed, threshold=0.35)
        q["difficulty"] = str(q.get("difficulty", "medium")).strip().lower()
        if q["difficulty"] not in {"easy", "medium", "hard"}:
            q["difficulty"] = "medium"
        q["bloomLevel"] = pick_bloom_level_for_question(q, bloom_levels)

    session_id = generate_id()
    for i, q in enumerate(questions):
        q["id"] = f"{session_id}_q{i+1}"

    # ── Derive session_type from DB config ────────────────────────────────
    session_mode = exam_cfg.get("sessionMode", "normal")
    if session_mode == "video":
        session_type = "video_weak"
    elif session_mode == "voice":
        session_type = "voice_weak"
    else:
        session_type = "weak"

    session = PracticeSession(
        id=session_id,
        chat_id=chat_id,
        session_type=session_type,
        questions=json.dumps(questions)
    )
    db.session.add(session)
    db.session.commit()

    return jsonify({"sessionId": session.id, "questions": questions})


























# import json
# from flask import Blueprint, jsonify
# from models import Chat, PDFDocument, SubjectTopic, PracticeSession
# from extensions import db
# from utils import generate_id, safe_json_extract
# from services.auth_service import get_user_from_token
# from services.chroma_service import (
#     get_chroma_client,
#     chroma_collection_name,
#     get_chroma_collection,
#     compute_topic_weights,
#     fetch_topic_chunks,
#     merge_context_by_topics_budgeted,
# )
# from services.exam_service import (
#     get_question_types_config,
#     parse_bloom_levels,
#     pick_bloom_level_for_question,
# )
# from services.topic_service import map_to_closest_topic, top_n_weights
# from services.evaluation_service import top_weak_topics
# from llm import call_gemini

# bp = Blueprint("question_routes", __name__)


# @bp.route("/api/chats/<chat_id>/questions/generate/full", methods=["POST"])
# def generate_full_exam(chat_id):
#     user = get_user_from_token()
#     if not user:
#         return jsonify({"error": "unauthorized"}), 401

#     chat = Chat.query.get(chat_id)
#     if not chat or chat.user_id != user.id:
#         return jsonify({"error": "invalid chat"}), 403

#     pending = PDFDocument.query.filter_by(chat_id=chat_id, is_processed=False).count()
#     if pending > 0:
#         return jsonify({"error": "PDFs still processing"}), 400

#     successful_pdf_count = PDFDocument.query.filter_by(
#         chat_id=chat_id,
#         is_processed=True
#     ).filter(PDFDocument.error.is_(None)).count()

#     if successful_pdf_count == 0:
#         return jsonify({"error": "At least one successfully processed PDF is required"}), 400

#     exam_cfg = json.loads(chat.exam_config or "{}")
#     question_types = get_question_types_config(exam_cfg)
#     bloom_levels = parse_bloom_levels(chat.bloom_level)
#     bloom_prompt = ", ".join(bloom_levels)

#     client = get_chroma_client()
#     collection_name = chroma_collection_name(user.id, chat_id)
#     collection = get_chroma_collection(client, collection_name)

#     db_topics = SubjectTopic.query.filter_by(chat_id=chat_id).all()
#     allowed = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

#     weights = compute_topic_weights(collection)
#     weights_small = top_n_weights(weights, n=10)

#     merged_context = merge_context_by_topics_budgeted(
#         collection,
#         allowed,
#         per_topic_results=2,
#         max_chars=12000,
#         max_chars_per_topic=900
#     )

#     pyq_freq = exam_cfg.get("pyqTopicFrequency", {}) or {}

#     questions = []

#     for qtype, cfg in question_types.items():
#         count = int(cfg.get("count", 0) or 0)
#         if count <= 0:
#             continue

#         if qtype == "mcq":
#             prompt = f"""
# Generate {count} MCQs.

# Allowed topics (choose topic EXACTLY from this list):
# {json.dumps(allowed, indent=2)}

# If PYQ topic frequency is available, bias questions toward frequently asked topics:
# PYQ topicFrequency:
# {json.dumps(pyq_freq, indent=2)}

# Topic weight distribution (optional bias): 
# {json.dumps(weights_small, indent=2)}

# Rules:
# - Target Bloom levels: {bloom_prompt}
# - Include bloomLevel field as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
# - bloomLevel must be chosen from these allowed target levels: {bloom_prompt}
# - Generate a natural mix of easy, medium, and hard questions across the full set
# - 4 options
# - One correct answer
# - Return answer as ONE CAPITAL LETTER only: A / B / C / D
# - Include difficulty field as one of: easy, medium, hard

# Context:
# {merged_context}

# Return JSON array with fields:
# id, type="mcq", question, options, answer, topic, difficulty, bloomLevel
# """
#             raw = call_gemini(prompt)
#             questions += safe_json_extract(raw)

#         elif qtype == "fill_blank":
#             prompt = f"""
# Generate {count} fill in the blank questions.

# Allowed topics (choose topic EXACTLY from this list):
# {json.dumps(allowed, indent=2)}

# If PYQ topic frequency is available, bias questions toward frequently asked topics:
# PYQ topicFrequency:
# {json.dumps(pyq_freq, indent=2)}

# Topic weight distribution (optional bias): 
# {json.dumps(weights_small, indent=2)}

# Rules:
# - Target Bloom levels: {bloom_prompt}
# - Include bloomLevel field as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
# - bloomLevel must be chosen from these allowed target levels: {bloom_prompt}
# - Generate a natural mix of easy, medium, and hard questions across the full set
# - The question must clearly contain a blank like _____
# - Return answer as short text
# - Include difficulty field as one of: easy, medium, hard

# Context:
# {merged_context}

# Return JSON array with fields:
# id, type="fill_blank", question, answer, acceptedAnswers, topic, difficulty, bloomLevel

# Rules for acceptedAnswers:
# - Must be a JSON array
# - Include 2 to 5 valid variants where appropriate
# - Include capitalization/hyphen variants only when meaningful
# - Do not include vague or overly broad synonyms
# """
#             raw = call_gemini(prompt)
#             questions += safe_json_extract(raw)

#         elif qtype == "true_false":
#             prompt = f"""
# Generate {count} true/false questions.

# Allowed topics (choose topic EXACTLY from this list):
# {json.dumps(allowed, indent=2)}

# If PYQ topic frequency is available, bias questions toward frequently asked topics:
# PYQ topicFrequency:
# {json.dumps(pyq_freq, indent=2)}

# Topic weight distribution (optional bias): 
# {json.dumps(weights_small, indent=2)}

# Rules:
# - Target Bloom levels: {bloom_prompt}
# - Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
# - bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
# - Generate a natural mix of easy, medium, and hard questions across the full set
# - Return answer as exactly "True" or "False"
# - Include difficulty field as one of: easy, medium, hard

# Context:
# {merged_context}

# Return JSON array with fields:
# id, type="true_false", question, answer, topic, difficulty, bloomLevel
# """
#             raw = call_gemini(prompt)
#             questions += safe_json_extract(raw)

#         elif qtype == "descriptive":
#             prompt = f"""
# Generate {count} descriptive questions.

# Allowed topics (choose topic EXACTLY from this list):
# {json.dumps(allowed, indent=2)}

# If PYQ topic frequency is available, bias questions toward frequently asked topics:
# PYQ topicFrequency:
# {json.dumps(pyq_freq, indent=2)}

# Rules:
# - Target Bloom levels: {bloom_prompt}
# - Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
# - bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
# - Generate a natural mix of easy, medium, and hard questions across the full set
# - Include difficulty field as one of: easy, medium, hard

# Context:
# {merged_context}

# Return JSON array with:
# id, type="descriptive", question, topic, difficulty, bloomLevel
# """
#             raw = call_gemini(prompt)
#             questions += safe_json_extract(raw)

#     questions = [q for q in questions if isinstance(q, dict)]
#     for q in questions:
#         q["topic"] = map_to_closest_topic(q.get("topic", ""), allowed, threshold=0.35)
#         q["difficulty"] = str(q.get("difficulty", "medium")).strip().lower()
#         if q["difficulty"] not in {"easy", "medium", "hard"}:
#             q["difficulty"] = "medium"

#         q["bloomLevel"] = pick_bloom_level_for_question(q, bloom_levels)

#     session_id = generate_id()
#     for i, q in enumerate(questions):
#         q["id"] = f"{session_id}_q{i+1}"

#     session = PracticeSession(
#         id=session_id,
#         chat_id=chat_id,
#         session_type="full",
#         questions=json.dumps(questions)
#     )
#     db.session.add(session)
#     db.session.commit()

#     return jsonify({"sessionId": session.id, "questions": questions})


# @bp.route("/api/chats/<chat_id>/questions/generate/weak", methods=["POST"])
# def generate_weak_exam(chat_id):
#     user = get_user_from_token()
#     if not user:
#         return jsonify({"error": "unauthorized"}), 401

#     chat = Chat.query.get(chat_id)
#     if not chat or chat.user_id != user.id:
#         return jsonify({"error": "invalid chat"}), 403

#     weak_topics_map = json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}
#     if not weak_topics_map:
#         return jsonify({"error": "No weak topics"}), 400

#     exam_cfg = json.loads(chat.exam_config or "{}")
#     question_types = get_question_types_config(exam_cfg)
#     bloom_levels = parse_bloom_levels(chat.bloom_level)
#     bloom_prompt = ", ".join(bloom_levels)

#     client = get_chroma_client()
#     collection_name = chroma_collection_name(user.id, chat_id)
#     collection = get_chroma_collection(client, collection_name)

#     db_topics = SubjectTopic.query.filter_by(chat_id=chat_id).all()
#     allowed = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

#     weak_topics = sorted(
#         weak_topics_map.keys(),
#         key=lambda t: (weak_topics_map.get(t, {}).get("score", 0.0),
#                        weak_topics_map.get(t, {}).get("seen", 0)),
#         reverse=True
#     )

#     questions = []

#     for qtype, cfg in question_types.items():
#         count = int(cfg.get("count", 0) or 0)
#         if count <= 0:
#             continue

#         remaining = count
#         topic_index = 0
#         per_round = 1

#         while remaining > 0 and weak_topics:
#             topic = weak_topics[topic_index % len(weak_topics)]
#             ctx = fetch_topic_chunks(collection, topic)

#             ask_count = min(per_round, remaining)

#             if qtype == "mcq":
#                 prompt = f"""
# Generate {ask_count} MCQs for REMEDIAL PRACTICE.

# Rules:
# - Focus on conceptual mistakes
# - Target Bloom levels: {bloom_prompt}
# - Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
# - bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
# - Generate a natural mix of easy, medium, and hard questions
# - 4 options
# - One correct answer
# - Return answer as ONE CAPITAL LETTER only: A / B / C / D
# - Include difficulty field as one of: easy, medium, hard

# Topic: {topic}

# Context:
# {ctx}

# Return ONLY JSON array with:
# id, type="mcq", question, options, answer, topic, difficulty, bloomLevel
# """
#             elif qtype == "fill_blank":
#                 prompt = f"""
# Generate {ask_count} fill in the blank REMEDIAL questions.

# Rules:
# - Focus on conceptual mistakes
# - Target Bloom levels: {bloom_prompt}
# - Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
# - bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
# - Generate a natural mix of easy, medium, and hard questions
# - Use _____ in the question
# - Return answer as short text
# - Include difficulty field as one of: easy, medium, hard

# Topic: {topic}

# Context:
# {ctx}

# Return ONLY JSON array with:
# id, type="fill_blank", question, answer, acceptedAnswers, topic, difficulty, bloomLevel
# """
#             elif qtype == "true_false":
#                 prompt = f"""
# Generate {ask_count} true/false REMEDIAL questions.

# Rules:
# - Focus on conceptual mistakes
# - Target Bloom levels: {bloom_prompt}
# - Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
# - bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
# - Generate a natural mix of easy, medium, and hard questions
# - Return answer exactly as "True" or "False"
# - Include difficulty field as one of: easy, medium, hard

# Topic: {topic}

# Context:
# {ctx}

# Return ONLY JSON array with:
# id, type="true_false", question, answer, topic, difficulty, bloomLevel
# """
#             else:
#                 prompt = f"""
# Generate {ask_count} DESCRIPTIVE REMEDIAL questions.

# Rules:
# - Focus on weak understanding
# - Emphasize concepts and reasoning
# - Target Bloom levels: {bloom_prompt}
# - Each question must include bloomLevel as exactly one of: Remember, Understand, Apply, Analyze, Evaluate, Create
# - bloomLevel must be chosen from these allowed target levels only: {bloom_prompt}
# - Generate a natural mix of easy, medium, and hard questions
# - Include difficulty field as one of: easy, medium, hard

# Topic: {topic}

# Context:
# {ctx}

# Return ONLY JSON array with:
# id, type="descriptive", question, topic, difficulty, bloomLevel
# """

#             raw = call_gemini(prompt)
#             qs = safe_json_extract(raw) or []

#             qs = qs[:ask_count]

#             for q in qs:
#                 q["topic"] = topic
#                 q["type"] = q.get("type") or qtype
#                 questions.append(q)

#             remaining -= len(qs)
#             topic_index += 1

#             if topic_index > len(weak_topics) * 3 and remaining > 0:
#                 break
    
#     questions = [q for q in questions if isinstance(q, dict)]
#     for q in questions:
#         q["topic"] = map_to_closest_topic(q.get("topic", ""), allowed, threshold=0.35)
#         q["difficulty"] = str(q.get("difficulty", "medium")).strip().lower()
#         if q["difficulty"] not in {"easy", "medium", "hard"}:
#             q["difficulty"] = "medium"

#         q["bloomLevel"] = pick_bloom_level_for_question(q, bloom_levels)

#     session_id = generate_id()
#     for i, q in enumerate(questions):
#         q["id"] = f"{session_id}_q{i+1}"

#     session = PracticeSession(
#         id=session_id,
#         chat_id=chat_id,
#         session_type="weak",
#         questions=json.dumps(questions)
#     )
#     db.session.add(session)
#     db.session.commit()

#     return jsonify({"sessionId": session.id, "questions": questions})