"""Core forwarding logic.

Listens for NEW incoming messages on the personal account, filters them by the
configured source chat(s), and delivers them to the destination group using
Telegram's native forward (preferred) or a copy/re-send fallback.
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from collections import deque

from dotenv import find_dotenv
from telethon import TelegramClient, events
from telethon.errors import FloodWaitError

from config import Config

try:  # error classes differ slightly between Telethon versions
    from telethon.errors import ChatForwardsRestrictedError
except ImportError:  # pragma: no cover
    class ChatForwardsRestrictedError(Exception):  # type: ignore
        ...

try:
    from telethon.errors import MessageIdInvalidError
except ImportError:  # pragma: no cover
    class MessageIdInvalidError(Exception):  # type: ignore
        ...

log = logging.getLogger("forwarder")


class Forwarder:
    def __init__(self, client: TelegramClient, config) -> None:
        self.client = client
        self.config = config
        self._me = None
        # Bounded de-dup memory: (chat_id, message_id) pairs already handled.
        self._seen: deque[tuple[int, int]] = deque(maxlen=5000)
        self._seen_set: set[tuple[int, int]] = set()
        # Active event handler (callback, event-spec) so we can swap it on reload.
        self._handler_cb = None
        self._handler_spec = None
        self._watch_task = None
        self._env_path = find_dotenv(usecwd=True) or os.path.abspath(".env")
        self._env_mtime = self._env_mtime_now()

    # ------------------------------------------------------------------ setup
    async def start(self) -> None:
        self._me = await self.client.get_me()
        log.info("Logged in as id=%s username=%s", self._me.id, self._me.username)

        # Warm the entity cache so source/destination ids resolve reliably
        # (Telethon needs to have "seen" a peer before it can forward to it).
        try:
            await self.client.get_dialogs()
        except Exception:  # pragma: no cover - non-fatal optimisation
            log.warning("Could not pre-load dialogs; entity resolution may be slower.")

        self._register_handler()
        self._watch_task = asyncio.create_task(self._watch_config())

    # ---------------------------------------------------- handler (re)binding
    def _register_handler(self) -> None:
        if self._handler_cb is not None:
            self.client.remove_event_handler(self._handler_cb, self._handler_spec)
            self._handler_cb = self._handler_spec = None

        if self.config.discovery_mode:
            log.warning(
                "DISCOVERY_MODE is ON: incoming messages are logged, nothing is forwarded."
            )
            self._handler_cb = self._on_discovery
            self._handler_spec = events.NewMessage(incoming=True)
        else:
            sources = self.config.allowed_sources
            if not sources:
                raise RuntimeError(
                    "No source configured. Set SOURCE_CHAT_ID (or SOURCE_WHITELIST), "
                    "or enable DISCOVERY_MODE to find the chat id."
                )
            log.info(
                "Forwarding NEW messages: from %s -> %s (mode=%s, own=%s)",
                sources,
                self.config.destination_group_id,
                self.config.forward_mode,
                self.config.forward_own,
            )
            self._handler_cb = self._on_message
            # incoming only by default; both directions when FORWARD_OWN_MESSAGES=true
            self._handler_spec = (
                events.NewMessage(chats=sources)
                if self.config.forward_own
                else events.NewMessage(chats=sources, incoming=True)
            )

        self.client.add_event_handler(self._handler_cb, self._handler_spec)

    # -------------------------------------------------- live config reload
    def _env_mtime_now(self) -> float:
        try:
            return os.path.getmtime(self._env_path)
        except OSError:
            return 0.0

    async def _watch_config(self) -> None:
        """Poll the .env file; re-apply routing settings when it changes."""
        while True:
            await asyncio.sleep(5)
            try:
                mtime = self._env_mtime_now()
                if mtime == self._env_mtime:
                    continue
                self._env_mtime = mtime

                new_cfg = Config.load()
                old_key = (
                    self.config.discovery_mode,
                    tuple(self.config.allowed_sources),
                    self.config.forward_own,
                )
                new_key = (
                    new_cfg.discovery_mode,
                    tuple(new_cfg.allowed_sources),
                    new_cfg.forward_own,
                )
                self.config = new_cfg
                if old_key != new_key:
                    log.info("Config file changed — re-registering handler.")
                    self._register_handler()
                else:
                    log.info(
                        "Config file changed — destination/mode updated (now -> %s, mode=%s).",
                        new_cfg.destination_group_id,
                        new_cfg.forward_mode,
                    )
            except Exception:
                log.exception("Config reload failed; keeping previous settings.")

    # -------------------------------------------------------------- discovery
    async def _on_discovery(self, event) -> None:
        try:
            chat = await event.get_chat()
            sender = await event.get_sender()
        except Exception:  # pragma: no cover
            chat = sender = None
        title = (
            getattr(chat, "title", None)
            or getattr(chat, "first_name", None)
            or getattr(chat, "username", None)
            or "?"
        )
        sender_name = (
            getattr(sender, "username", None)
            or getattr(sender, "first_name", None)
            or "?"
        )
        log.info(
            "[DISCOVERY] chat_id=%s chat=%r sender_id=%s sender=%r text=%r",
            event.chat_id,
            title,
            getattr(sender, "id", None),
            sender_name,
            (event.raw_text or "")[:100],
        )

    # ---------------------------------------------------------------- handler
    async def _on_message(self, event) -> None:
        msg = event.message

        # ignore our own messages unless FORWARD_OWN_MESSAGES=true
        if not self.config.forward_own and (
            event.out or (self._me and msg.sender_id == self._me.id)
        ):
            return
        # loop guard: never re-forward out of the destination
        if event.chat_id == self.config.destination_group_id:
            return
        # duplicate guard
        key = (event.chat_id, msg.id)
        if key in self._seen_set:
            return
        self._remember(key)

        try:
            await self._deliver(event, msg)
        except FloodWaitError as exc:
            log.warning("Flood-wait %ss for msg id=%s; sleeping then retrying once.", exc.seconds, msg.id)
            await asyncio.sleep(exc.seconds + 1)
            try:
                await self._deliver(event, msg)
            except Exception:
                log.exception("Retry after flood-wait failed for msg id=%s", msg.id)
        except Exception:
            log.exception(
                "Failed to deliver msg id=%s from chat_id=%s", msg.id, event.chat_id
            )

    def _remember(self, key: tuple[int, int]) -> None:
        if len(self._seen) == self._seen.maxlen:
            self._seen_set.discard(self._seen[0])
        self._seen.append(key)
        self._seen_set.add(key)

    # ---------------------------------------------------------------- deliver
    async def _deliver(self, event, msg) -> None:
        dest = self.config.destination_group_id

        if self.config.forward_mode == "forward":
            try:
                await self.client.forward_messages(dest, msg)
                log.info(
                    "forwarded(native) msg id=%s from chat_id=%s", msg.id, event.chat_id
                )
                return
            except ChatForwardsRestrictedError:
                log.warning(
                    "Native forward blocked (source has protected content) for msg id=%s; "
                    "falling back to copy.",
                    msg.id,
                )
            except MessageIdInvalidError:
                log.warning(
                    "Native forward rejected msg id=%s (invalid/expired); falling back to copy.",
                    msg.id,
                )

        await self._copy(event, msg, dest)

    async def _copy(self, event, msg, dest) -> None:
        """Re-create the message as a new message in the destination.

        Used when FORWARD_MODE=copy, or as a fallback when native forwarding is
        impossible (e.g. the source chat restricts forwarding). Media is first
        re-sent by reference; if Telegram refuses, it is downloaded and
        re-uploaded so photos / videos / documents / audio / voice / stickers
        are preserved. Text and captions are always kept.
        """
        text = msg.text or ""

        if msg.media is None:
            if text:
                await self.client.send_message(dest, text)
                log.info("copied(text) msg id=%s from chat_id=%s", msg.id, event.chat_id)
            else:
                log.info("skipped msg id=%s (no text, no media)", msg.id)
            return

        send_kwargs = dict(
            caption=text or None,
            voice_note=bool(getattr(msg, "voice", False)),
            video_note=bool(getattr(msg, "video_note", False)),
        )

        # Fast path: hand Telegram the existing media object (no download).
        try:
            sent = await self.client.send_file(dest, msg.media, **send_kwargs)
            log.info("copied(media,ref) msg id=%s -> id=%s", msg.id, getattr(sent, "id", "?"))
            return
        except Exception as exc:  # broad on purpose: many media types, fall through
            log.debug("ref re-send failed for msg id=%s (%s); downloading.", msg.id, exc)

        # Reliable path: download to a temp file, then re-upload.
        with tempfile.TemporaryDirectory(prefix="tg-fwd-") as tmp:
            path = await self.client.download_media(msg, file=tmp)
            if not path:
                log.warning(
                    "Could not download media for msg id=%s; sending caption/text only.", msg.id
                )
                if text:
                    await self.client.send_message(dest, text)
                return
            sent = await self.client.send_file(dest, path, **send_kwargs)
            log.info("copied(media,upload) msg id=%s -> id=%s", msg.id, getattr(sent, "id", "?"))
