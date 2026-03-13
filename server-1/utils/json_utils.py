import json
import re

def safe_json_extract(text: str):
    if not text:
        return []

    text = text.strip()

    def normalize(parsed):
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict):
            return [parsed]
        return []

    try:
        return normalize(json.loads(text))
    except:
        pass

    fence = re.search(r"```json\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fence:
        try:
            return normalize(json.loads(fence.group(1).strip()))
        except:
            pass

    fence2 = re.search(r"```\s*([\s\S]*?)\s*```", text)
    if fence2:
        try:
            return normalize(json.loads(fence2.group(1).strip()))
        except:
            pass

    start = text.find("[")
    if start != -1:
        try:
            candidate = text[start:text.rfind("]")+1]
            return normalize(json.loads(candidate))
        except:
            pass

    start = text.find("{")
    if start != -1:
        try:
            candidate = text[start:text.rfind("}")+1]
            return normalize(json.loads(candidate))
        except:
            pass

    return []


# import json
# import re

# def safe_json_extract(text: str):
#     if not text:
#         return []

#     text = text.strip()

#     try:
#         parsed = json.loads(text)
#         # if isinstance(parsed, list):
#         #     return parsed
#         if isinstance(parsed, list):
#             return parsed
#         if isinstance(parsed, dict):
#             return [parsed]
#     except:
#         pass

#     fence = re.search(r"```json\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
#     if fence:
#         block = fence.group(1).strip()
#         try:
#             parsed = json.loads(block)
#             # if isinstance(parsed, list):
#             #     return parsed
#             if isinstance(parsed, list):
#                 return parsed
#             if isinstance(parsed, dict):
#                 return [parsed]
#         except:
#             pass

#     fence2 = re.search(r"```\s*([\s\S]*?)\s*```", text)
#     if fence2:
#         block = fence2.group(1).strip()
#         try:
#             parsed = json.loads(block)
#             # if isinstance(parsed, list):
#             #     return parsed
#             if isinstance(parsed, list):
#                 return parsed
#             if isinstance(parsed, dict):
#                 return [parsed]
#         except:
#             pass

#     start = text.find("[")
#     if start == -1:
#         return []

#     depth = 0
#     in_string = False
#     escape = False

#     for i in range(start, len(text)):
#         ch = text[i]

#         if escape:
#             escape = False
#             continue

#         if ch == "\\":
#             escape = True
#             continue

#         if ch == '"':
#             in_string = not in_string
#             continue

#         if in_string:
#             continue

#         if ch == "[":
#             depth += 1
#         elif ch == "]":
#             depth -= 1
#             if depth == 0:
#                 candidate = text[start:i + 1]
#                 try:
#                     parsed = json.loads(candidate)
#                     # if isinstance(parsed, list):
#                     #     return parsed
#                     if isinstance(parsed, list):
#                         return parsed
#                     if isinstance(parsed, dict):
#                         return [parsed]
#                 except:
#                     return []

#     return []