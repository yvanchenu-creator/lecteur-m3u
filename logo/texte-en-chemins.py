# Transforme le texte « BTV » (Bebas Neue) en tracés SVG, pour que le logo s'affiche sans police.
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
f = TTFont(sys.argv[1]); gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f["head"].unitsPerEm
size, spacing, cx, base = 200, 6, 256, 322
sc = size / upm
letters = "BTV"
adv = [gs[cmap[ord(c)]].width * sc + spacing for c in letters]
x = cx - (sum(adv) - spacing) / 2  # même centrage que text-anchor="middle" (sans l'espace final)
paths = []
for c, a in zip(letters, adv):
    pen = SVGPathPen(gs); g = gs[cmap[ord(c)]]
    g.draw(TransformPen(pen, (sc, 0, 0, -sc, x, base)))
    paths.append(pen.getCommands()); x += a
print("B:" + paths[0]); print("TV:" + paths[1] + paths[2])
