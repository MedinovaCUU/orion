"""Download official EInfo documents required by analytes observed in a SAT report."""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path

import requests
from bs4 import BeautifulSoup


OUTPUT_DIR = Path("output/pdf/einfo_sat_ba400")
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"

PRODUCTS = {
    "21520": "GGT",
    "21580": "LDH",
    "21760": "LIPASA_DGGR",
    "21513": "PROTEINA_TOTAL_BIREACTIVA",
    "21528": "TRIGLICERIDOS",
    "21594": "HDL_DIRECTO_TOOS",
    "21792": "CK_MB",
    "22147": "HBA1C_DIRECTA",
    "18009": "SUERO_CONTROL_NIVEL_1",
    "18010": "SUERO_CONTROL_NIVEL_2",
    "18001": "CONTROL_HBA1C_NORMAL",
    "18002": "CONTROL_HBA1C_ELEVADO",
    "18024": "CONTROL_CK_CKMB",
    "18040": "CONTROL_LIPIDOS_NIVEL_1",
    "18041": "CONTROL_LIPIDOS_NIVEL_2",
}


def safe_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", value.strip()).strip("_") or "documento"


def download_documents() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": "Orion-DRI-EInfo-Sync/1.0"})
    manifest: list[dict[str, object]] = []

    for code, label in PRODUCTS.items():
        home = session.get("https://einfo.bio/", timeout=45)
        home.raise_for_status()
        token_node = BeautifulSoup(home.text, "html.parser").find(
            "input", {"name": "__RequestVerificationToken"}
        )
        if not token_node:
            raise RuntimeError("EInfo no devolvió el token de búsqueda")

        response = session.post(
            "https://einfo.bio/Home/Docs",
            data={
                "__RequestVerificationToken": token_node.get("value"),
                "Lang": "es",
                "Code": code,
                "Lot": "",
            },
            timeout=90,
        )
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        title = soup.select_one(".card-titleDoc")
        active_lot = None
        active_lot_link = soup.select_one("a.dropdown-item.active")
        if active_lot_link:
            match = re.search(
                rf"{re.escape(code)}\s+([A-Za-z0-9]+)",
                active_lot_link.get_text(" ", strip=True),
            )
            active_lot = match.group(1) if match else None

        # Re-open the resolved lot URL so Value Sheet and CoA correspond to the
        # lot displayed in the manifest, rather than an iframe cached by EInfo.
        if active_lot:
            response = session.get(f"https://einfo.bio/{active_lot}/{code}/es", timeout=90)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")

        downloaded = []
        for tab in soup.select("li.nav-item a"):
            tab_name = tab.get_text(" ", strip=True)
            target = tab.get("href", "").lstrip("#")
            iframe = soup.select_one(f"#{target} iframe") if target else None
            source = iframe.get("src", "") if iframe else ""
            prefix = "data:application/pdf;base64,"
            if not source.startswith(prefix):
                continue
            pdf_bytes = base64.b64decode(source[len(prefix) :])
            file_name = f"{code}_{safe_name(label)}_{safe_name(tab_name)}.pdf"
            file_path = OUTPUT_DIR / file_name
            file_path.write_bytes(pdf_bytes)
            downloaded.append(
                {"type": tab_name, "file": str(file_path), "bytes": len(pdf_bytes)}
            )

        manifest.append(
            {
                "productCode": code,
                "label": label,
                "title": title.get_text(" ", strip=True) if title else None,
                "latestLot": active_lot,
                "sourceUrl": response.url,
                "documents": downloaded,
            }
        )
        print(f"{code}: {len(downloaded)} documentos, lote vigente {active_lot or 'N/A'}")

    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Manifest: {MANIFEST_PATH}")


if __name__ == "__main__":
    download_documents()
