"""Entry point for the Telegram personal-account forwarder.

Usage:
    python main.py                 # run the forwarder (or discovery mode)
    python main.py --list-dialogs  # print every chat + id, then exit
    python main.py --login         # just authenticate / refresh the session, then exit
"""

from __future__ import annotations

import asyncio
import getpass
import logging
import signal
import sys

from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError

from config import Config
from forwarder import Forwarder
from logging_setup import setup_logging

log = logging.getLogger("main")


def build_client(config: Config) -> TelegramClient:
    return TelegramClient(
        config.session_name,
        config.api_id,
        config.api_hash,
        # Resilience: keep trying to reconnect on network loss.
        connection_retries=None,   # None => retry indefinitely
        retry_delay=5,
        auto_reconnect=True,
        request_retries=5,
    )


async def authenticate(client: TelegramClient, config: Config) -> bool:
    """Ensure the session is authorised. Returns True if usable."""
    if not client.is_connected():
        await client.connect()

    if await client.is_user_authorized():
        return True

    # First-time login (interactive).
    if not sys.stdin.isatty():
        log.error(
            "Not authorised and no interactive terminal available. "
            "Run `python main.py --login` once from a real terminal."
        )
        return False

    phone = config.phone or input(
        "Phone number (international format, e.g. +14155550123): "
    ).strip()
    log.info("Requesting login code ...")
    await client.send_code_request(phone)
    code = input("Login code Telegram just sent you: ").strip()
    try:
        await client.sign_in(phone=phone, code=code)
    except SessionPasswordNeededError:
        password = getpass.getpass("Two-step verification password: ")
        await client.sign_in(password=password)

    log.info("Login OK. Session saved as '%s.session' — keep it secret.", config.session_name)
    return True


async def list_dialogs(client: TelegramClient) -> None:
    print(f"{'CHAT ID':>16}  {'TYPE':<8}  NAME")
    print("-" * 60)
    async for dialog in client.iter_dialogs():
        if dialog.is_user:
            kind = "user"
        elif dialog.is_group:
            kind = "group"
        else:
            kind = "channel"
        print(f"{dialog.id:>16}  {kind:<8}  {dialog.name}")
    print("\nUse one of the CHAT ID values above as SOURCE_CHAT_ID in your .env")


def _install_signal_handlers(stop: asyncio.Event) -> None:
    loop = asyncio.get_running_loop()

    def _request_stop(*_a) -> None:
        if not stop.is_set():
            log.info("Shutdown signal received; finishing up ...")
        stop.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _request_stop)
        except (NotImplementedError, AttributeError):
            # Windows / restricted environments
            signal.signal(sig, _request_stop)


async def _run_forever(client: TelegramClient, config: Config, stop: asyncio.Event) -> None:
    backoff = 5
    while not stop.is_set():
        try:
            if not client.is_connected():
                await client.connect()
            if not await client.is_user_authorized():
                log.error("Session is no longer authorised. Re-run `python main.py --login`.")
                return

            backoff = 5  # healthy connection — reset

            disconnected = asyncio.ensure_future(client.run_until_disconnected())
            stopped = asyncio.ensure_future(stop.wait())
            done, pending = await asyncio.wait(
                {disconnected, stopped}, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()

            if stop.is_set():
                return

            log.warning("Telegram connection dropped; reconnecting in %ss ...", backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, config.reconnect_max_delay)
        except asyncio.CancelledError:
            return
        except Exception:
            log.exception("Error in supervisor loop; retrying in %ss ...", backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, config.reconnect_max_delay)


async def main() -> None:
    config = Config.load()
    setup_logging(config.log_level, config.log_file, secrets=config.secrets)

    args = set(sys.argv[1:])
    client = build_client(config)

    try:
        ok = await authenticate(client, config)
        if not ok:
            sys.exit(1)

        if "--login" in args:
            log.info("Authentication complete.")
            return

        if "--list-dialogs" in args:
            await list_dialogs(client)
            return

        forwarder = Forwarder(client, config)
        await forwarder.start()

        stop = asyncio.Event()
        _install_signal_handlers(stop)

        log.info("Forwarder running. Press Ctrl+C to stop.")
        await _run_forever(client, config, stop)
    finally:
        if client.is_connected():
            await client.disconnect()
        log.info("Disconnected cleanly. Bye.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
