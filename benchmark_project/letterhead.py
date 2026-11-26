# Copyright (c) 2026, Emeron Infospace and contributors
# For license information, please see license.txt

"""Apply the Benchmark Building Contracting letter head to every print format.

Frappe renders every print (browser print view and PDF) through the
``pdf_body_html`` hook. When the Benchmark letter head is selected, this adds
whatever the print format itself does not provide:

* the header, for formats that ignore ``letter_head``;
* the footer on every PDF page (``#footer-html``), for formats without one;
* PDF page margins sized for the artwork, and a faint logo watermark.

Formats that already handle the letter head (they contain ``bm-watermark``)
are left untouched. Any error falls back to the unmodified print.
"""

import frappe

ASSETS = "/assets/benchmark_project/images/letterhead/"
HEADER_MARK = ASSETS + "benchmark_header.png"
FOOTER_MARK = ASSETS + "benchmark_footer.png"
WATERMARK = ASSETS + "benchmark_watermark.png"
LETTER_HEAD_NAME = "Benchmark Building Contracting"

# Printed size of the artwork on A4 with 15 mm side margins: header ~29.4 mm,
# footer ~25.7 mm; the margins leave a little breathing room.
MARGIN_TOP_MM = 36
MARGIN_BOTTOM_MM = 32


def pdf_body_html(template, args, **kwargs):
	html = _render(template, args, **kwargs)
	try:
		return apply_letterhead(html, args)
	except Exception:
		frappe.log_error(title="Benchmark letter head")
		return html


def _render(template, args, **kwargs):
	try:
		from frappe.utils.pdf import pdf_body_html as frappe_pdf_body_html
	except ImportError:
		return template.render(args, filters={"len": len})
	return frappe_pdf_body_html(template, args, **kwargs)


def apply_letterhead(html, args):
	header = args.get("letter_head") or ""
	footer = args.get("footer") or ""
	if args.get("no_letterhead") or HEADER_MARK not in header:
		return html  # another (or no) letter head selected
	if "bm-watermark" in html:
		return html  # the print format already handles the letter head

	prefix = ""
	suffix = ""
	if HEADER_MARK not in html:
		prefix = f'<div id="header-html"><div class="letter-head">{header}</div></div>\n'
	if footer and FOOTER_MARK not in html:
		suffix = f'\n<div id="footer-html" class="visible-pdf"><div class="letter-head-footer">{footer}</div></div>'

	full = prefix + html + suffix
	return (
		style_block(
			header_repeats='id="header-html"' in full,
			has_footer='id="footer-html"' in full,
		)
		+ full
	)


def style_block(header_repeats, has_footer):
	margins = ""
	if header_repeats:
		margins += f"\t\tmargin-top: {MARGIN_TOP_MM}mm;\n"
	if has_footer:
		margins += f"\t\tmargin-bottom: {MARGIN_BOTTOM_MM}mm;\n"
	page = ""
	if margins:
		# Frappe's PDF generator reads these (one per line) as wkhtmltopdf page
		# margins. The media query never matches, so browsers and wkhtmltopdf do
		# not also apply them as element margins.
		page = "\t@media (max-width: 0px) {\n\t.print-format {\n" + margins + "\t}\n\t}\n"
	return (
		"<style>\n"
		+ page
		+ "\t.bm-watermark { position: fixed; top: 50%; left: 50%; width: 110mm; height: auto;"
		" transform: translate(-50%, -50%); opacity: 0.07; z-index: 0; pointer-events: none; }\n"
		"\t@media screen { .bm-watermark { display: none; } }\n"
		"\t.letter-head img, .letter-head-footer img { width: 100%; height: auto; }\n"
		"</style>\n"
		f'<img class="bm-watermark" src="{WATERMARK}" alt="">\n'
	)
