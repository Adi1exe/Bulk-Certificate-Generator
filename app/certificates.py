
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader


OUTPUT_DIR = Path("generated_certificates")

# Optional organization logo. If the file doesn't exist, a clean
# placeholder will be displayed instead.
LOGO_PATH = Path("assets/logo.png")

# Design palette
BACKGROUND = colors.HexColor("#FFFEFC")
TERRACOTTA = colors.HexColor("#B7654E")
TERRACOTTA_LIGHT = colors.HexColor("#E9D3CA")
CHARCOAL = colors.HexColor("#292927")
SECONDARY = colors.HexColor("#77736F")
MUTED = colors.HexColor("#A7A09A")
WHITE = colors.white


def fit_font_size(text, font_name, max_size, max_width, min_size=10):
    """Return a font size that keeps text within its available width."""
    size = max_size

    while size > min_size and stringWidth(text, font_name, size) > max_width:
        size -= 1

    return max(size, min_size)


def generate_certificate(
    recipient_name: str,
    course_name: str,
    issue_date: str,
    certificate_id: int,
) -> str:
    """
    Generate one minimal, modern landscape A4 certificate.

    The function signature and return value remain compatible with
    the existing FastAPI backend.
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    output_path = OUTPUT_DIR / f"certificate_{certificate_id}.pdf"

    page_w, page_h = landscape(A4)

    pdf = canvas.Canvas(
        str(output_path),
        pagesize=(page_w, page_h),
    )

    pdf.setTitle(f"Certificate - {recipient_name}")
    pdf.setAuthor("Certificate Generator")
    pdf.setSubject(f"Certificate of Completion - {course_name}")

    # ---------------------------------------------------------
    # 1. Background and minimal border
    # ---------------------------------------------------------
    pdf.setFillColor(BACKGROUND)
    pdf.rect(0, 0, page_w, page_h, fill=1, stroke=0)

    # Fine border with a small terracotta accent.
    margin = 30

    pdf.setStrokeColor(TERRACOTTA_LIGHT)
    pdf.setLineWidth(0.8)
    pdf.rect(
        margin,
        margin,
        page_w - 2 * margin,
        page_h - 2 * margin,
        fill=0,
        stroke=1,
    )

    pdf.setFillColor(TERRACOTTA)
    pdf.rect(
        margin,
        margin,
        4,
        page_h - 2 * margin,
        fill=1,
        stroke=0,
    )

    # ---------------------------------------------------------
    # 2. Organization logo area
    # ---------------------------------------------------------
    logo_x = 64
    logo_y = page_h - 112
    logo_w = 76
    logo_h = 45

    if LOGO_PATH.is_file():
        try:
            pdf.drawImage(
                ImageReader(str(LOGO_PATH)),
                logo_x,
                logo_y,
                width=logo_w,
                height=logo_h,
                preserveAspectRatio=True,
                anchor="c",
                mask="auto",
            )
        except Exception:
            # A bad or unsupported logo should not stop generation.
            pdf.setStrokeColor(TERRACOTTA_LIGHT)
            pdf.roundRect(
                logo_x,
                logo_y,
                logo_w,
                logo_h,
                5,
                fill=0,
                stroke=1,
            )
            pdf.setFillColor(SECONDARY)
            pdf.setFont("Helvetica", 8)
            pdf.drawCentredString(
                logo_x + logo_w / 2,
                logo_y + logo_h / 2 - 3,
                "YOUR LOGO",
            )
    else:
        pdf.setStrokeColor(TERRACOTTA_LIGHT)
        pdf.roundRect(
            logo_x,
            logo_y,
            logo_w,
            logo_h,
            5,
            fill=0,
            stroke=1,
        )

        pdf.setFillColor(SECONDARY)
        pdf.setFont("Helvetica", 8)
        pdf.drawCentredString(
            logo_x + logo_w / 2,
            logo_y + logo_h / 2 - 3,
            "YOUR LOGO",
        )

    # Small document label.
    pdf.setFillColor(SECONDARY)
    pdf.setFont("Helvetica", 8)
    pdf.drawRightString(
        page_w - 64,
        page_h - 83,
        "CERTIFICATE  /  OF ACHIEVEMENT",
    )

    # ---------------------------------------------------------
    # 3. Main title
    # ---------------------------------------------------------
    center_x = page_w / 2

    pdf.setFillColor(TERRACOTTA)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawCentredString(
        center_x,
        page_h - 165,
        "CERTIFICATE OF COMPLETION",
    )

    pdf.setFillColor(CHARCOAL)
    pdf.setFont("Helvetica", 13)
    pdf.drawCentredString(
        center_x,
        page_h - 194,
        "This certificate is proudly presented to",
    )

    # ---------------------------------------------------------
    # 4. Recipient name
    # ---------------------------------------------------------
    recipient_name = " ".join(recipient_name.split())

    name_font = "Helvetica-Bold"
    name_size = fit_font_size(
        recipient_name,
        name_font,
        max_size=32,
        max_width=page_w - 150,
        min_size=16,
    )

    pdf.setFillColor(CHARCOAL)
    pdf.setFont(name_font, name_size)
    pdf.drawCentredString(
        center_x,
        page_h - 244,
        recipient_name,
    )

    # Terracotta separator.
    rule_w = 100

    pdf.setStrokeColor(TERRACOTTA)
    pdf.setLineWidth(1.5)
    pdf.line(
        center_x - rule_w / 2,
        page_h - 260,
        center_x + rule_w / 2,
        page_h - 260,
    )

    # ---------------------------------------------------------
    # 5. Course or event information
    # ---------------------------------------------------------
    pdf.setFillColor(SECONDARY)
    pdf.setFont("Helvetica", 12)
    pdf.drawCentredString(
        center_x,
        page_h - 292,
        "For successfully completing",
    )

    course_name = " ".join(course_name.split())

    course_font = "Helvetica-Bold"
    course_size = fit_font_size(
        course_name,
        course_font,
        max_size=20,
        max_width=page_w - 150,
        min_size=11,
    )

    pdf.setFillColor(TERRACOTTA)
    pdf.setFont(course_font, course_size)
    pdf.drawCentredString(
        center_x,
        page_h - 324,
        course_name,
    )

    # Short supporting statement.
    pdf.setFillColor(SECONDARY)
    pdf.setFont("Helvetica", 10)
    pdf.drawCentredString(
        center_x,
        page_h - 349,
        "In recognition of your learning and achievement.",
    )

    # ---------------------------------------------------------
    # 6. Signature and certificate identification
    # ---------------------------------------------------------
    footer_y = 91

    # Signature area, left.
    signature_x = 75
    signature_w = 180

    pdf.setStrokeColor(MUTED)
    pdf.setLineWidth(0.7)
    pdf.line(
        signature_x,
        footer_y + 18,
        signature_x + signature_w,
        footer_y + 18,
    )

    pdf.setFillColor(CHARCOAL)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(
        signature_x,
        footer_y,
        "Authorized Signature",
    )

    pdf.setFillColor(SECONDARY)
    pdf.setFont("Helvetica", 8)
    pdf.drawString(
        signature_x,
        footer_y - 13,
        "Organization representative",
    )

    # Certificate ID and issue date, right.
    right_x = page_w - 75

    pdf.setFillColor(SECONDARY)
    pdf.setFont("Helvetica", 8)
    pdf.drawRightString(
        right_x,
        footer_y + 21,
        f"ISSUED  {issue_date}",
    )

    pdf.setFillColor(CHARCOAL)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawRightString(
        right_x,
        footer_y,
        f"CERTIFICATE ID  /  {certificate_id}",
    )

    # Small terracotta footer accent.
    pdf.setFillColor(TERRACOTTA)
    pdf.circle(page_w / 2, 55, 2.5, fill=1, stroke=0)

    pdf.save()

    return str(output_path)
