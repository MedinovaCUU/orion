"""Genera las fuentes web de Orion a partir de los OTF de Alliance No.2 (licencia de Biosystems).

  public/fonts/alliance/AllianceNo2-<Peso>.woff2  -> @font-face de index.css, impresión, SVG y correos
  public/fonts/alliance/AllianceNo2-<Peso>.ttf    -> jsPDF (no lee CFF) y textos 3D de troika (no lee WOFF2)

Uso (requiere fonttools y brotli):
  python3 -m venv /tmp/fonts-venv && /tmp/fonts-venv/bin/pip install fonttools brotli
  /tmp/fonts-venv/bin/python tools/build-alliance-fonts.py ~/Library/Fonts public/fonts/alliance

Al recibir los archivos oficiales de la licencia basta con volver a correrlo: los nombres de salida no cambian.
"""
import os
import sys

from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont, newTable

FACES = {
    'Light': 'degarism-studio-alliance-no-2-light.otf',
    'Regular': 'Alliance No.2 Regular.otf',
    'Medium': 'Alliance No.2 Medium.otf',
    'SemiBold': 'Alliance No.2 SemiBold.otf',
}
TTF_FACES = {'Regular', 'Medium', 'SemiBold'}


def alias_micro(font):
    # Alliance solo dibuja la mu griega (U+03BC); el signo micro (U+00B5, "µL") reutiliza ese glifo.
    for table in font['cmap'].tables:
        if table.isUnicode() and 0x3BC in table.cmap and 0xB5 not in table.cmap:
            table.cmap[0xB5] = table.cmap[0x3BC]


def to_truetype(font):
    glyph_order = font.getGlyphOrder()
    glyph_set = font.getGlyphSet()
    glyf = newTable('glyf')
    glyf.glyphOrder = glyph_order
    glyf.glyphs = {}
    for name in glyph_order:
        pen = TTGlyphPen(glyph_set)
        glyph_set[name].draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=True))
        glyf[name] = pen.glyph()
    font['loca'] = newTable('loca')
    font['glyf'] = glyf
    for tag in ('CFF ', 'VORG'):
        if tag in font:
            del font[tag]
    maxp = font['maxp']
    maxp.tableVersion = 0x00010000
    for attr in ('maxTwilightPoints', 'maxStorage', 'maxFunctionDefs', 'maxInstructionDefs',
                 'maxStackElements', 'maxSizeOfInstructions', 'maxComponentElements'):
        setattr(maxp, attr, 0)
    maxp.maxZones = 1
    font['head'].glyphDataFormat = 0
    post = font['post']
    post.formatType = 2.0
    post.extraNames = []
    post.mapping = {}
    post.glyphOrder = glyph_order
    font.sfntVersion = '\x00\x01\x00\x00'
    font.recalcBBoxes = True


def main(src_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    for weight, file in FACES.items():
        path = os.path.join(src_dir, file)
        web = TTFont(path)
        alias_micro(web)
        web.flavor = 'woff2'
        web.save(os.path.join(out_dir, f'AllianceNo2-{weight}.woff2'))
        if weight in TTF_FACES:
            tt = TTFont(path)
            alias_micro(tt)
            to_truetype(tt)
            tt.save(os.path.join(out_dir, f'AllianceNo2-{weight}.ttf'))
    for name in sorted(os.listdir(out_dir)):
        print(name, os.path.getsize(os.path.join(out_dir, name)))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
