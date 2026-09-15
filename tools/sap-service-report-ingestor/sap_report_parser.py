from __future__ import annotations

import hashlib
import logging
import re
import subprocess
import tempfile
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any

import pdfplumber
import pypdfium2


PARSER_VERSION = "sap-fsm-pdf-v1"
YES_NO_VALUES = {"si", "no", "no aplica", "n/a", "na"}
logging.getLogger("pdfminer").setLevel(logging.ERROR)


def _clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if not unicodedata.combining(char)).lower().strip(" .:")


def _iso_date(value: str, prefer_month_first: bool = False) -> str | None:
    value = value.strip()
    slash_patterns = ("%m/%d/%Y", "%d/%m/%Y") if prefer_month_first else ("%d/%m/%Y", "%m/%d/%Y")
    for pattern in (*slash_patterns, "%Y-%m-%d"):
        try:
            return datetime.strptime(value, pattern).date().isoformat()
        except ValueError:
            pass
    return None


def _match(pattern: str, text: str, flags: int = 0) -> str | None:
    found = re.search(pattern, text, flags)
    return _clean(found.group(1)) if found else None


def _ocr_pdf(path: Path, language: str) -> list[str]:
    with tempfile.TemporaryDirectory(prefix="sap-fsm-ocr-") as tmp:
        pages: list[str] = []
        document = pypdfium2.PdfDocument(path)
        for index, page in enumerate(document):
            image = Path(tmp) / f"page-{index + 1:04d}.png"
            bitmap = page.render(scale=220 / 72)
            bitmap.to_pil().save(image)
            completed = subprocess.run(
                ["tesseract", str(image), "stdout", "-l", language],
                check=True,
                capture_output=True,
                text=True,
            )
            pages.append(completed.stdout)
            bitmap.close()
            page.close()
        document.close()
        return pages


def _extract_pages(path: Path, ocr_language: str) -> tuple[list[str], list[list[list[list[str | None]]]], str]:
    texts: list[str] = []
    all_tables: list[list[list[list[str | None]]]] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            texts.append(page.extract_text() or "")
            all_tables.append(page.extract_tables() or [])

    useful_characters = sum(len(re.sub(r"\s", "", text)) for text in texts)
    has_identity = bool(re.search(r"Informe de servicio\s+\d+", "\n".join(texts), re.I))
    if useful_characters >= 250 and has_identity:
        return texts, all_tables, "embedded_text"
    return _ocr_pdf(path, ocr_language), [], "ocr"


def _parse_client(first_page: str) -> dict[str, Any]:
    block = re.search(r"BioSimex\s*\n(?P<body>.*?)\nNuestra persona de contacto", first_page, re.I | re.S)
    lines = [line.strip() for line in (block.group("body") if block else "").splitlines() if line.strip()]
    name_line = lines[0] if lines else ""
    client_code = _match(r"\((\d+)\)\s*$", name_line)
    client_name = re.sub(r"\s*\(\d+\)\s*$", "", name_line).strip() or None
    address_lines = lines[1:]
    if address_lines and address_lines[-1].upper() in {"MX", "ES", "US"}:
        country = address_lines.pop().upper()
    else:
        country = None
    return {
        "code": client_code,
        "name": client_name,
        "address": ", ".join(address_lines) or None,
        "country": country,
    }


def _parse_equipment(first_page: str) -> dict[str, Any]:
    serial_line = re.search(
        r"(?m)^(\d{7,})\s+(.+?)\s+(\d{4}-\d{2}-\d{2})\s+([^\n]+)$",
        first_page,
    )
    if not serial_line:
        return {}
    tail = serial_line.group(4).split()
    software = tail[-1] if tail else None
    firmware = tail[-2] if len(tail) > 1 else None
    os_version = " ".join(tail[:-2]) or None
    after = first_page[serial_line.end() :].lstrip().splitlines()
    model = after[0].strip().rstrip(".") if after and after[0].strip() != "Esfuerzos" else None
    description = _clean(" ".join(filter(None, [serial_line.group(2), model]))) or None
    return {
        "serial_number": serial_line.group(1),
        "description": description,
        "model": model,
        "installed_on": serial_line.group(3),
        "operating_system": os_version,
        "firmware_version": firmware,
        "software_version": software,
    }


def _parse_efforts(first_page: str) -> list[dict[str, Any]]:
    block = re.search(r"Esfuerzos\s*\n.*?Duración\s*\n(?P<body>.*?)(?:\nMateriales|\nFirma)", first_page, re.I | re.S)
    if not block:
        return []
    efforts = []
    pattern = re.compile(r"(?m)^(\d{6,})\s+(\d{2}/\d{2}/\d{4})\s+(.+?)\s+(\d{2}:\d{2})$")
    for folio, date, technician, duration in pattern.findall(block.group("body")):
        efforts.append(
            {
                "activity_folio": folio,
                "performed_on": _iso_date(date, prefer_month_first=True),
                "technician": _clean(technician),
                "duration": duration,
                "duration_minutes": int(duration[:2]) * 60 + int(duration[3:]),
            }
        )
    return efforts


def _parse_materials(first_page: str) -> list[dict[str, Any]]:
    block = re.search(r"Materiales\s*\n.*?Cantidad\s*\n(?P<body>.*?)(?:\nFirma)", first_page, re.I | re.S)
    if not block:
        return []
    lines = [line.strip() for line in block.group("body").splitlines() if line.strip()]
    materials: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for line in lines:
        found = re.match(r"^(\d{6,})\s+(\S+)\s+(.+?)\s+(\d+(?:[.,]\d+)?)$", line)
        if found:
            current = {
                "activity_folio": found.group(1),
                "code": found.group(2),
                "description": _clean(found.group(3)),
                "quantity": float(found.group(4).replace(",", ".")),
            }
            materials.append(current)
        elif current:
            current["description"] = _clean(f'{current["description"]} {line}')
    return materials


def _parse_signatures(first_page: str, technician: str | None) -> dict[str, str | None]:
    if not technician:
        return {"client_name": None, "technician_name": None}
    for line in first_page.splitlines():
        cleaned = _clean(line)
        if cleaned.endswith(technician) and cleaned != technician:
            client_name = cleaned[: -len(technician)].strip()
            if client_name and not client_name.endswith("Técnico:"):
                return {"client_name": client_name, "technician_name": technician}
    return {"client_name": None, "technician_name": technician}


def _repair_sap_wraps(value: str) -> str:
    repaired = _clean(value)
    replacements = {
        "lava do": "lavado",
        "lavad o": "lavado",
        "B aja": "Baja",
        "150u m": "150um",
        "µ m": "µm",
        "calen tador": "calentador",
        "c orreas": "correas",
        "lo s": "los",
        "esta ción": "estación",
        "fot ometría": "fotometría",
        "bomba s": "bombas",
        "Colisi ón": "Colisión",
        "desbordami ento": "desbordamiento",
        "verificaci ón": "verificación",
        "Gluco sa": "Glucosa",
    }
    for source, target in replacements.items():
        repaired = repaired.replace(source, target)
    return repaired


def _parse_checklist_text(pages: list[str]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    value_pattern = re.compile(r"^(.*?)(?:\s+)(Sí|Si|No aplica|No|-?\d+(?:[.,]\d+)?)$", re.I)

    def finish_current() -> None:
        nonlocal current
        if current:
            current["item"] = _repair_sap_wraps(current["item"])
            current["sequence"] = len(items) + 1
            items.append(current)
            current = None

    for raw_page in pages[1:]:
        for raw_line in raw_page.splitlines():
            line = _clean(raw_line)
            if not line:
                continue
            if re.match(r"^(?:Informe de servicio.*|BioS - Checklist.*|Demo HTML Report.*|\d+\s*/\s*\d+)$", line, re.I):
                finish_current()
                continue
            if _key(line) == "mantenimiento anual":
                finish_current()
                continue
            observation = re.match(r"^Observaciones\s+(.+)$", line, re.I)
            found = value_pattern.match(line)
            if observation:
                finish_current()
                current = {"item": "Observaciones", "value": _clean(observation.group(1))}
            elif found and _clean(found.group(1)):
                finish_current()
                current = {"item": _clean(found.group(1)), "value": _clean(found.group(2))}
            elif current:
                current["item"] = f'{current["item"]} {line}'
        finish_current()
    return items


def _parse_checklist_tables(all_tables: list[list[list[list[str | None]]]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    sequence = 0
    for page_tables in all_tables[1:]:
        for table in page_tables:
            for row in table:
                cells = [_clean(cell) for cell in row if _clean(cell)]
                if len(cells) < 2 or any(len(cell) > 700 for cell in cells):
                    continue
                value_index = next(
                    (
                        index
                        for index in range(len(cells) - 1, 0, -1)
                        if _key(cells[index]) in YES_NO_VALUES
                        or re.fullmatch(r"-?\d+(?:[.,]\d+)?", cells[index])
                        or cells[index] == "."
                    ),
                    None,
                )
                if value_index is None:
                    continue
                question = cells[value_index - 1]
                value = cells[value_index]
                if not question or question in {"/", "2", "3", "4"}:
                    continue
                identity = (_key(question), _key(value))
                if identity in seen:
                    continue
                seen.add(identity)
                sequence += 1
                items.append({"sequence": sequence, "item": question, "value": value})
    return items


def _service_kind(description: str | None, assistance_type: str | None) -> str:
    value = _key(f"{description or ''} {assistance_type or ''}")
    if "prevent" in value:
        return "preventivo"
    if "correct" in value or "repara" in value:
        return "correctivo"
    return "otro"


def parse_pdf(path: str | Path, ocr_language: str = "spa+eng") -> dict[str, Any]:
    pdf_path = Path(path)
    raw_bytes = pdf_path.read_bytes()
    pages, tables, extraction_method = _extract_pages(pdf_path, ocr_language)
    full_text = "\n\f\n".join(pages)
    first_page = pages[0] if pages else ""

    report_number = _match(r"Informe de servicio\s+(\d+)", full_text, re.I)
    description = _match(r"Descripción\s+(.+?)\s*\nTipo de asistencia", first_page, re.I)
    assistance_type = _match(r"Tipo de asistencia\s+(.+?)\s*\nFecha inicio", first_page, re.I)
    start_date = _match(r"Fecha inicio\s+(\d{1,2}/\d{1,2}/\d{4})", first_page, re.I)
    end_date = _match(r"Fecha fin\s+(\d{1,2}/\d{1,2}/\d{4})", first_page, re.I)
    efforts = _parse_efforts(first_page)
    materials = _parse_materials(first_page)
    equipment = _parse_equipment(first_page)
    checklist = _parse_checklist_text(pages)
    if not checklist:
        checklist = _parse_checklist_tables(tables)
    activity_folio = efforts[0]["activity_folio"] if efforts else _match(r"PARTE DE ASISTENCIA\s+(\d+)", pdf_path.name, re.I)
    technician = efforts[0]["technician"] if efforts else None
    final_observation = None
    observations = [item["value"] for item in checklist if _key(item["item"]) == "observaciones" and _key(item["value"]) not in {"", ".", "no tiene"}]
    if observations:
        final_observation = observations[-1]

    missing = [
        name
        for name, value in {
            "report_number": report_number,
            "activity_folio": activity_folio,
            "equipment.serial_number": equipment.get("serial_number"),
            "start_date": start_date,
        }.items()
        if not value
    ]
    if missing:
        raise ValueError(f"No fue posible identificar campos obligatorios: {', '.join(missing)}")

    return {
        "schema_version": "sap-fsm-service-v1",
        "parser_version": PARSER_VERSION,
        "file_name": pdf_path.name,
        "file_size": len(raw_bytes),
        "file_sha256": hashlib.sha256(raw_bytes).hexdigest(),
        "extraction_method": extraction_method,
        "report_number": report_number,
        "activity_folio": activity_folio,
        "description": description,
        "assistance_type": assistance_type,
        "service_kind": _service_kind(description, assistance_type),
        "start_date": _iso_date(start_date or ""),
        "end_date": _iso_date(end_date or ""),
        "client": _parse_client(first_page),
        "equipment": equipment,
        "technician": technician,
        "signatures": _parse_signatures(first_page, technician),
        "efforts": efforts,
        "total_duration_minutes": sum(item["duration_minutes"] for item in efforts),
        "materials": materials,
        "checklist": checklist,
        "final_observation": final_observation,
        "quality": {
            "required_fields_complete": not missing,
            "checklist_items": len(checklist),
            "warnings": [],
        },
    }
