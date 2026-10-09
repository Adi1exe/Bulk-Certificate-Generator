from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, A4
from reportlab.pdfgen import canvas

OUTPUT_DIR = Path("generated_certificates")

def generate_certificate(recipient_name: str, course_name: str, issue_date: str, certificate_id: int) -> str:
    """Render one PDF certificate using the project's single predefined template."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"certificate_{certificate_id}.pdf"
    page_w, page_h = landscape(A4)
    pdf = canvas.Canvas(str(output_path), pagesize=(page_w, page_h))
    pdf.setTitle(f"Certificate - {recipient_name}")
    # Decorative double border.
    pdf.setStrokeColor(colors.HexColor("#17365D"))
    pdf.setLineWidth(4)
    pdf.rect(24, 24, page_w - 48, page_h - 48)
    pdf.setStrokeColor(colors.HexColor("#C9A227"))
    pdf.setLineWidth(1.5)
    pdf.rect(34, 34, page_w - 68, page_h - 68)
    pdf.setFillColor(colors.HexColor("#17365D"))
    pdf.setFont("Helvetica-Bold", 27)
    pdf.drawCentredString(page_w / 2, page_h - 105, "CERTIFICATE OF COMPLETION")
    pdf.setFillColor(colors.HexColor("#555555"))
    pdf.setFont("Helvetica", 14)
    pdf.drawCentredString(page_w / 2, page_h - 155, "This certificate is proudly presented to")
    pdf.setFillColor(colors.HexColor("#111111"))
    pdf.setFont("Helvetica-Bold", 30)
    pdf.drawCentredString(page_w / 2, page_h - 205, recipient_name[:70])
    pdf.setStrokeColor(colors.HexColor("#C9A227"))
    pdf.setLineWidth(1)
    pdf.line(page_w * .25, page_h - 220, page_w * .75, page_h - 220)
    pdf.setFillColor(colors.HexColor("#444444"))
    pdf.setFont("Helvetica", 15)
    pdf.drawCentredString(page_w / 2, page_h - 260, "for successfully completing")
    pdf.setFillColor(colors.HexColor("#17365D"))
    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawCentredString(page_w / 2, page_h - 295, course_name[:90])
    pdf.setFillColor(colors.HexColor("#555555"))
    pdf.setFont("Helvetica", 12)
    pdf.drawCentredString(page_w / 2, 88, f"Issued on {issue_date}  |  Certificate ID: {certificate_id}")
    pdf.setStrokeColor(colors.HexColor("#777777"))
    pdf.line(page_w / 2 - 90, 65, page_w / 2 + 90, 65)
    pdf.setFont("Helvetica", 10)
    pdf.drawCentredString(page_w / 2, 50, "Authorized Signature")
    pdf.save()
    return str(output_path)
