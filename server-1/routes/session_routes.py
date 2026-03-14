import json
from flask import Blueprint, request, jsonify
from models import PracticeSession, Chat, SubjectTopic
from extensions import db
from services.auth_service import get_user_from_token
from services.exam_service import get_question_types_config, default_question_type_config
from services.topic_service import map_to_closest_topic
from services.evaluation_service import compare_objective_answer, update_topic_weakness, top_weak_topics
from services.cache_service import invalidate_chat
from llm import call_gemini

bp = Blueprint("session_routes", __name__)


@bp.route("/api/sessions/<sid>/submit", methods=["POST"])
def submit_answers(sid):
    user = get_user_from_token()
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    session = PracticeSession.query.get(sid)
    if not session:
        return jsonify({"error": "invalid session"}), 404

    chat = Chat.query.get(session.chat_id)
    if not chat or chat.user_id != user.id:
        return jsonify({"error": "unauthorized"}), 403

    data = request.json or {}
    answers = data.get("answers", {})

    # ── Load questions from DB — never trust marks from submission ────────
    questions = json.loads(session.questions or "[]")

    db_topics = SubjectTopic.query.filter_by(chat_id=chat.id).all()
    allowed = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

    for q in questions:
        q["topic"] = map_to_closest_topic(q.get("topic", ""), allowed, threshold=0.35)

    # ── Read exam config from DB, not from frontend ───────────────────────
    exam_cfg = json.loads(chat.exam_config or "{}")
    question_types_cfg = get_question_types_config(exam_cfg)

    results = {}
    weak_topics = []
    topic_events = []

    mcq_payload_for_explanations = []

    total_possible_marks = 0.0
    total_awarded_marks = 0.0

    for q in questions:
        qid = q.get("id")
        qtype = q.get("type")
        # ── Marks come from DB exam_config, not from submitted question ───
        qcfg = question_types_cfg.get(qtype, default_question_type_config(qtype))
        max_marks = float(qcfg.get("marks", 0) or 0)
        negative_marks = float(qcfg.get("negativeMarks", 0) or 0)

        total_possible_marks += max_marks

        user_ans = answers.get(qid)
        if user_ans in [None, ""]:
            continue

        if qtype == "mcq":
            correct = q.get("answer")
            is_correct = compare_objective_answer(user_ans, correct, qtype=qtype)
            topic_name = map_to_closest_topic(q.get("topic", "General"), allowed)

            awarded_marks = max_marks if is_correct else (-negative_marks if negative_marks > 0 else 0.0)
            total_awarded_marks += awarded_marks
            score_ratio = 1.0 if is_correct else 0.0

            topic_events.append({
                "topic": topic_name,
                "correct": is_correct,
                "difficulty": q.get("difficulty", "medium"),
                "score_ratio": score_ratio,
                "question_type": "mcq",
                "bloom_level": q.get("bloomLevel", "Understand")
            })

            results[qid] = {
                "type": "mcq",
                "topic": topic_name,
                "question": q.get("question"),
                "userAnswer": user_ans,
                "correctAnswer": correct,
                "isCorrect": is_correct,
                "understandingScore": 10 if is_correct else 0,
                "awardedMarks": awarded_marks,
                "maxMarks": max_marks,
                "negativeMarks": negative_marks,
                "difficulty": q.get("difficulty"),
                "explanation": "",
                "bloomLevel": q.get("bloomLevel", "Understand"),
            }

            if not is_correct:
                weak_topics.append(topic_name)

            mcq_payload_for_explanations.append({
                "id": qid,
                "question": q.get("question"),
                "options": q.get("options", []),
                "correctAnswer": correct,
                "userAnswer": user_ans,
                "type": "mcq"
            })

        elif qtype == "true_false":
            correct = q.get("answer")
            is_correct = compare_objective_answer(user_ans, correct, qtype=qtype)
            topic_name = map_to_closest_topic(q.get("topic", "General"), allowed)

            awarded_marks = max_marks if is_correct else (-negative_marks if negative_marks > 0 else 0.0)
            total_awarded_marks += awarded_marks
            score_ratio = 1.0 if is_correct else 0.0

            topic_events.append({
                "topic": topic_name,
                "correct": is_correct,
                "difficulty": q.get("difficulty", "medium"),
                "score_ratio": score_ratio,
                "question_type": "true_false",
                "bloom_level": q.get("bloomLevel", "Understand")
            })

            results[qid] = {
                "type": "true_false",
                "topic": topic_name,
                "question": q.get("question"),
                "userAnswer": user_ans,
                "correctAnswer": correct,
                "isCorrect": is_correct,
                "understandingScore": 10 if is_correct else 0,
                "awardedMarks": awarded_marks,
                "maxMarks": max_marks,
                "negativeMarks": negative_marks,
                "difficulty": q.get("difficulty"),
                "explanation": "",
                "bloomLevel": q.get("bloomLevel", "Understand"),
            }

            if not is_correct:
                weak_topics.append(topic_name)

            mcq_payload_for_explanations.append({
                "id": qid,
                "question": q.get("question"),
                "correctAnswer": correct,
                "userAnswer": user_ans,
                "type": "true_false"
            })

        elif qtype == "fill_blank":
            if not isinstance(q.get("acceptedAnswers"), list):
                q["acceptedAnswers"] = [q.get("answer", "")]
            correct = q.get("answer")
            accepted = q.get("acceptedAnswers") or correct
            is_correct = compare_objective_answer(user_ans, accepted, qtype=qtype)
            topic_name = map_to_closest_topic(q.get("topic", "General"), allowed)

            awarded_marks = max_marks if is_correct else (-negative_marks if negative_marks > 0 else 0.0)
            total_awarded_marks += awarded_marks
            score_ratio = 1.0 if is_correct else 0.0

            topic_events.append({
                "topic": topic_name,
                "correct": is_correct,
                "difficulty": q.get("difficulty", "medium"),
                "score_ratio": score_ratio,
                "question_type": "fill_blank",
                "bloom_level": q.get("bloomLevel", "Understand")
            })

            results[qid] = {
                "type": "fill_blank",
                "topic": topic_name,
                "question": q.get("question"),
                "userAnswer": user_ans,
                "correctAnswer": correct,
                "isCorrect": is_correct,
                "understandingScore": 10 if is_correct else 0,
                "awardedMarks": awarded_marks,
                "maxMarks": max_marks,
                "negativeMarks": negative_marks,
                "difficulty": q.get("difficulty"),
                "explanation": "",
                "bloomLevel": q.get("bloomLevel", "Understand"),
            }

            if not is_correct:
                weak_topics.append(topic_name)

            mcq_payload_for_explanations.append({
                "id": qid,
                "question": q.get("question"),
                "correctAnswer": correct,
                "userAnswer": user_ans,
                "type": "fill_blank"
            })

    if mcq_payload_for_explanations:
        exp_prompt = f"""
Generate short, student-friendly explanations.

Rules:
- For MCQ: explain why the correct option is correct
- For true/false: explain why the statement is true or false
- For fill in the blank: explain the correct missing term/phrase
- Return ONLY JSON object keyed by question id

Return format:
{{
  "<question_id>": {{
    "explanation": "..."
  }}
}}

Data:
{json.dumps(mcq_payload_for_explanations, indent=2)}
"""
        exp_result = call_gemini(exp_prompt, expect_json=True) or {}

        for item in mcq_payload_for_explanations:
            qid = item["id"]
            if qid in results:
                results[qid]["explanation"] = (exp_result.get(qid, {}) or {}).get("explanation", "")

    desc_payload = []
    for q in questions:
        qid = q.get("id")
        user_ans = answers.get(qid)
        if not user_ans:
            continue
        if q.get("type") == "descriptive":
            qcfg = question_types_cfg.get("descriptive", default_question_type_config("descriptive"))
            desc_payload.append({
                "id": qid,
                "question": q.get("question"),
                "answer": user_ans,
                "topic": q.get("topic", "General"),
                "difficulty": q.get("difficulty"),
                "bloomLevel": q.get("bloomLevel", "Understand"),
                "marks": float(qcfg.get("marks", 0) or 0),
                "negativeMarks": float(qcfg.get("negativeMarks", 0) or 0)
            })

    if desc_payload:
        desc_prompt = f"""
Evaluate student understanding for descriptive answers.

Rules:
- Focus on conceptual correctness
- Ignore grammar
- Do NOT grade like an exam
- understandingScore must be between 0 and 10
- Return ONLY JSON object keyed by the SAME question id

{{
  "<question_id>": {{
    "understandingScore": 0-10,
    "coveredConcepts": [],
    "missingConcepts": [],
    "sampleAnswer": "A good answer would mention...",
    "explanation": "Explain what was right/wrong and how to improve."
  }}
}}

Data:
{json.dumps(desc_payload, indent=2)}
"""
        desc_result = call_gemini(desc_prompt, expect_json=True) or {}

        for item in desc_payload:
            qid = item["id"]
            r = desc_result.get(qid, {}) or {}
            score = float(r.get("understandingScore", 0) or 0)

            topic_name = map_to_closest_topic(item.get("topic", "General"), allowed)
            score_ratio = max(0.0, min(1.0, score / 10.0))

            topic_events.append({
                "topic": topic_name,
                "correct": (score >= 6),
                "difficulty": item.get("difficulty", "medium"),
                "score_ratio": score_ratio,
                "question_type": "descriptive",
                "bloom_level": item.get("bloomLevel", "Understand")
            })

            max_marks = float(item.get("marks", 0) or 0)
            awarded_marks = round((score / 10.0) * max_marks, 2)
            total_awarded_marks += awarded_marks

            results[qid] = {
                "type": "descriptive",
                "topic": topic_name,
                "question": item.get("question"),
                "userAnswer": item.get("answer"),
                "correctAnswer": None,
                "isCorrect": None,
                "understandingScore": score,
                "covered": r.get("coveredConcepts", []),
                "missing": r.get("missingConcepts", []),
                "sampleAnswer": r.get("sampleAnswer", ""),
                "explanation": r.get("explanation", ""),
                "awardedMarks": awarded_marks,
                "maxMarks": max_marks,
                "negativeMarks": 0.0,
                "difficulty": item.get("difficulty"),
                "bloomLevel": item.get("bloomLevel", "Understand"),
            }

            if score < 6:
                weak_topics.append(topic_name)

    normalized_score = 0.0
    if total_possible_marks > 0:
        normalized_score = round(max(0.0, (total_awarded_marks / total_possible_marks) * 10.0), 2)

    session.score = normalized_score
    session.answers = json.dumps(answers)
    session.weak_topics_json = json.dumps(weak_topics)
    session.feedback_json = json.dumps(results)

    existing = json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}
    updated = update_topic_weakness(existing, topic_events, alpha=0.25)
    chat.weak_topics_json = json.dumps(updated)

    db.session.commit()

    # Invalidate chat cache since weak_topics changed
    invalidate_chat(chat.id, user.id)

    return jsonify({
        "score": normalized_score,
        "rawMarks": round(total_awarded_marks, 2),
        "totalMarks": round(total_possible_marks, 2),
        "results": results,
        "weakTopics": updated,
        "weakTopicList": top_weak_topics(updated, k=5)
    })































# import json
# from flask import Blueprint, request, jsonify
# from models import PracticeSession, Chat, SubjectTopic
# from extensions import db
# from services.auth_service import get_user_from_token
# from services.exam_service import get_question_types_config, default_question_type_config
# from services.topic_service import map_to_closest_topic
# from services.evaluation_service import compare_objective_answer, update_topic_weakness, top_weak_topics
# from llm import call_gemini

# bp = Blueprint("session_routes", __name__)


# @bp.route("/api/sessions/<sid>/submit", methods=["POST"])
# def submit_answers(sid):
#     user = get_user_from_token()
#     if not user:
#         return jsonify({"error": "unauthorized"}), 401

#     session = PracticeSession.query.get(sid)
#     if not session:
#         return jsonify({"error": "invalid session"}), 404

#     chat = Chat.query.get(session.chat_id)
#     if not chat or chat.user_id != user.id:
#         return jsonify({"error": "unauthorized"}), 403

#     data = request.json or {}
#     answers = data.get("answers", {})
#     questions = json.loads(session.questions or "[]")

#     db_topics = SubjectTopic.query.filter_by(chat_id=chat.id).all()
#     allowed = [t.topic_name for t in db_topics if t.topic_name] or ["General"]

#     for q in questions:
#         q["topic"] = map_to_closest_topic(q.get("topic", ""), allowed, threshold=0.35)

#     exam_cfg = json.loads(chat.exam_config or "{}")
#     question_types_cfg = get_question_types_config(exam_cfg)

#     results = {}
#     weak_topics = []
#     topic_events = []

#     mcq_payload_for_explanations = []

#     total_possible_marks = 0.0
#     total_awarded_marks = 0.0

#     for q in questions:
#         qid = q.get("id")
#         qtype = q.get("type")
#         qcfg = question_types_cfg.get(qtype, default_question_type_config(qtype))
#         max_marks = float(qcfg.get("marks", 0) or 0)
#         negative_marks = float(qcfg.get("negativeMarks", 0) or 0)

#         total_possible_marks += max_marks

#         user_ans = answers.get(qid)
#         if user_ans in [None, ""]:
#             continue

#         if qtype == "mcq":
#             correct = q.get("answer")
#             is_correct = compare_objective_answer(user_ans, correct, qtype=qtype)
#             topic_name = map_to_closest_topic(q.get("topic", "General"), allowed)

#             awarded_marks = max_marks if is_correct else (-negative_marks if negative_marks > 0 else 0.0)
#             total_awarded_marks += awarded_marks
#             score_ratio = 1.0 if is_correct else 0.0

#             topic_events.append({
#                 "topic": topic_name,
#                 "correct": is_correct,
#                 "difficulty": q.get("difficulty", "medium"),
#                 "score_ratio": score_ratio,
#                 "question_type": "mcq",
#                 "bloom_level": q.get("bloomLevel", "Understand")
#             })

#             results[qid] = {
#                 "type": "mcq",
#                 "topic": topic_name,
#                 "question": q.get("question"),
#                 "userAnswer": user_ans,
#                 "correctAnswer": correct,
#                 "isCorrect": is_correct,
#                 "understandingScore": 10 if is_correct else 0,
#                 "awardedMarks": awarded_marks,
#                 "maxMarks": max_marks,
#                 "negativeMarks": negative_marks,
#                 "difficulty": q.get("difficulty"),
#                 "explanation": "",
#                 "bloomLevel": q.get("bloomLevel", "Understand"),
#             }

#             if not is_correct:
#                 weak_topics.append(topic_name)

#             mcq_payload_for_explanations.append({
#                 "id": qid,
#                 "question": q.get("question"),
#                 "options": q.get("options", []),
#                 "correctAnswer": correct,
#                 "userAnswer": user_ans,
#                 "type": "mcq"
#             })

#         elif qtype == "true_false":
#             correct = q.get("answer")
#             is_correct = compare_objective_answer(user_ans, correct, qtype=qtype)
#             topic_name = map_to_closest_topic(q.get("topic", "General"), allowed)

#             awarded_marks = max_marks if is_correct else (-negative_marks if negative_marks > 0 else 0.0)
#             total_awarded_marks += awarded_marks
#             score_ratio = 1.0 if is_correct else 0.0

#             topic_events.append({
#                 "topic": topic_name,
#                 "correct": is_correct,
#                 "difficulty": q.get("difficulty", "medium"),
#                 "score_ratio": score_ratio,
#                 "question_type": "true_false",
#                 "bloom_level": q.get("bloomLevel", "Understand")
#             })

#             results[qid] = {
#                 "type": "true_false",
#                 "topic": topic_name,
#                 "question": q.get("question"),
#                 "userAnswer": user_ans,
#                 "correctAnswer": correct,
#                 "isCorrect": is_correct,
#                 "understandingScore": 10 if is_correct else 0,
#                 "awardedMarks": awarded_marks,
#                 "maxMarks": max_marks,
#                 "negativeMarks": negative_marks,
#                 "difficulty": q.get("difficulty"),
#                 "explanation": "",
#                 "bloomLevel": q.get("bloomLevel", "Understand"),
#             }

#             if not is_correct:
#                 weak_topics.append(topic_name)

#             mcq_payload_for_explanations.append({
#                 "id": qid,
#                 "question": q.get("question"),
#                 "correctAnswer": correct,
#                 "userAnswer": user_ans,
#                 "type": "true_false"
#             })

#         elif qtype == "fill_blank":
#             correct = q.get("answer")
#             accepted = q.get("acceptedAnswers") or correct
#             is_correct = compare_objective_answer(user_ans, accepted, qtype=qtype)
#             topic_name = map_to_closest_topic(q.get("topic", "General"), allowed)

#             awarded_marks = max_marks if is_correct else (-negative_marks if negative_marks > 0 else 0.0)
#             total_awarded_marks += awarded_marks
#             score_ratio = 1.0 if is_correct else 0.0

#             topic_events.append({
#                 "topic": topic_name,
#                 "correct": is_correct,
#                 "difficulty": q.get("difficulty", "medium"),
#                 "score_ratio": score_ratio,
#                 "question_type": "fill_blank",
#                 "bloom_level": q.get("bloomLevel", "Understand")
#             })

#             results[qid] = {
#                 "type": "fill_blank",
#                 "topic": topic_name,
#                 "question": q.get("question"),
#                 "userAnswer": user_ans,
#                 "correctAnswer": correct,
#                 "isCorrect": is_correct,
#                 "understandingScore": 10 if is_correct else 0,
#                 "awardedMarks": awarded_marks,
#                 "maxMarks": max_marks,
#                 "negativeMarks": negative_marks,
#                 "difficulty": q.get("difficulty"),
#                 "explanation": "",
#                 "bloomLevel": q.get("bloomLevel", "Understand"),
#             }

#             if not is_correct:
#                 weak_topics.append(topic_name)

#             mcq_payload_for_explanations.append({
#                 "id": qid,
#                 "question": q.get("question"),
#                 "correctAnswer": correct,
#                 "userAnswer": user_ans,
#                 "type": "fill_blank"
#             })

#     if mcq_payload_for_explanations:
#         exp_prompt = f"""
# Generate short, student-friendly explanations.

# Rules:
# - For MCQ: explain why the correct option is correct
# - For true/false: explain why the statement is true or false
# - For fill in the blank: explain the correct missing term/phrase
# - Return ONLY JSON object keyed by question id

# Return format:
# {{
#   "<question_id>": {{
#     "explanation": "..."
#   }}
# }}

# Data:
# {json.dumps(mcq_payload_for_explanations, indent=2)}
# """
#         exp_result = call_gemini(exp_prompt, expect_json=True) or {}

#         for item in mcq_payload_for_explanations:
#             qid = item["id"]
#             if qid in results:
#                 results[qid]["explanation"] = (exp_result.get(qid, {}) or {}).get("explanation", "")

#     desc_payload = []
#     for q in questions:
#         qid = q.get("id")
#         user_ans = answers.get(qid)
#         if not user_ans:
#             continue
#         if q.get("type") == "descriptive":
#             qcfg = question_types_cfg.get("descriptive", default_question_type_config("descriptive"))
#             desc_payload.append({
#                 "id": qid,
#                 "question": q.get("question"),
#                 "answer": user_ans,
#                 "topic": q.get("topic", "General"),
#                 "difficulty": q.get("difficulty"),
#                 "bloomLevel": q.get("bloomLevel", "Understand"),
#                 "marks": float(qcfg.get("marks", 0) or 0),
#                 "negativeMarks": float(qcfg.get("negativeMarks", 0) or 0)
#             })

#     if desc_payload:
#         desc_prompt = f"""
# Evaluate student understanding for descriptive answers.

# Rules:
# - Focus on conceptual correctness
# - Ignore grammar
# - Do NOT grade like an exam
# - understandingScore must be between 0 and 10
# - Return ONLY JSON object keyed by the SAME question id

# {{
#   "<question_id>": {{
#     "understandingScore": 0-10,
#     "coveredConcepts": [],
#     "missingConcepts": [],
#     "sampleAnswer": "A good answer would mention...",
#     "explanation": "Explain what was right/wrong and how to improve."
#   }}
# }}

# Data:
# {json.dumps(desc_payload, indent=2)}
# """
#         desc_result = call_gemini(desc_prompt, expect_json=True) or {}

#         for item in desc_payload:
#             qid = item["id"]
#             r = desc_result.get(qid, {}) or {}
#             score = float(r.get("understandingScore", 0) or 0)

#             topic_name = map_to_closest_topic(item.get("topic", "General"), allowed)

#             score_ratio = max(0.0, min(1.0, score / 10.0))

#             topic_events.append({
#                 "topic": topic_name,
#                 "correct": (score >= 6),
#                 "difficulty": item.get("difficulty", "medium"),
#                 "score_ratio": score_ratio,
#                 "question_type": "descriptive",
#                 "bloom_level": item.get("bloomLevel", "Understand")
#             })

#             max_marks = float(item.get("marks", 0) or 0)
#             descriptive_negative = 0.0

#             awarded_marks = round((score / 10.0) * max_marks, 2)
#             total_awarded_marks += awarded_marks

#             results[qid] = {
#                 "type": "descriptive",
#                 "topic": topic_name,
#                 "question": item.get("question"),
#                 "userAnswer": item.get("answer"),
#                 "correctAnswer": None,
#                 "isCorrect": None,
#                 "understandingScore": score,
#                 "covered": r.get("coveredConcepts", []),
#                 "missing": r.get("missingConcepts", []),
#                 "sampleAnswer": r.get("sampleAnswer", ""),
#                 "explanation": r.get("explanation", ""),
#                 "awardedMarks": awarded_marks,
#                 "maxMarks": max_marks,
#                 "negativeMarks": descriptive_negative,
#                 "difficulty": item.get("difficulty"),
#                 "bloomLevel": item.get("bloomLevel", "Understand"),
#             }

#             if score < 6:
#                 weak_topics.append(topic_name)

#     normalized_score = 0.0
#     if total_possible_marks > 0:
#         normalized_score = round(max(0.0, (total_awarded_marks / total_possible_marks) * 10.0), 2)

#     session.score = normalized_score
#     session.answers = json.dumps(answers)
#     session.weak_topics_json = json.dumps(weak_topics)
#     session.feedback_json = json.dumps(results)

#     existing = json.loads(chat.weak_topics_json) if chat.weak_topics_json else {}
#     updated = update_topic_weakness(existing, topic_events, alpha=0.25)
#     chat.weak_topics_json = json.dumps(updated)

#     db.session.commit()

#     return jsonify({
#         "score": normalized_score,
#         "rawMarks": round(total_awarded_marks, 2),
#         "totalMarks": round(total_possible_marks, 2),
#         "results": results,
#         "weakTopics": updated,
#         "weakTopicList": top_weak_topics(updated, k=5)
#     })