# Agent Telegram Inbox

A dashboard that watches a Telegram bot for junket settlement reports (Win9, Galaxy, Demo Cage), auto-parses them into structured rows, and shows them live in a web UI — no manual copy-pasting into spreadsheets.

```
Telegram (agents send text/photos)
        │
        ▼
  Node/Express API  ──parses──▶  MySQL  ──pushes──▶  WebSocket  ──▶  React UI
  (long-poll or webhook)                                              (live tables)
```

## Contents

- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Database](#database)
- [Settlement parsing](#settlement-parsing)
- [Realtime updates](#realtime-updates)
- [Auth](#auth)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)

## How it works

1. An **agent** messages the Telegram bot — plain text (Win9/Demo Cage reports) or a **photo** of a report (Galaxy — OCR'd with Tesseract, `eng+kor`).
2. The **API server** receives the message (via long-polling or a webhook — see [server/services/telegram.js](server/services/telegram.js)), logs the raw text to `message_logs`, and tries to match the sender's Telegram ID to a registered **agent**.
3. The text is run through [settlementParse.js](server/services/settlementParse.js), which detects the report format and extracts structured fields (account, buy-in, cashout, win/loss, rolling, commission, balance...).
4. If parsed, a row is written/updated in `settlements`.
5. The server **emits an event** on an internal bus; a **WebSocket** layer broadcasts it to every connected browser.
6. The React UI refetches the relevant table the instant it gets the push — **no polling loop**, the page just reacts to what the server tells it changed.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + React Router, plain CSS (no framework), Vite dev server |
| Backend | Node.js (`--watch` for dev reload) + Express 5 |
| Database | MySQL (`mysql2/promise`) |
| Realtime | Raw `ws` WebSocket server, same-origin, JWT-authenticated |
| OCR | `tesseract.js` (`eng+kor` trained data), for photo reports |
| Auth | JWT (`jsonwebtoken`) + bcrypt password hashing |
| Telegram | Bot API — long-polling by default, webhook mode when configured |

## Project structure

```
server/
  index.js              entrypoint: boots Express, DB, telegram service, WebSocket
  db.js                 MySQL pool, env config, truncateTables() helper
  realtime.js            WebSocket server: JWT auth on upgrade, broadcasts events
  middleware/
    auth.js              Express middleware — verifies Bearer JWT
  routes/                 one router per resource, mounted under /api
    authRoutes.js          POST /login, GET /me
    agentRoutes.js          GET/POST /agents  (registered Telegram senders)
    messageRoutes.js        GET /messages, DELETE /messages (clear all)
    settlementRoutes.js     GET /settlements, DELETE /settlements (clear all)
    index.js                 wires routers + public POST /telegram/webhook
  controllers/            request handlers — thin, call into models
  models/                  SQL queries (mysql2 named placeholders)
    messageModel.js
    settlementModel.js      includes the step-by-step upsert logic (see below)
    agentModel.js
    userModel.js
  services/
    telegram.js             long-poll loop / webhook handler, OCR, message intake
    settlementParse.js       regex-based extraction per report format
    events.js                tiny EventEmitter bus (message/settlement events)

src/
  main.jsx                React root, BrowserRouter
  App.jsx                  routes + sidebar shell (auth-gated)
  AuthContext.jsx           login state, token storage, auto-logout on 401
  api.js                    fetch wrapper — attaches Bearer token
  useRealtime.js             WebSocket hook: connect, reconnect w/ backoff, ping
  ConfirmDialog.jsx           reusable in-app confirm modal (replaces window.confirm)
  index.css                   theme tokens + all component styles
  pages/
    LoginPage.jsx
    SettlementsPage.jsx        main table: filters, totals, live status, clear-data
    InboxPage.jsx               raw message log: search, live status, clear-data
    AgentsPage.jsx               register Telegram ID -> agent name mapping

sql/schema.sql            reference schema (server also self-migrates on boot)
scripts/test-parse.mjs    run parser against sample messages for every format
vite.config.js             dev server: proxies /api and /ws to the API port
```

## Database

Four tables (see [sql/schema.sql](sql/schema.sql); `ensureTable()` in each model creates/migrates them automatically on server start):

- **users** — dashboard login (seeded from `ADMIN_USERNAME`/`ADMIN_PASSWORD` on first boot)
- **agents** — maps a Telegram user ID to a display name; messages from unregistered IDs still get logged, just tagged "Unmatched"
- **message_logs** — every inbound Telegram message, raw text, sender, chat ID
- **settlements** — the parsed structured data; `message_id` links back to the source message

`settlements` columns of note:
- `junket` — `win9` | `galaxy` | `democage`
- `status` — `settled` (default, for one-shot Win9/Galaxy reports) or `open` (a Demo Cage game still in progress)
- `step` — last step name for an open/settled Demo Cage row (`start`, `addbuyin`, `cashout`, `end`)
- `balance` — running account balance, when the report includes one

## Settlement parsing

[settlementParse.js](server/services/settlementParse.js) tries three formats in order, first match wins:

1. **Demo Cage** — a *step-by-step* game: `Game Start` → `Additional Buy-in` (repeatable) → `Cashout` → `Game End / Settlement`. Each message reports only what changed. Detected by its step headers (e.g. `Cashout *`); doesn't require the literal words "Demo Cage" since not every message includes that banner.
2. **Galaxy** — one-shot report (usually arrives as a photo, OCR'd). Detected by labels like `ACCOUNT NO.`, `TOTAL BUY-IN`, `GAME NO.`.
3. **Win9** — one-shot report. Detected by Korean labels (어카운트/바이인/캐시아웃/...) **or** an all-English equivalent of the same fields (`Account:`, `Buy-in:`, `Total Cashout:`...). Both bilingual and Korean-only phrasings are supported, since the same bot has sent all three variants in practice.

Every format is pure regex/keyword matching — it's **not** AI-based. It only recognizes labels it has literally been taught; a genuinely new wording needs a new pattern added here. [scripts/test-parse.mjs](scripts/test-parse.mjs) has one fixture per known format/wording — run it after touching the parser to check nothing regressed:

```
node scripts/test-parse.mjs
```

### Demo Cage's step merging

Unlike Win9/Galaxy (`settlementModel.create()` — always a new row), Demo Cage uses `settlementModel.upsertStep()`: it looks up the latest `settlements` row for the same `(junket, account_no, game_no)` and merges the new step's fields into it, rather than inserting a new row per message. A step only updates the fields it actually reports; everything else is left as-is. A `Game Start` after the previous game on that account+number already settled starts a fresh row (a new game reusing the same number); anything else (including a late/duplicate `Game End`) corrects the existing row in place.

## Realtime updates

No client-side polling loop. Flow:

1. `server/services/events.js` — a plain `EventEmitter` (`bus`).
2. Whenever a message is saved or a settlement is created/updated, `telegram.js` calls `bus.emit(...)`.
3. `server/realtime.js` subscribes to the bus and broadcasts `{ type: 'message' | 'settlement', ... }` JSON frames to every open WebSocket.
4. The browser connects same-origin at `/ws?token=<jwt>` (dev: through the Vite proxy to the API port — connecting straight to the API's port is avoided because it collides with a browser-blocked "unsafe port"). See [useRealtime.js](src/useRealtime.js).
5. A page's `useRealtime(onEvent)` hook calls the page's `load()` whenever a relevant event arrives, plus once on (re)connect to catch up on anything missed while offline. A short reconnect backoff handles dropped connections; after a few failed reconnects it probes a REST endpoint once — if that comes back 401, the token expired and the user is logged out automatically instead of spinning forever.

Telegram delivery itself (bot → server) is separate from this and is **not** WebSocket-based — see below.

## Auth

JWT-based. `POST /api/auth/login` returns a token (12h expiry), stored in `localStorage` and sent as `Authorization: Bearer <token>` on every request ([src/api.js](src/api.js)). Any 401 response — REST or a failed WebSocket handshake — clears the token and bounces the user back to `/login` ([AuthContext.jsx](src/AuthContext.jsx)).

## Setup

```bash
npm install
cp .env.example .env      # fill in DB + TELEGRAM_BOT_TOKEN
mysql -u root -p < sql/schema.sql   # optional — the server also self-migrates
npm run dev                # runs API (:6000 by default) + Vite (:6001) together
```

Open `http://localhost:6001`, log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD` (seeded on first boot if no users exist).

### Telegram delivery mode

- **Long-polling** (default) — works anywhere, including localhost/LAN. No public URL needed.
- **Webhook** — set `TELEGRAM_WEBHOOK_URL` to a public HTTPS base URL and the server registers itself with Telegram instead; requires a tunnel (`cloudflared`/`ngrok`) for local dev, or a real domain in production.

## Environment variables

See [.env.example](.env.example) for the full list with comments — DB connection, `JWT_SECRET`, `TELEGRAM_BOT_TOKEN`, optional `TELEGRAM_WEBHOOK_URL`/`TELEGRAM_WEBHOOK_SECRET`, and the seeded admin credentials.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (`--watch`) + Vite dev server, concurrently |
| `npm run dev:api` | API only |
| `npm run dev:web` | Vite only |
| `npm run build` | Production frontend build → `dist/` |
| `npm start` | Run the API server as-is (production) |
| `node scripts/test-parse.mjs` | Print parser output for every known message format |
