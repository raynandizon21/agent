"""Configuration loading for the Telegram forwarder.

All settings come from environment variables (optionally via a local .env file).
Nothing sensitive is ever hard-coded here.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

_TRUE = {"1", "true", "yes", "on", "y"}


def _get_int(name: str, default: int | None = None, *, required: bool = False) -> int | None:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        if required:
            raise RuntimeError(f"Missing required environment variable: {name}")
        return default
    try:
        return int(raw.strip())
    except ValueError as exc:  # noqa: TRY003
        raise RuntimeError(f"{name} must be an integer, got: {raw!r}") from exc


def _get_id_list(name: str) -> list[int]:
    raw = os.getenv(name, "") or ""
    ids: list[int] = []
    for part in raw.replace(";", ",").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            ids.append(int(part))
        except ValueError as exc:  # noqa: TRY003
            raise RuntimeError(f"{name} contains a non-integer value: {part!r}") from exc
    return ids


def _get_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in _TRUE


@dataclass
class Config:
    api_id: int
    api_hash: str
    session_name: str
    phone: str | None
    destination_group_id: int
    source_chat_id: int | None
    source_whitelist: list[int]
    forward_mode: str          # "forward" | "copy"
    forward_own: bool          # also forward messages YOU send in the source chats
    discovery_mode: bool
    log_level: str
    log_file: str | None
    reconnect_max_delay: int

    @property
    def allowed_sources(self) -> list[int]:
        """Every chat id we are willing to forward FROM."""
        allowed = list(self.source_whitelist)
        if self.source_chat_id is not None and self.source_chat_id not in allowed:
            allowed.append(self.source_chat_id)
        return allowed

    @property
    def secrets(self) -> list[str]:
        """Strings that must never appear in logs (used by the log redactor)."""
        return [s for s in (self.api_hash, self.phone or "") if s]

    @classmethod
    def load(cls) -> "Config":
        # override=True so edits made while running (e.g. from the dashboard
        # Settings page) are actually picked up on reload.
        load_dotenv(override=True)

        forward_mode = (os.getenv("FORWARD_MODE", "forward") or "forward").strip().lower()
        if forward_mode not in {"forward", "copy"}:
            raise RuntimeError("FORWARD_MODE must be 'forward' or 'copy'")

        cfg = cls(
            api_id=_get_int("TELEGRAM_API_ID", required=True),          # type: ignore[arg-type]
            api_hash=(os.getenv("TELEGRAM_API_HASH") or "").strip(),
            session_name=(os.getenv("SESSION_NAME") or "user_session").strip(),
            phone=((os.getenv("TELEGRAM_PHONE") or "").strip() or None),
            destination_group_id=_get_int("DESTINATION_GROUP_ID", required=True),  # type: ignore[arg-type]
            source_chat_id=_get_int("SOURCE_CHAT_ID"),
            source_whitelist=_get_id_list("SOURCE_WHITELIST"),
            forward_mode=forward_mode,
            forward_own=_get_bool("FORWARD_OWN_MESSAGES", False),
            discovery_mode=_get_bool("DISCOVERY_MODE", False),
            log_level=(os.getenv("LOG_LEVEL") or "INFO").strip().upper(),
            log_file=((os.getenv("LOG_FILE") or "").strip() or None),
            reconnect_max_delay=_get_int("RECONNECT_MAX_DELAY", 60),  # type: ignore[arg-type]
        )
        if not cfg.api_hash:
            raise RuntimeError("Missing required environment variable: TELEGRAM_API_HASH")
        return cfg
