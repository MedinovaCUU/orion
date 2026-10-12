"""Texto plano, filas posicionales y reglas horizontales de uno o varios PDF (PyMuPDF).

Uso: python3 -I pdf-text.py a.pdf b.pdf → JSON en stdout con, por archivo:
  text   : texto plano de todo el documento
  pages  : [{ text, rows: ["palabra palabra …"], lines: [{ y, words: [{ x, y, text }] }], rules: [{ y, x0, x1 }] }]
Las líneas agrupan las palabras por banda vertical (3 pt) y las ordenan de izquierda a derecha; sirven
para leer tablas por columnas (hojas de valores, datos de control del certificado). `words[].y` es el centro
vertical exacto de la palabra (la `y` de la línea es la banda redondeada).
`rules` son las líneas horizontales dibujadas en la página (los segmentos de una línea discontinua se unen):
delimitan las celdas de las tablas, p. ej. la celda de un componente o de un método en la hoja de valores.
"""

from __future__ import annotations

import json
import sys

import fitz  # PyMuPDF

# Grosor máximo de un rectángulo para tratarlo como línea, tolerancia vertical para unir segmentos de una
# misma regla, hueco máximo entre guiones de una línea discontinua y longitud mínima de una regla útil.
RULE_THICKNESS = 1.2
RULE_Y_TOLERANCE = 0.8
DASH_GAP = 3.0
MIN_RULE_LENGTH = 20.0


def lines_for_page(page) -> list[dict]:
    buckets: dict[int, list] = {}
    for word in page.get_text("words"):
        buckets.setdefault(round(word[1] / 3), []).append(word)
    lines = []
    for key in sorted(buckets):
        words = sorted(buckets[key], key=lambda item: item[0])
        lines.append(
            {
                "y": round(key * 3, 1),
                "words": [{"x": round(item[0], 1), "y": round((item[1] + item[3]) / 2, 1), "text": item[4]} for item in words],
            }
        )
    return lines


def rules_for_page(page) -> list[dict]:
    segments = []
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0] == "l":
                start, end = item[1], item[2]
                if abs(start.y - end.y) < 0.6 and abs(start.x - end.x) > 0.5:
                    segments.append(((start.y + end.y) / 2, min(start.x, end.x), max(start.x, end.x)))
            elif item[0] == "re":
                rect = item[1]
                if rect.height <= RULE_THICKNESS and rect.width > rect.height:
                    segments.append(((rect.y0 + rect.y1) / 2, rect.x0, rect.x1))
    segments.sort()
    bands: list[dict] = []
    for y, x0, x1 in segments:
        band = next((item for item in bands if abs(item["y"] - y) <= RULE_Y_TOLERANCE), None)
        if band is None:
            bands.append({"y": y, "parts": [[x0, x1]]})
        else:
            band["parts"].append([x0, x1])
    rules = []
    for band in bands:
        parts = sorted(band["parts"])
        merged = [parts[0][:]]
        for x0, x1 in parts[1:]:
            if x0 - merged[-1][1] <= DASH_GAP:
                merged[-1][1] = max(merged[-1][1], x1)
            else:
                merged.append([x0, x1])
        for x0, x1 in merged:
            if x1 - x0 >= MIN_RULE_LENGTH:
                rules.append({"y": round(band["y"], 1), "x0": round(x0, 1), "x1": round(x1, 1)})
    return sorted(rules, key=lambda rule: (rule["y"], rule["x0"]))


def main(paths: list[str]) -> None:
    output = []
    for path in paths:
        document = fitz.open(path)
        pages = []
        for page in document:
            lines = lines_for_page(page)
            pages.append(
                {
                    "text": page.get_text(),
                    "rows": [" ".join(w["text"] for w in line["words"]) for line in lines],
                    "lines": lines,
                    "rules": rules_for_page(page),
                }
            )
        output.append({"file": path, "pageCount": document.page_count, "text": "\n".join(page["text"] for page in pages), "pages": pages})
    json.dump(output, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main(sys.argv[1:])
