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
   (pure regex/keyword matching, **not AI**) — tries, in order: Infinity Cage
   (step-based, keyed on `(junket, account_no, game_no)`), Demo Cage's
   step sequence (start → buy-in → cashout → end, same keying), Demo Cage's
   standalone account-transaction messages (deposit/withdrawal, see below),
   Galaxy, then Win9. First match wins.
4. Emits `Events.MESSAGE` / `Events.SETTLEMENT` on the in-process bus
   ([server/services/events.js](../../../server/services/events.js)),
   which `server/realtime.js` broadcasts over WebSocket to every connected
   browser — no client polling.

A genuinely new report wording needs a new pattern added to
`settlementParse.js`; run `node scripts/test-parse.mjs` after touching it.

### Demo Cage has two unrelated message shapes

Don't assume every Demo Cage message is a step in a game — it sends two
structurally different kinds, both handled in `settlementParse.js`:

1. **Game steps** (`parseDemoCage`/`demoCageStep`) — `Game Start *` →
   `Additional Buy-in *` → `Cashout *` → `Game End / Settlement *`, English
   labels, always carries a `Game #:`. Merged into one row per game via
   `settlementModel.upsertStep()`, same as Infinity Cage's steps.
2. **Account transactions** (`parseDemoCageTransaction`) — `* 어카운트 입금 *`
   (deposit) / `* 어카운트 출금 *` (withdrawal), Korean labels (계정/금액/잔고/
   날짜/시간), **no** `Game #:` at all. Each message is a complete, standalone
   event — 입금 → `buy_in`, 출금 → `cashout`, 잔고 → `balance` — so it has no
   `step` key and `ingest.js` inserts a fresh row per message via
   `settlementModel.create()` instead of merging. Added 2026-09-18 after a
   report that these messages landed in `message_logs` but never produced a
   settlements row — the older step parser doesn't recognize this shape
   (no step header, no game #), and Win9's parser almost swallows it (its
   "looks like Win9" check matches on the bare word "어카운트") but bails
   since there are no buy-in/cashout/rolling amounts to find.

## Database (MySQL, self-migrating)
Seven tables — `users`, `agents`, `guests`, `guest_junkets`, `bot_config`,
`message_logs`, `settlements`. Reference DDL in
[sql/schema.sql](../../../sql/schema.sql); each model's `ensureTable()`
(called from `server/index.js` `main()`) creates/migrates on every boot via
`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN` / `ADD UNIQUE KEY`, each guarded
against its "already applied" MySQL error code. Follow this same pattern for
future schema changes rather than hand-editing production tables. Every
table uses `IDNo` as an `AUTO_INCREMENT PRIMARY KEY` — this org's DB
convention, followed even for pure join tables like `guest_junkets` (which
enforces its one-row-per-pair rule with a `UNIQUE KEY` instead of making
that pair the primary key). Note for any future composite-key migration on
a table with a live FK: `DROP PRIMARY KEY` and `ADD COLUMN ... PRIMARY KEY`
must be one single `ALTER TABLE` with multiple clauses — doing them as
separate statements briefly leaves the FK'd column with no index at all,
which InnoDB rejects with errno 150.

`bot_config` — singleton row (`IDNo=1`) holding the live `BOT_TOKEN`. Edited
from the **Telegram** page; saves apply immediately, no server restart
needed (`server/services/telegram.js` re-reads it rather than caching the
`.env` value past boot).

`guests` — a player/guest directory independent of `agents` (an agent is a
staff member who *sends* reports; a guest is a player who *appears in* them).
Plain fields: `guest_code`, `guest_name`, optional `telegram_id`, `active`,
plus `encoded_by`/`encoded_dt`/`edited_by`/`edited_dt` audit columns set
server-side from `req.user.username` in
[guestController.js](../../../server/controllers/guestController.js).
Managed from the **Guests** page, admin-only (`guestRoutes.js` gates the
whole router with `requireAdmin`).

`guest_junkets` — many-to-many: one guest can play across several junkets
(confirmed 2026-09-18 — a guest is *not* scoped to one junket), so this is a
join table (`GUEST_ID`, `JUNKET`, unique on the pair) rather than a column on
`guests`. Its `ACCOUNT_NO` optionally links a (guest, junket) pair to that
junket's *real* account number/name — sourced from already-parsed
`settlements` rows via `GET /api/settlements/accounts?junket=X`
(`settlementModel.listAccounts()`, admin-only, returns one row per
`ACCOUNT_NO` using its most recent `PLAYER_NAME`), not typed freehand. The
**Guests** page's junket checkboxes reveal a `<select>` populated from that
endpoint when checked. `guestModel.listAll()` fetches `guests` and
`guest_junkets` as two separate queries and merges them in JS (rather than
one `GROUP_CONCAT`'d query) specifically so `ACCOUNT_NO` — which can contain
arbitrary characters — never has to be split back out of a delimited string.

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
  session left running, plus a freshly started `npm run dev`. A newer,
  friendlier symptom of the same root cause: the second instance now fails
  fast with `Failed to start server: port 6000 is already in use... Refusing
  to start a second Telegram poller alongside it` instead of silently
  double-polling.

  **Don't misread a `--watch` parent/child pair as two instances.**
  `node --watch server/index.js` does not restart in place — it stays alive
  as a supervisor and *spawns a child* `node server/index.js` to actually
  run the app, killing/respawning only that child on file changes. So one
  healthy dev server legitimately shows up as **two** processes. Check
  `ParentProcessId` before killing anything:
  ```powershell
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like '*server/index.js*' } |
    Select-Object ProcessId, ParentProcessId, CommandLine
  ```
  A legitimate pair: one `node --watch server/index.js` whose `ProcessId`
  equals the *other* row's `ParentProcessId`. An actual duplicate: a
  **second** `node --watch server/index.js` (or a plain `node
  server/index.js` / `npm start`) whose parent is a *different* shell —
  trace it with
  `Get-CimInstance Win32_Process -Filter "ProcessId=<ParentProcessId>"`
  to confirm before stopping it. Only stop the extra tree, never the one
  child whose watcher parent you want to keep running. Also worth
  remembering: `node --watch`'s restart-on-file-change does not guarantee
  the previous child is gone before a new one starts, and a background task
  started via a tool is a separate OS process tree from a pre-existing
  terminal's `npm run dev` — killing one doesn't affect the other.

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
  index.js                    boot: DB check, ensureTable() x6 (agents, guests, bot_config, users, message_logs, settlements), admin seed, startTelegram(), listen
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
    settlementModel.js          settlements CRUD, step-merge upsert, listAccounts() (per-junket distinct accounts, powers Guests linking), ensureTable()/ensureColumn(), agentId filter
    agentModel.js                agents CRUD (name/telegram_id/is_active)
    userModel.js                 dashboard logins CRUD, agent_id link, countAdmins() safety check
    guestModel.js                 guests CRUD + guest_junkets many-to-many (setJunkets), ensureTable() incl. the composite->IDNo PK migration
    botConfigModel.js             singleton bot_config row (BOT_TOKEN), read live by telegram.js on every poll

src/pages/
  AgentsPage.jsx                 chat-id maintenance: add/edit/deactivate/delete, sender vs receiver
  UsersPage.jsx                   logins: create, scope to an agent, reset password, delete — admin-only
  GuestsPage.jsx                  guest directory + JunketPicker (checkbox reveals a <select> of real accounts per junket, from GET /settlements/accounts)

sql/schema.sql                 reference DDL (server also self-migrates on boot)
scripts/test-parse.mjs         parser fixtures — run after touching settlementParse.js
```
