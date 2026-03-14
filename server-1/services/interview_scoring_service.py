import json
from llm import call_gemini


def score_interview(questions, transcript):

    prompt = f"""
Evaluate the candidate's interview performance.

Questions:
{json.dumps(questions, indent=2)}

Transcript:
{json.dumps(transcript, indent=2)}

Tasks:

1. Score the interview 0-100
2. Identify weak topics
3. Give short feedback

Return JSON:

{{
 "score": number,
 "weak_topics": ["topic1","topic2"],
 "feedback": {{
   "summary": "short feedback"
 }}
}}
"""

    raw = call_gemini(prompt)

    try:
        return json.loads(raw)
    except:
        return {
            "score": 50,
            "weak_topics": [],
            "feedback": {"summary": "Evaluation unavailable"}
        }