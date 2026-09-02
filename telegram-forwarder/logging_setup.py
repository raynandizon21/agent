"""Logging configuration with best-effort secret redaction.

The redactor is defence-in-depth: the app never intentionally logs the API hash,
phone number or session contents, but if a library or a future change ever tries
to, known secrets are replaced with ``***REDACTED***``.
"""

from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler
from typing import Iterable

_FMT = logging.Formatter(
    "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


class _RedactFilter(logging.Filter):
    def __init__(self, secrets: Iterable[str]) -> None:
        super().__init__()
        self._secrets = [s for s in secrets if s and len(s) >= 4]

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:  # pragma: no cover - never let logging crash the app
            return True
        for secret in self._secrets:
            if secret in msg:
                msg = msg.replace(secret, "***REDACTED***")
        record.msg = msg
        record.args = ()
        return True


def setup_logging(
    level: str = "INFO",
    log_file: str | None = None,
    secrets: Iterable[str] = (),
) -> None:
    root = logging.getLogger()
    root.setLevel(level)
    for handler in list(root.handlers):
        root.removeHandler(handler)

    redact = _RedactFilter(secrets)

    stream = logging.StreamHandler(sys.stdout)
    stream.setFormatter(_FMT)
    stream.addFilter(redact)
    root.addHandler(stream)

    if log_file:
        file_handler = RotatingFileHandler(
            log_file, maxBytes=5_000_000, backupCount=3, encoding="utf-8"
        )
        file_handler.setFormatter(_FMT)
        file_handler.addFilter(redact)
        root.addHandler(file_handler)

    # Telethon is chatty at INFO/DEBUG; keep it to warnings so it can't leak
    # connection internals into our logs.
    logging.getLogger("telethon").setLevel(logging.WARNING)
