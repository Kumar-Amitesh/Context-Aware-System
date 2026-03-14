import json
from llm import call_gemini

def score_interview(questions, conversation_log):
    if not conversation_log:
        return {"score": 0, "feedback": {}, "weak_topics": []}

    # Reconstruct readable transcript
    transcript_text = "\n".join(
        f"[{e['role'].upper()}]: {e['text']}"
        for e in conversation_log
    )

    questions_json = json.dumps(questions, indent=2)

    prompt = f"""You are evaluating a voice interview. The candidate answered questions in a spoken conversation.

The transcript may have minor speech-to-text artifacts (split words, spacing issues). Read it holistically.

## Questions Asked
{questions_json}

## Full Conversation Transcript
{transcript_text}

## Your Task
1. Read the full transcript carefully.
2. For each question, find what the candidate said in response (may span multiple transcript lines).
3. Evaluate their answer even if partially correct or incomplete.
4. If the interview was cut short and a question was not reached, mark it as skipped.

## Scoring Rules
- understandingScore: 0-10 (how well they understood and answered the question)
- overallScore: 0-10 (weighted average across all questions)
- Be generous with partial answers — spoken answers are naturally less structured than written ones

Return ONLY valid JSON, no markdown, no explanation:

{{
  "score": <0-10 float>,
  "weak_topics": ["topic name if score < 6"],
  "feedback": {{
    "<question_id>": {{
      "type": "descriptive",
      "topic": "<topic>",
      "question": "<question text>",
      "userAnswer": "<candidate's answer reconstructed from transcript>",
      "understandingScore": <0-10>,
      "explanation": "<what was good and what was missing>",
      "sampleAnswer": "<ideal answer in 2-3 sentences>",
      "strengths": ["strength 1"],
      "improvements": ["improvement 1"]
    }}
  }}
}}"""

    try:
        result = call_gemini(prompt, expect_json=True)
        if not result or not isinstance(result, dict):
            return {"score": 0, "feedback": {"summary": "Evaluation unavailable"}, "weak_topics": []}

        # Validate score is 0-10, not 0-100
        raw_score = result.get("score", 0)
        if raw_score > 10:
            raw_score = round(raw_score / 10, 1)
        result["score"] = round(float(raw_score), 1)

        return result

    except Exception as e:
        print(f"[score_interview] error: {e}")
        return {"score": 0, "feedback": {"summary": "Evaluation unavailable"}, "weak_topics": []}




















# import json
# from llm import call_gemini


# def score_interview(questions, transcript):

#     prompt = f"""
# Evaluate the candidate's interview performance.

# Questions:
# {json.dumps(questions, indent=2)}

# Transcript:
# {json.dumps(transcript, indent=2)}

# Tasks:

# 1. Score the interview 0-100
# 2. Identify weak topics
# 3. Give short feedback

# Return JSON:

# {{
#  "score": number,
#  "weak_topics": ["topic1","topic2"],
#  "feedback": {{
#    "summary": "short feedback"
#  }}
# }}
# """

#     raw = call_gemini(prompt)

#     try:
#         return json.loads(raw)
#     except:
#         return {
#             "score": 50,
#             "weak_topics": [],
#             "feedback": {"summary": "Evaluation unavailable"}
#         }