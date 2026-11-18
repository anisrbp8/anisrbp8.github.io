#!/usr/bin/env python3
"""Build bilingual sharing cards from SVG layout and the unchanged portrait.

Requires Inkscape. The photograph is embedded without retouching; all wording
is editable text in the generated SVG source.
"""
import base64
from pathlib import Path
import subprocess
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "assets" / "img"
PORTRAIT = base64.b64encode((IMAGES / "anis-rojbi-920.jpg").read_bytes()).decode()
COPY = {
    "fr": ("Maître de conférences", "Accessibilité numérique", "Traitement du signal et des images", "Technologies d’assistance"),
    "en": ("Associate Professor", "Digital accessibility", "Signal and image processing", "Assistive technologies"),
}

for language, (role, *topics) in COPY.items():
    lines = "\n".join(
        f'<text x="64" y="{340 + i * 50}" font-size="29">{escape(topic)}</text>'
        for i, topic in enumerate(topics)
    )
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630" xml:lang="{language}">
<title>Anis Rojbi — Université Paris 8</title>
<desc>{escape(role)}. {escape('. '.join(topics))}.</desc>
<rect width="1200" height="630" fill="#0b2134"/>
<rect x="64" y="66" width="72" height="5" rx="2.5" fill="#87dbe0"/>
<g font-family="DejaVu Sans, sans-serif" fill="#ffffff">
<text x="64" y="166" font-size="64" font-weight="700">Anis Rojbi</text>
<text x="66" y="224" font-size="30" fill="#87dbe0">{escape(role)}</text>
<text x="66" y="268" font-size="25" fill="#dce6ee">Université Paris 8 · CHArt</text>
{lines}
<text x="66" y="553" font-size="25" fill="#dce6ee">anisrojbi.fr</text>
</g>
<defs><clipPath id="portrait"><rect x="790" y="64" width="346" height="502" rx="18"/></clipPath></defs>
<image x="776" y="64" width="374" height="502" preserveAspectRatio="xMidYMid meet" clip-path="url(#portrait)" xlink:href="data:image/jpeg;base64,{PORTRAIT}"/>
</svg>
'''
    source = IMAGES / f"anis-rojbi-social-{language}.svg"
    output = source.with_suffix(".png")
    source.write_text(svg, encoding="utf-8")
    subprocess.run(["inkscape", str(source), "--export-type=png", f"--export-filename={output}"], check=True)
    print(f"{output.relative_to(ROOT)}: {output.stat().st_size} bytes")
