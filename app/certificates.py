
from pathlib import Path
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


OUTPUT_DIR = Path("generated_certificates")

# Corporate terracotta palette
TERRACOTTA = colors.HexColor("#B65F45")
TERRACOTTA_DARK = colors.HexColor("#8E4432")
CHARCOAL = colors.HexColor("#292B2C")
BODY_TEXT = colors.HexColor("#5F605F")
MUTED_TEXT = colors.HexColor("#85817D")
PAPER = colors.HexColor("#FCFAF7")
BORDER = colors.HexColor("#E7DED7")
WHITE = colors.white


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


def generate_certificate(
    recipient_name: str,
    course_name: str,
    issue_date: str,
    certificate_id: int,
) -> str:
    """
    Generate a corporate-style landscape A4 PDF certificate.

    The certificate ID comes from the existing database record ID,
    so each certificate receives a distinct identifier.
    Returns the generated PDF's filesystem path as a string.
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    output_path = OUTPUT_DIR / f"certificate_{certificate_id}.pdf"

    page_width, page_height = landscape(A4)

    pdf = canvas.Canvas(
        str(output_path),
        pagesize=(page_width, page_height),
    )

    # Metadata
    pdf.setTitle(f"Certificate - {recipient_name}")
    pdf.setAuthor("Certificate Generator")
    pdf.setSubject(f"Certificate of completion: {course_name}")

    # Background
    pdf.setFillColor(PAPER)
    pdf.rect(0, 0, page_width, page_height, fill=1, stroke=0)

    # Main white content area
    margin = 25

    pdf.setFillColor(WHITE)
    pdf.rect(
        margin,
        margin,
        page_width - 2 * margin,
        page_height - 2 * margin,
        fill=1,
        stroke=0,
    )

    # Thin corporate border
    pdf.setStrokeColor(BORDER)
    pdf.setLineWidth(1)
    pdf.rect(
        margin,
        margin,
        page_width - 2 * margin,
        page_height - 2 * margin,
        fill=0,
        stroke=1,
    )

    # Terracotta vertical accent bar
    pdf.setFillColor(TERRACOTTA)
    pdf.rect(
        margin,
        margin,
        7,
        page_height - 2 * margin,
        fill=1,
        stroke=0,
    )

    # Small terracotta header accent
    content_left = 66
    content_right = page_width - 60
    content_width = content_right - content_left

    pdf.setFillColor(TERRACOTTA)
    pdf.roundRect(
        content_left,
        page_height - 83,
        48,
        4,
        2,
        fill=1,
        stroke=0,
    )

    # Header
    pdf.setFillColor(CHARCOAL)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(
        content_left,
        page_height - 105,
        "CERTIFICATE OF COMPLETION",
    )

    pdf.setFillColor(MUTED_TEXT)
    pdf.setFont("Helvetica", 8)
    pdf.drawRightString(
        content_right,
        page_height - 105,
        "ACHIEVEMENT  /  RECOGNITION",
    )

    # Heading
    pdf.setFillColor(CHARCOAL)
    pdf.setFont("Helvetica-Bold", 29)
    pdf.drawCentredString(
        page_width / 2,
        page_height - 163,
        "Certificate",
    )

    pdf.setFillColor(TERRACOTTA)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawCentredString(
        page_width / 2,
        page_height - 187,
        "OF ACHIEVEMENT",
    )

    # Introductory text
    pdf.setFillColor(BODY_TEXT)
    pdf.setFont("Helvetica", 11)
    pdf.drawCentredString(
        page_width / 2,
        page_height - 222,
        "This certificate is proudly presented to",
    )

    # Recipient name, dynamically sized for longer names
    recipient_name = " ".join(recipient_name.split())

    name_font = "Helvetica-Bold"
    name_size = _fit_font_size(
        recipient_name,
        name_font,
        max_size=27,
        min_size=15,
        max_width=content_width - 40,
    )

    pdf.setFillColor(TERRACOTTA_DARK)
    pdf.setFont(name_font, name_size)
    pdf.drawCentredString(
        page_width / 2,
        page_height - 263,
        recipient_name,
    )

    # Divider below recipient name
    divider_width = min(190, content_width * 0.45)

    pdf.setStrokeColor(BORDER)
    pdf.setLineWidth(1)
    pdf.line(
        page_width / 2 - divider_width / 2,
        page_height - 278,
        page_width / 2 + divider_width / 2,
        page_height - 278,
    )

    # Course completion statement
    pdf.setFillColor(BODY_TEXT)
    pdf.setFont("Helvetica", 11)
    pdf.drawCentredString(
        page_width / 2,
        page_height - 303,
        "for successfully completing",
    )

    # Course name can occupy multiple lines
    course_name = " ".join(course_name.split())
    course_font = "Helvetica-Bold"
    course_size = _fit_font_size(
        course_name,
        course_font,
        max_size=16,
        min_size=11,
        max_width=content_width - 70,
    )

    course_lines = _wrap_text(
        course_name,
        course_font,
        course_size,
        content_width - 70,
    )

    course_lines = course_lines[:2]
    course_y = page_height - 328

    pdf.setFillColor(CHARCOAL)
    pdf.setFont(course_font, course_size)

    for line in course_lines:
        pdf.drawCentredString(page_width / 2, course_y, line)
        course_y -= course_size + 5

    # Footer separator
    footer_y = 75

    pdf.setStrokeColor(BORDER)
    pdf.setLineWidth(0.8)
    pdf.line(
        content_left,
        footer_y + 15,
        content_right,
        footer_y + 15,
    )

    # Issue date
    pdf.setFillColor(MUTED_TEXT)
    pdf.setFont("Helvetica-Bold", 7)
    pdf.drawString(content_left, footer_y, "DATE OF ISSUE")

    pdf.setFillColor(CHARCOAL)
    pdf.setFont("Helvetica", 10)
    pdf.drawString(
        content_left,
        footer_y - 17,
        str(issue_date),
    )

    # Unique certificate identifier
    try:
        year = datetime.strptime(str(issue_date), "%Y-%m-%d").year
    except ValueError:
        year = datetime.now().year

    unique_id = f"CERT-{year}-{certificate_id:06d}"

    pdf.setFillColor(MUTED_TEXT)
    pdf.setFont("Helvetica-Bold", 7)
    pdf.drawRightString(
        content_right,
        footer_y,
        "CERTIFICATE ID",
    )

    pdf.setFillColor(TERRACOTTA_DARK)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawRightString(
        content_right,
        footer_y - 17,
        unique_id,
    )

    # Small decorative footer accent
    pdf.setFillColor(TERRACOTTA)
    pdf.circle(content_left, 40, 2.5, fill=1, stroke=0)

    pdf.setFillColor(MUTED_TEXT)
    pdf.setFont("Helvetica", 7)
    pdf.drawString(
        content_left + 10,
        37,
        "OFFICIAL CERTIFICATE OF COMPLETION",
    )

    pdf.setFillColor(MUTED_TEXT)
    pdf.drawRightString(
        content_right,
        37,
        "Issued electronically",
    )

    pdf.save()

    return str(output_path)
