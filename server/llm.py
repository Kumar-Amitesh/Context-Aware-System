import os
import google.generativeai as genai
import re
import json
from logger import get_logger

logger = get_logger("gemini")

class NonRetryableError(Exception):
    pass

GEMINI_API_KEY = ""

# genai.configure(api_key=GEMINI_API_KEY)

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    logger.error("GEMINI_API_KEY not set. Gemini calls will fail.")

_model = None

def get_gemini_model():
    global _model
    if not GEMINI_API_KEY:
        raise NonRetryableError("GEMINI_API_KEY is not set")
    if _model is None:
        _model = genai.GenerativeModel("gemini-2.5-flash")
    return _model


def extract_json_block(text: str):
    """
    Extract JSON from markdown/codeblock or mixed text
    """

    if not text:
        return None

    # remove code fences
    text = re.sub(r"```json|```", "", text, flags=re.IGNORECASE).strip()

    # try object
    obj_match = re.search(r"\{.*\}", text, re.DOTALL)
    if obj_match:
        try:
            return json.loads(obj_match.group())
        except:
            pass

    # try array
    arr_match = re.search(r"\[.*\]", text, re.DOTALL)
    if arr_match:
        try:
            return json.loads(arr_match.group())
        except:
            pass

    return None


def call_gemini(prompt, expect_json=False):

    model = get_gemini_model()
    response = model.generate_content(prompt)

    logger.warning("Gemini Prompt:\n%s", prompt[:2000])
    logger.warning("Gemini Raw Response:\n%s", response)

    text = getattr(response, "text", None)

    if not text:
        logger.error("Gemini returned no text")
        return {} if expect_json else ""

    if not expect_json:
        return text

    parsed = extract_json_block(text)

    if parsed is None:
        logger.error("JSON extraction failed")
        logger.error("TEXT:\n%s", text)
        return {}

    return parsed

# for m in genai.list_models():
#     print(m.name, m.supported_generation_methods)
