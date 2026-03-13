from PyPDF2 import PdfReader

def extract_text_from_pdf(path):
    reader = PdfReader(path)
    text = ""

    for i, page in enumerate(reader.pages):
        t = page.extract_text()
        if t:
            text += f"Page {i+1}:\n{t}\n"

    return text