---
name: architecture
description: Explains this repo's system architecture (Agent Telegram Inbox) — how messages get in, how they're parsed and stored, realtime delivery, and known operational gotchas. Load before making changes to message intake, ingestion, settlement parsing, or the Telegram integration.
---

# Agent Telegram Inbox — architecture

A dashboard that watches Telegram for junket settlement reports (Win9, Galaxy,
Demo Cage, Infinity Cage), auto-parses them into structured rows, and shows
them live in a web UI.

```
Telegram (agents send text/photos)
        │
        ▼
  Node/Express API  ──parses──▶  MySQL  ──pushes──▶  WebSocket  ──▶  React UI
  (long-poll or webhook)                                              (live tables)
```

## The two ways a message gets in

Both converge on one shared function: `ingestMessage()` in
[server/services/ingest.js](../../../server/services/ingest.js). Nothing
downstream (parsing, storage, realtime push) needs to know which path a
message came from. **Both need only `TELEGRAM_BOT_TOKEN`** — this project
deliberately has no `api_id`/`api_hash`/2FA/MTProto dependency anywhere (an
earlier Telethon-based "read the owner's personal account directly" path was
removed — see History below).

### 1. Bot API — direct message to the system bot (the default, always prefer this)
[server/services/telegram.js](../../../server/services/telegram.js)
`saveIncomingMessage()`. Long-polls `getUpdates` (default) or receives a
webhook at `POST /api/telegram/webhook`. Catches anything sent directly to
the bot (`t.me/<botname>`) or posted in a group/channel the bot is a member
of (needs privacy mode off via @BotFather for group visibility).

Also handles `/start` → auto-registers the sender as an `agent`
(`handleStartCommand`), and OCR (`tesseract.js`, `eng+kor`) for photo
reports via `resolveMessageText()`.

### 2. Telegram Business — messages to the *account owner's personal chat*
Same file, `saveIncomingBusinessMessage()`, triggered by `business_message`
updates. Requires the account owner to have **Telegram Premium** and connect
the bot under Settings → Telegram Business → Chatbots. Still bot-token only.
`getBusinessOwnerId()` resolves (and caches) the connection's owner id from
`business_connection` updates (or `getBusinessConnection` as a fallback after
a restart) so the owner's own outgoing messages aren't logged as inbound data.
Confirmed working end-to-end (2026-09-14): connecting logs
`business connection enabled (owner=<telegram id>, id=<connection id>)`, and
a message from a third party to that personal chat lands in `message_logs`
the same as a direct bot message.

**One-time BotFather prerequisite, not a Bot API setting — nothing in this
codebase controls it:** `/mybots` → the bot → **Bot Settings** → **Secretary
Mode** → turn on. Until that's flipped, Telegram's own Settings → Telegram
Business → Chatbots screen refuses to add the bot at all, with *"This bot
doesn't support Secretary Mode yet."* Easy to lose an hour to if you don't
know this exists — it looks like a code/permissions problem but it's purely
a toggle on the bot's BotFather-side settings the owner must set once.

**Hard platform limitation, not a config issue:** Telegram never delivers a
message from *another bot* through a Business connection — only 1:1 chats
with real users. A chatbot that DMs the account owner will never reach the
system this way, Premium or not. There is currently **no automated path**
for that case (see History) — the fallback is redirecting that source to
message the bot directly (path 1), or a manual forward.

## Shared ingestion core

[server/services/ingest.js](../../../server/services/ingest.js)
`ingestMessage({ text, chatId, userId, username, messageId })`:
1. Matches `userId` to a registered `agents` row (`agentModel.findActiveIdByTelegramId`).
2. Inserts into `message_logs` via `messageModel.createIncoming()` —
   **idempotent**: a unique key on `(telegram_chat_id, telegram_message_id)`
   makes re-delivery of the same Telegram update a no-op (see Gotchas below)
   instead of a duplicate row.
3. Runs [settlementParse.js](../../../server/services/settlementParse.js)
   (pure regex/keyword matching, **not AI**) — tries Demo Cage (step-by-step:
   start → buy-in → cashout → end, merged via `settlementModel.upsertStep()`
   keyed on `(junket, account_no, game_no)`), then Galaxy, then Win9, in
   that order, first match wins.
4. Emits `Events.MESSAGE` / `Events.SETTLEMENT` on the in-process bus
   ([server/services/events.js](../../../server/services/events.js)),
   which `server/realtime.js` broadcasts over WebSocket to every connected
   browser — no client polling.

A genuinely new report wording needs a new pattern added to
`settlementParse.js`; run `node scripts/test-parse.mjs` after touching it.

## Database (MySQL, self-migrating)
Four tables — `users`, `agents`, `message_logs`, `settlements`. Reference DDL
in [sql/schema.sql](../../../sql/schema.sql); each model's `ensureTable()`
(called from `server/index.js` `main()`) creates/migrates on every boot via
`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN` / `ADD UNIQUE KEY`, each guarded
against its "already applied" MySQL error code. Follow this same pattern for
future schema changes rather than hand-editing production tables.

`agents` — maps a Telegram id to a name; `is_active` supports deactivating
without losing history (FKs from `message_logs`/`settlements` are
`ON DELETE SET NULL`, so hard-deleting an agent is also safe). Managed from
the **Agents** page — full CRUD (add, edit, deactivate/reactivate, delete).
Admin-only (`requireAdmin`). (A `role` sender/receiver column existed
briefly — dropped, it never had any behavior attached to it.)

`users` (dashboard logins) — `agent_id` (nullable, no FK constraint) links a
login to one `agents` row: `NULL` = **admin**, sees every agent's data and is
the only role allowed to reach Agents/Users or clear data; set = **scoped**,
`messageModel.list()`/`settlementModel.list()` add `WHERE agent_id = :agentId`
so that login only ever sees its own agent's rows. Enforced by
`requireAdmin` in [server/middleware/auth.js](../../../server/middleware/auth.js),
applied per-route (`agentRoutes.js`, `userRoutes.js`, and the `DELETE` routes
on `messageRoutes.js`/`settlementRoutes.js`). `userController.js` refuses to
delete or re-scope the last remaining admin login and refuses to delete the
login you're currently using — don't remove those guards, they're the only
thing preventing a total lockout. Managed from the **Users** page.

## Operational gotchas (hit these for real — read before debugging similar symptoms)

- **Duplicate message_logs/settlements rows.** `telegram.js`'s long-poll
  `offset` is an in-memory variable, not persisted. If the process restarts
  (e.g. `node --watch` picking up a file change) between fetching an update
  and confirming the next offset, Telegram redelivers the same update and it
  gets processed twice. Fixed at the data layer — `messageModel.ensureTable()`
  adds a `UNIQUE KEY (telegram_chat_id, telegram_message_id)`, and
  `createIncoming()` catches `ER_DUP_ENTRY` and returns the existing row
  instead of inserting again; `ingestMessage()` skips settlement
  parsing/event emission when `duplicate: true`. If you ever see doubled
  rows again, check for a second live instance (next point) before assuming
  this guard regressed.

- **`Conflict: terminated by other getUpdates request`.** Telegram's
  `getUpdates` allows exactly one long-poll consumer per bot token. This
  error means **two server instances are running simultaneously** — easy to
  do accidentally: a `node --watch server/index.js` from an earlier terminal
  session left running, plus a freshly started `npm run dev`. Find every
  instance with:
  ```powershell
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like '*server/index.js*' } |
    Select-Object ProcessId, CreationDate, CommandLine
  ```
  and stop all but one. `node --watch`'s restart-on-file-change does **not**
  guarantee the previous process is gone before the new one starts polling,
  and a background task started via a tool is a separate OS process tree
  from a pre-existing terminal's `npm run dev` — killing one doesn't affect
  the other.

- **XAMPP MySQL isn't a Windows service here** — no `mysqld`/`MySQL80`
  service is registered. Start it with
  `cmd //c "C:\xampp\mysql_start.bat"` (run in background; it blocks the
  foreground). `server/index.js` calls `pool.query('SELECT 1')` before
  anything else and `process.exit(1)`s if that fails, so "API won't start"
  first symptom is almost always "MySQL isn't running."

## History — the Telethon/SINK path that was removed

An earlier version of this project also had a `telegram-forwarder/` Python
app (Telethon/MTProto) that logged in **as the account owner** to read
*any* message landing in their personal account — including ones sent by
another bot, which Bot API / Business can never see (see path 2's
limitation above). It POSTed matches to `POST /api/ingest`. That's the only
approach that can ever cover the "another bot DMs the owner directly"
case — it genuinely requires `TELEGRAM_API_ID`/`TELEGRAM_API_HASH` (free,
one-time from my.telegram.org) and an interactive login (phone code + 2FA
if enabled; a `.session` file persists it after that).

It was deliberately removed at the owner's request (no `api_id`/`api_hash`/
2FA in this project, full stop) — `telegram-forwarder/`,
`forwarderController.js`, `forwarderConfig.js`, `forwarderRoutes.js`,
`ingestController.js` (the `/api/ingest` HTTP wrapper — `ingest.js` itself,
the shared core, stayed), `SettingsPage.jsx`, `scripts/run-forwarder.mjs`,
`scripts/setup-forwarder.mjs`, and `INGEST_SECRET` are all gone. If a future
need re-opens this tradeoff, this history is the reference for how it
worked — don't rebuild it without the owner explicitly asking again.

## Key files map
```
server/
  index.js                    boot: DB check, ensureTable() x4, admin seed, startTelegram(), listen
  db.js                       mysql2 pool, env config
  realtime.js                 WebSocket: JWT auth, broadcasts bus events
  middleware/auth.js           authMiddleware (JWT) + requireAdmin (agentId must be null)
  routes/index.js              mounts /telegram/webhook (public), then auth-gated routers
  controllers/                request handlers — thin, call into models
  services/
    telegram.js                 Bot API: long-poll/webhook, OCR, /start, business_message handling
    ingest.js                   shared ingest core (see above) — the one place both paths meet
    settlementParse.js          regex extraction per report format
    events.js                   EventEmitter bus (message/settlement)
  models/
    messageModel.js             message_logs CRUD + the dedup unique-key migration + agentId filter
    settlementModel.js          settlements CRUD, step-merge upsert, ensureTable()/ensureColumn(), agentId filter
    agentModel.js                agents CRUD (name/telegram_id/is_active)
    userModel.js                 dashboard logins CRUD, agent_id link, countAdmins() safety check

src/pages/
  AgentsPage.jsx                 chat-id maintenance: add/edit/deactivate/delete, sender vs receiver
  UsersPage.jsx                   logins: create, scope to an agent, reset password, delete — admin-only

sql/schema.sql                 reference DDL (server also self-migrates on boot)
scripts/test-parse.mjs         parser fixtures — run after touching settlementParse.js
```
