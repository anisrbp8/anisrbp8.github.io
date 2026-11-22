#!/usr/bin/env python3
"""Build the four downloadable profile PDFs from their HTML equivalents.

Run with Python 3, beautifulsoup4, python-docx and LibreOffice installed:
    python scripts/build_profile_documents.py --work-dir /tmp/profile-documents

The HTML is the content source. Intermediate DOCX files and exported PDFs are
kept in --work-dir. Pass --install only after reviewing every rendered page.
Writer exports tagged PDF with its PDF/UA profile. Check the resulting files
with a validator, and check the reading order and page layout after content edits.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, time, timezone
import json
from pathlib import Path
import re
import shutil
import subprocess
from urllib.parse import urljoin

from bs4 import BeautifulSoup, NavigableString, Tag
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
DOCUMENTS = (
    ("cv.html", "CV_Anis_Rojbi_FR_Web_2026", "fr-FR", "CV académique"),
    ("en/cv.html", "CV_Anis_Rojbi_EN_Web_2026", "en-GB", "Academic CV"),
    ("biographie.html", "Biographie_Anis_Rojbi_FR_Web_2026", "fr-FR", "Biographie"),
    ("en/biography.html", "Biography_Anis_Rojbi_EN_Web_2026", "en-GB", "Biography"),
)


def lang_prop(parent, value):
    element = parent.find(qn("w:lang"))
    if element is None:
        element = OxmlElement("w:lang")
        parent.append(element)
    element.set(qn("w:val"), value)


def add_field(paragraph, instruction):
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), instruction)
    run = OxmlElement("w:r")
    text = OxmlElement("w:t")
    text.text = "1"
    run.append(text)
    field.append(run)
    paragraph._p.append(field)


def add_link(paragraph, label, url, language=None):
    relation = paragraph.part.relate_to(
        url,
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
        is_external=True,
    )
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), relation)
    # Writer uses the hyperlink tip as the PDF annotation's text description.
    hyperlink.set(qn("w:tooltip"), label)
    run = OxmlElement("w:r")
    props = OxmlElement("w:rPr")
    style = OxmlElement("w:rStyle")
    style.set(qn("w:val"), "Hyperlink")
    props.append(style)
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "174A6E")
    props.append(color)
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    props.append(underline)
    if language:
        lang_prop(props, language)
    run.append(props)
    text = OxmlElement("w:t")
    text.text = label
    run.append(text)
    hyperlink.append(run)
    paragraph._p.append(hyperlink)


def inline(paragraph, node, base_url, language, bold=False, italic=False):
    if isinstance(node, NavigableString):
        # Keep compound terms such as brain–computer together in the PDF.
        text = re.sub(r"(?<=\w)–(?=\w)", "\u2060–\u2060", str(node))
        run = paragraph.add_run(text)
        run.bold = bold
        run.italic = italic
        lang_prop(run._r.get_or_add_rPr(), language)
        return
    if not isinstance(node, Tag):
        return
    node_language = node.get("lang", language)
    if node.name == "a":
        add_link(paragraph, node.get_text(), urljoin(base_url, node["href"]), node_language)
    elif node.name == "br":
        paragraph.add_run().add_break()
    else:
        for child in node.children:
            inline(
                paragraph, child, base_url, node_language,
                bold or node.name in ("strong", "b"),
                italic or node.name in ("em", "i"),
            )


def configure(doc, language, title, is_cv, edition):
    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(17)
    section.bottom_margin = Mm(17)
    section.left_margin = Mm(19)
    section.right_margin = Mm(19)
    section.footer_distance = Mm(8)
    styles = doc.styles
    for name in ("Normal", "Title", "Heading 2", "Heading 3", "List Bullet", "List Number", "Footer"):
        style = styles[name]
        style.font.name = "Liberation Sans"
        style.font.color.rgb = RGBColor(0, 0, 0)
        properties = style.element.get_or_add_rPr()
        fonts = properties.find(qn("w:rFonts"))
        # The template's theme fonts otherwise override the named typeface.
        for attribute in ("asciiTheme", "hAnsiTheme"):
            fonts.attrib.pop(qn(f"w:{attribute}"), None)
        lang_prop(properties, language)
        fmt = style.paragraph_format
        fmt.widow_control = True
        fmt.line_spacing = 1.08 if is_cv else 1.18
        # Some python-docx templates carry a blue rule in the Title style.
        # An academic CV needs only the typographic hierarchy.
        for border in list(style.element.iter(qn("w:pBdr"))):
            border.getparent().remove(border)
    styles["Normal"].font.size = Pt(11)
    styles["Normal"].paragraph_format.space_after = Pt(3 if is_cv else 8)
    styles["Title"].font.size = Pt(25)
    styles["Title"].font.bold = True
    styles["Title"].paragraph_format.space_after = Pt(8)
    styles["Title"].paragraph_format.keep_with_next = True
    outline = OxmlElement("w:outlineLvl")
    outline.set(qn("w:val"), "0")
    styles["Title"].element.get_or_add_pPr().append(outline)
    styles["Heading 2"].font.size = Pt(13)
    styles["Heading 2"].font.bold = True
    styles["Heading 2"].paragraph_format.space_before = Pt(9 if is_cv else 16)
    styles["Heading 2"].paragraph_format.space_after = Pt(4)
    styles["Heading 2"].paragraph_format.keep_with_next = True
    styles["Heading 3"].font.size = Pt(11)
    styles["Heading 3"].font.bold = True
    styles["Heading 3"].paragraph_format.space_before = Pt(5)
    styles["Heading 3"].paragraph_format.space_after = Pt(2)
    styles["Heading 3"].paragraph_format.keep_with_next = True
    for name in ("List Bullet", "List Number"):
        styles[name].font.size = Pt(11)
        styles[name].paragraph_format.space_after = Pt(2)
        styles[name].paragraph_format.left_indent = Mm(4)
        styles[name].paragraph_format.first_line_indent = Mm(-3)
    # Word's default Symbol bullet extracts as the private-use character U+F0B7.
    for level in doc.part.numbering_part.element.iter(qn("w:lvl")):
        if level.find(qn("w:numFmt")).get(qn("w:val")) == "bullet":
            level.find(qn("w:lvlText")).set(qn("w:val"), "•")
            fonts = level.find(qn("w:rPr")).find(qn("w:rFonts"))
            for attribute in ("ascii", "hAnsi"):
                fonts.set(qn(f"w:{attribute}"), "Liberation Sans")
    styles["Footer"].font.size = Pt(9)
    styles["Footer"].paragraph_format.space_before = Pt(0)
    styles["Footer"].paragraph_format.space_after = Pt(0)
    defaults = styles.element.find(qn("w:docDefaults"))
    lang_prop(defaults.find(qn("w:rPrDefault")).find(qn("w:rPr")), language)
    doc.core_properties.title = f"{title} — Anis Rojbi"
    doc.core_properties.author = "Anis Rojbi"
    doc.core_properties.subject = f"{title} - Université Paris 8"
    doc.core_properties.language = language
    doc.core_properties.keywords = "Anis Rojbi, Université Paris 8, accessibilité numérique, digital accessibility"
    timestamp = datetime.combine(edition, time.min, tzinfo=timezone.utc)
    doc.core_properties.created = timestamp
    doc.core_properties.modified = timestamp
    footer = section.footer.paragraphs[0]
    footer.style = styles["Footer"]
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    footer.add_run(f"Anis Rojbi · {title} · {edition.isoformat()} · ")
    add_field(footer, "PAGE")
    footer.add_run(" / ")
    add_field(footer, "NUMPAGES")


def create_docx(source, stem, language, title, work_dir, edition):
    soup = BeautifulSoup((ROOT / source).read_text(encoding="utf-8"), "html.parser")
    content = soup.select_one(".document-prose")
    if content is None:
        raise ValueError(f"Missing document body in {source}")
    document = Document()
    is_cv = source.endswith("cv.html")
    configure(document, language, title, is_cv, edition)
    document.add_paragraph(document.core_properties.title, "Title")
    base_url = urljoin("https://anisrojbi.fr/", source)
    download_url = urljoin(base_url, f"/assets/docs/{stem}.pdf")
    for element in content.children:
        if not isinstance(element, Tag):
            continue
        text = element.get_text(" ", strip=True)
        if element.name == "p":
            link = element.find("a", href=True)
            if link and urljoin(base_url, link["href"]) == download_url and text == link.get_text(" ", strip=True):
                continue
        if element.name in ("h2", "h3"):
            paragraph = document.add_paragraph(style=f"Heading {element.name[1]}")
            for child in element.children:
                inline(paragraph, child, base_url, element.get("lang", language), bold=True)
            if is_cv and text in ("Recherche", "Research", "Publications récentes sélectionnées", "Selected recent publications"):
                paragraph.paragraph_format.page_break_before = True
        elif element.name in ("ul", "ol"):
            for item in element.find_all("li", recursive=False):
                paragraph = document.add_paragraph(style="List Number" if element.name == "ol" else "List Bullet")
                for child in item.children:
                    inline(paragraph, child, base_url, item.get("lang", element.get("lang", language)))
        elif element.name == "p":
            strong = element.find("strong")
            is_theme = strong is not None and strong.get_text(" ", strip=True) == text
            paragraph = document.add_paragraph(style="Heading 3" if is_theme else "Normal")
            for child in element.children:
                inline(paragraph, child, base_url, element.get("lang", language))
            if not is_theme and re.match(r"^(DEPUIS|SINCE|\d{4})", text):
                paragraph.paragraph_format.space_before = Pt(4)
                following = element.find_next_sibling()
                paragraph.paragraph_format.keep_with_next = bool(following and following.name == "ul")
                # Dates and appointment names form a scannable label; the
                # institution after the separator remains regular weight.
                if "  |  " in text and not element.find(True):
                    paragraph.clear()
                    label, institution = text.split("  |  ", 1)
                    paragraph_language = element.get("lang", language)
                    inline(paragraph, NavigableString(label), base_url, paragraph_language, bold=True)
                    inline(paragraph, NavigableString(f"  |  {institution}"), base_url, paragraph_language)
    online = document.add_paragraph()
    online.paragraph_format.space_before = Pt(6)
    add_link(online, "Version en ligne" if language.startswith("fr") else "Online version", base_url, language)
    online.add_run(" · ")
    contact_path = "contact.html" if language.startswith("fr") else "en/contact.html"
    add_link(online, "Contact", urljoin("https://anisrojbi.fr/", contact_path), language)
    path = work_dir / f"{stem}.docx"
    document.save(path)
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--edition-date", type=date.fromisoformat, default=date.today(),
                        help="Edition date for the document and its footer (YYYY-MM-DD, defaults to today)")
    parser.add_argument("--install", action="store_true", help="Copy reviewed PDFs into assets/docs")
    args = parser.parse_args()
    work = args.work_dir.resolve()
    work.mkdir(parents=True, exist_ok=True)
    documents = [create_docx(*data, work, args.edition_date) for data in DOCUMENTS]
    output = work / "pdf"
    output.mkdir(exist_ok=True)
    options = {
        "UseTaggedPDF": {"type": "boolean", "value": "true"},
        "PDFUACompliance": {"type": "boolean", "value": "true"},
        "ExportBookmarks": {"type": "boolean", "value": "true"},
        "ExportBookmarksToPDFDestination": {"type": "boolean", "value": "true"},
        "DisplayPDFDocumentTitle": {"type": "boolean", "value": "true"},
    }
    command = [
        "soffice", "--headless", f"-env:UserInstallation={work.joinpath('lo-profile').as_uri()}",
        "--convert-to", f"pdf:writer_pdf_Export:{json.dumps(options)}",
        "--outdir", str(output), *(str(path) for path in documents),
    ]
    subprocess.run(command, check=True, timeout=120)
    for _, stem, _, _ in DOCUMENTS:
        generated = output / f"{stem}.pdf"
        if not generated.is_file():
            raise RuntimeError(f"PDF export missing: {generated}")
        if args.install:
            shutil.copy2(generated, ROOT / "assets" / "docs" / generated.name)
    print(f"Created {len(documents)} documents in {output}")


if __name__ == "__main__":
    main()
