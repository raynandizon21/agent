# Telegram personal-account forwarder

Automatically forwards **new incoming messages** from **one chat/person on your
personal Telegram account** to a **destination Telegram group**, using
[Telethon](https://docs.telethon.dev/) (the MTProto user client — **not** the Bot API).

```
PERSON A
   │  (sends you a DM / posts in a chat)
   ▼
Your personal Telegram account  ──►  Telethon listener (this app)
                                        │
                                        ▼
                                  Filter: is chat_id in the allowed source list?
                                        │  yes
                                        ▼
                                  Native forward  (fallback: copy/re-send)
                                        │
                                        ▼
                              Destination group  (DESTINATION_GROUP_ID)
```

### Why a user client and not a bot

Bots **cannot read your personal DMs or arbitrary chats** — they only see updates
for chats they were added to. The source here is *your account*, so the app logs
in as **you** (via Telethon) and does the forwarding from your session. Your
account is already a member of the destination group, so it can post there
directly. **A bot is not required.** The `TELEGRAM_BOT_TOKEN` field in
`.env.example` is optional and unused unless you later add bot-only features on
the destination side. If that token was ever posted publicly, revoke and
regenerate it in [@BotFather](https://t.me/BotFather) before using it.

---

## 1. Prerequisites

* Python **3.10+**
* A Telegram account (the one whose messages you want to forward)
* `API_ID` + `API_HASH` from <https://my.telegram.org> → *API development tools*
  → *Create application*. **Keep `API_HASH` private.**
* Your personal account must be a **member of the destination group**
  (`DESTINATION_GROUP_ID`, e.g. `-5224113996`).

---

## 2. Installation

```bash
# from the project folder
python -m venv .venv

# activate it
source .venv/bin/activate        # Linux / macOS
# .venv\Scripts\Activate.ps1     # Windows PowerShell

pip install -r requirements.txt

cp .env.example .env             # then edit .env
```

Fill in `.env`:

| Variable | Required | Meaning |
|---|---|---|
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | yes | from my.telegram.org |
| `TELEGRAM_PHONE` | no | your number; if empty you'll be asked at first login |
| `SESSION_NAME` | no | session filename (default `user_session`) |
| `DESTINATION_GROUP_ID` | yes | group to forward **into** (pre-filled `-5224113996`) |
| `SOURCE_CHAT_ID` | yes* | the single chat to forward **from** |
| `SOURCE_WHITELIST` | no | extra source ids, comma-separated (merged with `SOURCE_CHAT_ID`) |
| `FORWARD_MODE` | no | `forward` (native, default) or `copy` (re-send, no header) |
| `DISCOVERY_MODE` | no | `true` = log incoming chat ids, forward nothing |
| `LOG_LEVEL` / `LOG_FILE` | no | logging config |
| `RECONNECT_MAX_DELAY` | no | max backoff seconds between reconnect attempts |
| `TELEGRAM_BOT_TOKEN` | no | optional/unused (see above) |

\* not required while `DISCOVERY_MODE=true`.

> Running as part of the parent project? From the repo root you can use
> `npm run setup:forwarder` (one-time login) and then `npm run dev`, which starts
> the API, the web UI **and** this forwarder together. The rest of this README is
> the standalone path.

---

## 3. First login

Run once from a real terminal:

```bash
python main.py --login
```

You will be prompted for:

1. phone number (unless `TELEGRAM_PHONE` is set)
2. the login code Telegram sends you
3. your 2FA password (only if you have two-step verification enabled)

On success a file **`<SESSION_NAME>.session`** is created.

> ### WARNING — the `.session` file
> This file is a **full credential for your Telegram account**. Anyone who copies
> it can act as you without a code or password.
> * It is already in `.gitignore` — never commit it.
> * `chmod 600 user_session.session` on servers; keep the folder non-world-readable.
> * Don't put it in backups/images that others can read.
> * If it leaks: open Telegram → *Settings → Devices → Terminate* that session,
>   then re-run `--login`.
> * The app keeps Telethon logs at `WARNING` and redacts known secrets so the
>   session/credentials are not written to `forwarder.log`.

---

## 4. Finding `SOURCE_CHAT_ID`

You need the numeric id of the chat/person to forward from. Two ways, neither of
which prints your credentials:

**A. List every chat and its id**

```bash
python main.py --list-dialogs
```

```
         CHAT ID  TYPE      NAME
------------------------------------------------------------
       123456789  user      Person A
     -1001987654  channel   Some Channel
      -4567890123  group     Family chat
```

Copy the id of the chat you want into `SOURCE_CHAT_ID`.

**B. Discovery mode** — see ids as messages arrive

```env
DISCOVERY_MODE=true
```

```bash
python main.py
```

Every incoming message is logged like:

```
[DISCOVERY] chat_id=123456789 chat='Person A' sender_id=123456789 sender='persona' text='hey'
```

Note the `chat_id`, then set `DISCOVERY_MODE=false` and put it in `SOURCE_CHAT_ID`.

> Ids: users are positive, small groups look like `-4567890123`, supergroups/
> channels look like `-1001987654321`. Use the value exactly as printed.

---

## 5. Safe test with one chat

1. Create a **private test group**, add your personal account, and put its id in
   `DESTINATION_GROUP_ID` (temporarily).
2. Set `SOURCE_CHAT_ID` to a chat with a friend (or a second account you control).
3. `FORWARD_MODE=forward`, `DISCOVERY_MODE=false`.
4. `python main.py`
5. Have that person send text, a photo, a voice note, a document.
6. Confirm each lands in the test group and the log shows
   `forwarded(native) msg id=...`.
7. Send a message **from your own account** in that chat → it must **not** be
   forwarded (log stays silent).
8. Restart the app → old messages are **not** re-sent (only new ones).
9. Switch `DESTINATION_GROUP_ID` back to the real group.

---

## 6. Running continuously

### Behaviour built in for 24/7 use
* Auto-reconnect on network loss (Telethon + a supervising backoff loop).
* Graceful shutdown on `SIGINT` / `SIGTERM` (clean `disconnect()`).
* Bounded in-memory de-dup of `(chat_id, message_id)`.
* Loop guard: messages in the destination group are never re-forwarded.
* Only `incoming=True` **new** messages are handled; your own messages are skipped.

### Option A — systemd (Linux VPS)

```bash
sudo useradd --system --home /opt/telegram-forwarder --shell /usr/sbin/nologin telegram
sudo mkdir -p /opt/telegram-forwarder
sudo cp -r . /opt/telegram-forwarder/
cd /opt/telegram-forwarder
sudo -u telegram python3 -m venv .venv
sudo -u telegram .venv/bin/pip install -r requirements.txt

# do the interactive login as the service user (creates the .session file)
sudo -u telegram .venv/bin/python main.py --login

sudo chmod 600 /opt/telegram-forwarder/user_session.session
sudo cp deploy/telegram-forwarder.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now telegram-forwarder
journalctl -u telegram-forwarder -f
```

### Option B — Docker

```bash
mkdir -p data
docker compose build

# one-time interactive login — writes data/user_session.session
docker compose run --rm forwarder python main.py --login

# run forever
docker compose up -d
docker compose logs -f
```

`docker-compose.yml` mounts `./data` and points `SESSION_NAME`/`LOG_FILE` there,
so the session and log survive rebuilds. **Guard the `data/` directory** the same
way you would the raw `.session` file.

---

## 7. `FORWARD_MODE` and fallback behaviour

| Mode | What it does | Header |
|---|---|---|
| `forward` (default) | `client.forward_messages()` — identical to pressing **Forward** in the app. Preserves text, photos, videos, documents, audio, voice, stickers natively. | shows *"Forwarded from …"* |
| `copy` | Re-sends the content as a **new** message from your account. | none |

**Fallbacks (only in `forward` mode):**

* **Source chat restricts forwarding** (`ChatForwardsRestrictedError`, i.e.
  "protected content"): native forward is impossible, so the app automatically
  **copies** the message instead (download + re-upload of media, caption/text
  preserved). The result has no "Forwarded from" header.
* **Message id invalid/expired**: same copy fallback.
* **Copy path itself**: first tries to re-send the existing media object by
  reference (no download); if Telegram refuses, it downloads the media to a temp
  file and re-uploads it, then the temp file is deleted.
* **Media that cannot be downloaded at all** (rare — expired/DRM): the app sends
  the text/caption only and logs a warning.

**Known limitations:**

* Albums (grouped media) arrive as separate `NewMessage` events, so in `copy`
  mode they are sent as individual messages rather than one album. Native
  `forward` mode forwards each item and Telegram regroups them.
* Some stickers from private sticker sets may re-send as a static image in `copy`
  mode; `forward` mode keeps them intact.

---

## 8. Logging

```
2026-09-01 12:00:00 | INFO     | forwarder | Logged in as id=... username=...
2026-09-01 12:00:00 | INFO     | forwarder | Forwarding NEW incoming messages: from [123456789] -> -5224113996 (mode=forward)
2026-09-01 12:01:12 | INFO     | forwarder | forwarded(native) msg id=42 from chat_id=123456789
2026-09-01 12:02:03 | WARNING  | forwarder | Native forward blocked (source has protected content) for msg id=43; falling back to copy.
2026-09-01 12:02:05 | INFO     | forwarder | copied(media,upload) msg id=43 -> id=99
```

Console + rotating file (`LOG_FILE`, 5 MB × 3). Known secrets (API hash, phone)
are redacted; Telethon internals are capped at `WARNING`.

---

## 9. File overview

| File | Purpose |
|---|---|
| `main.py` | entry point, CLI flags, auth, reconnect supervisor, graceful shutdown |
| `config.py` | env/`.env` parsing and validation |
| `forwarder.py` | event handler, filtering, de-dup, native forward + copy fallback |
| `logging_setup.py` | console + rotating file logging with secret redaction |
| `.env.example` | template — copy to `.env` |
| `requirements.txt` | `telethon`, `python-dotenv` |
| `Dockerfile`, `docker-compose.yml` | container deployment |
| `deploy/telegram-forwarder.service` | systemd unit |

---

## 10. Legal / ToS note

Automating a personal account ("userbot") is your responsibility under Telegram's
Terms of Service. Only forward content you are allowed to redistribute, and be
mindful that forwarding a private conversation into a group exposes the other
person's messages.
