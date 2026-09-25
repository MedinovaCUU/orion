#!/usr/bin/env python3
from __future__ import annotations

import argparse
import email
import imaplib
import json
import os
import re
import subprocess
import sys
from email.header import decode_header, make_header
from email.message import Message
from email.utils import parseaddr
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from sap_report_parser import parse_pdf


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta la variable de entorno {name}")
    return value


def required_secret(name: str, keychain_service: str, keychain_account: str) -> str:
    value = os.getenv(name, "").strip()
    if value:
        return value
    completed = subprocess.run(
        ["/usr/bin/security", "find-generic-password", "-a", keychain_account, "-s", keychain_service, "-w"],
        capture_output=True,
        text=True,
    )
    if completed.returncode == 0 and completed.stdout.strip():
        return completed.stdout.strip()
    raise RuntimeError(
        f"Falta {name}. Guardalo en el Llavero con servicio '{keychain_service}' y cuenta '{keychain_account}'."
    )


def load_env_file(path: Path | None = None) -> None:
    path = path or Path(__file__).with_name(".env")
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


def http_post(url: str, headers: dict[str, str], body: bytes, timeout: int = 60) -> tuple[int, bytes]:
    request = Request(url, data=body, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except HTTPError as exc:
        return exc.code, exc.read()


class SupabaseWriter:
    def __init__(self) -> None:
        self.url = required_env("SUPABASE_URL").rstrip("/")
        self.key = required_secret(
            "SUPABASE_SERVICE_ROLE_KEY",
            os.getenv("KEYCHAIN_SUPABASE_SERVICE", "orion-sap-supabase-service-role"),
            self.url,
        )
        self.bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "sap-service-reports")
        self.headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}"}

    def upload_pdf(self, path: Path, payload: dict[str, Any]) -> str:
        year = (payload.get("end_date") or payload.get("start_date") or "unknown")[:4]
        storage_path = f'{year}/{payload["activity_folio"]}/{payload["file_sha256"]}.pdf'
        status, response_body = http_post(
            f'{self.url}/storage/v1/object/{quote(self.bucket)}/{quote(storage_path, safe="/")}',
            {**self.headers, "Content-Type": "application/pdf", "x-upsert": "false"},
            path.read_bytes(),
        )
        duplicate_storage_object = False
        if status in {400, 409}:
            try:
                error_payload = json.loads(response_body)
                duplicate_storage_object = str(error_payload.get("statusCode")) == "409" or (
                    error_payload.get("error") == "Duplicate" and error_payload.get("message") == "The resource already exists"
                )
            except (json.JSONDecodeError, AttributeError):
                duplicate_storage_object = False
        if status not in {200, 201, 409} and not duplicate_storage_object:
            raise RuntimeError(f"No se pudo guardar el PDF ({status}): {response_body[:300].decode(errors='replace')}")
        return storage_path

    def persist(self, payload: dict[str, Any], storage_path: str, message_id: str | None, sender: str | None) -> dict[str, Any]:
        status, response_body = http_post(
            f"{self.url}/rest/v1/rpc/ingest_sap_service_report",
            {**self.headers, "Content-Type": "application/json"},
            json.dumps({
                "p_payload": payload,
                "p_storage_path": storage_path,
                "p_source_message_id": message_id,
                "p_source_sender": sender,
            }, ensure_ascii=False).encode("utf-8"),
        )
        if status < 200 or status >= 300:
            raise RuntimeError(f"Supabase rechazo la ingesta ({status}): {response_body[:500].decode(errors='replace')}")
        return json.loads(response_body)


def ingest_pdf(path: Path, writer: SupabaseWriter, message_id: str | None = None, sender: str | None = None) -> dict[str, Any]:
    payload = parse_pdf(path, os.getenv("OCR_LANGUAGE", "spa+eng"))
    storage_path = writer.upload_pdf(path, payload)
    result = writer.persist(payload, storage_path, message_id, sender)
    return {"parsed": payload, "database": result, "storage_path": storage_path}


def decoded_filename(part: Message) -> str:
    raw = part.get_filename() or "attachment.pdf"
    return str(make_header(decode_header(raw)))


def process_message(
    message: Message,
    writer: SupabaseWriter,
    allowed_sender: str,
    allowed_forwarders: set[str] | None = None,
) -> list[dict[str, Any]]:
    sender = parseaddr(message.get("From", ""))[1].lower()
    allowed = {allowed_sender.lower(), *(allowed_forwarders or set())}
    if sender not in allowed:
        raise ValueError(f"Remitente no autorizado: {sender or '[vacio]'}")
    message_id = message.get("Message-ID")
    results = []
    with __import__("tempfile").TemporaryDirectory(prefix="sap-fsm-mail-") as tmp:
        for part in message.walk():
            filename = decoded_filename(part)
            content_type = part.get_content_type().lower()
            if not (filename.lower().endswith(".pdf") or content_type == "application/pdf"):
                continue
            body = part.get_payload(decode=True)
            if not body or not body.startswith(b"%PDF"):
                continue
            safe_name = re.sub(r"[^A-Za-z0-9._ -]+", "_", Path(filename).name)
            path = Path(tmp) / safe_name
            path.write_bytes(body)
            results.append(ingest_pdf(path, writer, message_id, sender))
    if not results:
        raise ValueError("El correo autorizado no contiene adjuntos PDF validos")
    return results


def poll_once() -> list[dict[str, Any]]:
    host = required_env("IMAP_HOST")
    port = int(os.getenv("IMAP_PORT", "993"))
    username = required_env("IMAP_USERNAME")
    password = required_secret(
        "IMAP_PASSWORD",
        os.getenv("KEYCHAIN_IMAP_SERVICE", "orion-sap-imap"),
        username,
    )
    mailbox = os.getenv("IMAP_MAILBOX", "INBOX")
    allowed_sender = os.getenv("SAP_ALLOWED_SENDER", "noreply@eu.fsm.cloud.sap")
    allowed_forwarders = {
        value.strip().lower()
        for value in os.getenv("SAP_ALLOWED_FORWARDERS", "").split(",")
        if value.strip()
    }
    writer = SupabaseWriter()
    processed: list[dict[str, Any]] = []

    with imaplib.IMAP4_SSL(host, port) as client:
        client.login(username, password)
        status, _ = client.select(mailbox)
        if status != "OK":
            raise RuntimeError(f"No fue posible abrir el buzon {mailbox}")
        pending_uids: set[bytes] = set()
        for allowed_address in sorted({allowed_sender.lower(), *allowed_forwarders}):
            status, data = client.uid("search", None, "UNSEEN", "FROM", f'"{allowed_address}"')
            if status != "OK":
                raise RuntimeError("La busqueda IMAP fallo")
            pending_uids.update(data[0].split())
        for uid in sorted(pending_uids, key=int):
            status, fetched = client.uid("fetch", uid, "(RFC822)")
            if status != "OK" or not fetched or not isinstance(fetched[0], tuple):
                continue
            message = email.message_from_bytes(fetched[0][1])
            try:
                results = process_message(message, writer, allowed_sender, allowed_forwarders)
                processed.extend(results)
                client.uid("store", uid, "+FLAGS", "(\\Seen)")
            except Exception as exc:
                print(f"Correo UID {uid.decode()}: {exc}", file=sys.stderr)
    return processed


def main() -> int:
    load_env_file()
    parser = argparse.ArgumentParser(description="Ingesta partes de asistencia SAP FSM hacia Supabase")
    subparsers = parser.add_subparsers(dest="command", required=True)
    parse_command = subparsers.add_parser("parse", help="Extrae un PDF y muestra JSON sin escribir en Supabase")
    parse_command.add_argument("pdf", type=Path)
    ingest_command = subparsers.add_parser("ingest", help="Procesa un PDF local y lo guarda en Supabase")
    ingest_command.add_argument("pdf", type=Path)
    bulk_command = subparsers.add_parser("ingest-directory", help="Recarga todos los PDF de un directorio sin duplicarlos")
    bulk_command.add_argument("directory", type=Path)
    subparsers.add_parser("poll-once", help="Procesa una sola tanda de correos no leidos")
    args = parser.parse_args()

    if args.command == "parse":
        result = parse_pdf(args.pdf, os.getenv("OCR_LANGUAGE", "spa+eng"))
    elif args.command == "ingest":
        result = ingest_pdf(args.pdf, SupabaseWriter())
    elif args.command == "ingest-directory":
        writer = SupabaseWriter()
        successes = []
        failures = []
        for pdf_path in sorted(args.directory.rglob("*.pdf")):
            try:
                successes.append({"file": str(pdf_path), "result": ingest_pdf(pdf_path, writer)})
            except Exception as exc:
                failures.append({"file": str(pdf_path), "error": str(exc)})
        result = {
            "processed": len(successes),
            "failed": len(failures),
            "successes": successes,
            "failures": failures,
        }
    else:
        result = poll_once()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
