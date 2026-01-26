import os
import google.generativeai as genai

GEMINI_API_KEY = ""

genai.configure(api_key=GEMINI_API_KEY)

_model = None

def get_gemini_model():
    global _model
    if _model is None:
        _model = genai.GenerativeModel("gemini-2.5-flash")
    return _model


def call_gemini(prompt):
    model = get_gemini_model()
    response = model.generate_content(prompt)
    print("Gemini Prompt:", prompt)
    print("Gemini Response:", response)
    return response.text

# for m in genai.list_models():
#     print(m.name, m.supported_generation_methods)
