import re
from bs4 import BeautifulSoup

def html_to_text(html: str) -> str:
    if not html or not html.strip():
        return ""

    soup = BeautifulSoup(html, "lxml")

    for tag in soup.find_all(["td", "th"]):
        tag.insert_after(" | ")

    for tag in soup.find_all(["p", "li", "br", "tr", "h1", "h2", "h3", "h4", "h5", "h6"]):
        tag.insert_before("\n")

    text = soup.get_text(separator=" ")
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
