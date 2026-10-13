from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


OUTPUT_DIR = Path("generated_certificates")
FONT_DIR = Path(__file__).resolve().parent / "fonts"

# Palette (matches the web UI)
INK = colors.HexColor("#1A2840")
INK_SOFT = colors.HexColor("#4F5B6E")
STAMP_RED = colors.HexColor("#B3312B")
WHITE = colors.white

MONTHS = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)


def _register_fonts():
    """
    Use EB Garamond when the font files are present in ./fonts.
    Fall back to the built-in Times fonts so certificates still generate
    if the files are missing.
    """
    regular = FONT_DIR / "EBGaramond-Regular.ttf"
    italic = FONT_DIR / "EBGaramond-Italic.ttf"

    if regular.is_file() and italic.is_file():
        pdfmetrics.registerFont(TTFont("EBGaramond", str(regular)))
        pdfmetrics.registerFont(TTFont("EBGaramond-Italic", str(italic)))
        return "EBGaramond", "EBGaramond-Italic"

    return "Times-Roman", "Times-Italic"


SERIF, SERIF_ITALIC = _register_fonts()


def format_issue_date(value) -> str:
    """'2026-10-13' becomes '13 October 2026'. Anything else is printed as given."""
    text = str(value)

    try:
        parsed = datetime.strptime(text, "%Y-%m-%d")
    except ValueError:
        return text

    return f"{parsed.day} {MONTHS[parsed.month - 1]} {parsed.year}"


def _fit_font_size(text, font_name, max_size, min_size, max_width):
    """Choose a font size that keeps a single line within max_width."""
    size = max_size

    while size > min_size and stringWidth(text, font_name, size) > max_width:
        size -= 1

    return size


def _wrap_text(text, font_name, font_size, max_width):
    """Wrap text into lines that fit the available width."""
    words = text.split()
    lines = []
    current_line = ""

    for word in words:
        candidate = f"{current_line} {word}".strip()

        if stringWidth(candidate, font_name, font_size) <= max_width:
            current_line = candidate
        else:
            if current_line:
                lines.append(current_line)

            # Split unusually long individual words if necessary.
            if stringWidth(word, font_name, font_size) > max_width:
                fragment = ""

                for character in word:
                    candidate_fragment = fragment + character

                    if (
                        fragment
                        and stringWidth(
                            candidate_fragment, font_name, font_size
                        ) > max_width
                    ):
                        lines.append(fragment)
                        fragment = character
                    else:
                        fragment = candidate_fragment

                current_line = fragment
            else:
                current_line = word

    if current_line:
        lines.append(current_line)

    return lines


def _ellipsize(line, font_name, font_size, max_width):
    """Trim a line until it fits with a trailing ellipsis."""
    ellipsis = "\u2026"
    text = line.rstrip()

    while text and stringWidth(text + ellipsis, font_name, font_size) > max_width:
        text = text[:-1].rstrip()

    return text + ellipsis


def generate_certificate(
    recipient_name: str,
    course_name: str,
    issue_date: str,
    certificate_id: int,
) -> str:
    """
    Generate a landscape A4 PDF certificate.

    The certificate ID comes from the existing database record ID,
    so each certificate receives a distinct identifier.
    Returns the generated PDF's filesystem path as a string.
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    output_path = OUTPUT_DIR / f"certificate_{certificate_id}.pdf"

    page_width, page_height = landscape(A4)
    center = page_width / 2

    pdf = canvas.Canvas(
        str(output_path),
        pagesize=(page_width, page_height),
    )

    recipient_name = " ".join(recipient_name.split())
    course_name = " ".join(course_name.split())

    # Metadata
    pdf.setTitle(f"Certificate - {recipient_name}")
    pdf.setAuthor("Certify")
    pdf.setSubject(f"Certificate of completion: {course_name}")

    # Paper
    pdf.setFillColor(WHITE)
    pdf.rect(0, 0, page_width, page_height, fill=1, stroke=0)

    # Double frame: a firm outer line and a hairline inside it
    pdf.setStrokeColor(INK)
    pdf.setLineWidth(1.4)
    pdf.rect(30, 30, page_width - 60, page_height - 60, fill=0, stroke=1)
    pdf.setLineWidth(0.5)
    pdf.rect(37, 37, page_width - 74, page_height - 74, fill=0, stroke=1)

    content_left = 90
    content_right = page_width - 90
    content_width = content_right - content_left

    # Title
    pdf.setFillColor(INK)
    pdf.setFont(SERIF, 38)
    pdf.drawCentredString(center, page_height - 126, "Certificate of completion")

    # Introduction
    pdf.setFillColor(INK_SOFT)
    pdf.setFont(SERIF_ITALIC, 16)
    pdf.drawCentredString(center, page_height - 188, "This certifies that")

    # Recipient name, sized down for longer names
    name_size = _fit_font_size(
        recipient_name,
        SERIF_ITALIC,
        max_size=50,
        min_size=28,
        max_width=content_width - 40,
    )

    pdf.setFillColor(INK)
    pdf.setFont(SERIF_ITALIC, name_size)
    pdf.drawCentredString(center, page_height - 252, recipient_name)

    # Rule under the name, a little wider than the name itself
    name_width = stringWidth(recipient_name, SERIF_ITALIC, name_size)
    rule_width = min(max(name_width + 80, 300), content_width)

    pdf.setStrokeColor(INK)
    pdf.setLineWidth(0.6)
    pdf.line(
        center - rule_width / 2,
        page_height - 266,
        center + rule_width / 2,
        page_height - 266,
    )

    # Course
    pdf.setFillColor(INK_SOFT)
    pdf.setFont(SERIF_ITALIC, 16)
    pdf.drawCentredString(center, page_height - 306, "has successfully completed")

    course_max_width = content_width - 70
    course_size = _fit_font_size(
        course_name,
        SERIF,
        max_size=28,
        min_size=16,
        max_width=course_max_width,
    )

    course_lines = _wrap_text(course_name, SERIF, course_size, course_max_width)

    # Two lines at most. If there is more, end the second line with an ellipsis
    # so a cut-off name never looks like a complete one.
    if len(course_lines) > 2:
        course_lines = [
            course_lines[0],
            _ellipsize(course_lines[1], SERIF, course_size, course_max_width),
        ]

    pdf.setFillColor(INK)
    pdf.setFont(SERIF, course_size)

    course_y = page_height - 350
    for line in course_lines:
        pdf.drawCentredString(center, course_y, line)
        course_y -= course_size * 1.2

    # Footer: date on the left, certificate number on the right
    try:
        year = datetime.strptime(str(issue_date), "%Y-%m-%d").year
    except ValueError:
        year = datetime.now().year

    unique_id = f"CERT-{year}-{certificate_id:06d}"

    block_width = 190
    line_y = page_height - 488
    value_y = page_height - 480
    label_y = page_height - 504
    right_block_left = content_right - block_width

    pdf.setStrokeColor(INK)
    pdf.setLineWidth(0.6)
    pdf.line(content_left, line_y, content_left + block_width, line_y)
    pdf.line(right_block_left, line_y, content_right, line_y)

    pdf.setFillColor(INK)
    pdf.setFont(SERIF, 16)
    pdf.drawString(content_left, value_y, format_issue_date(issue_date))

    # Printed like a serial number stamped on the page
    pdf.setFillColor(STAMP_RED)
    pdf.drawString(right_block_left, value_y, unique_id)

    pdf.setFillColor(INK_SOFT)
    pdf.setFont(SERIF_ITALIC, 12)
    pdf.drawString(content_left, label_y, "Date issued")
    pdf.drawString(right_block_left, label_y, "Certificate no.")

    pdf.save()

    return str(output_path)
