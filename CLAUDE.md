# CLAUDE.md

Project-specific notes for Claude Code. See [README.md](README.md) for the full architecture writeup — this file is for things worth surfacing every session.

## Guests page — custom commission modes

A guest's linked junket account (`guest_junkets.commission_rate` / `commission_percent`) can override the junket's own commission via two independent, optional fields in [GuestsPage.jsx](src/pages/GuestsPage.jsx)'s `JunketPicker` and the badge inline editor — **Rolling %** and **Com %**. Either can be set alone, or both together (hybrid):

- **Com % alone** (`commission_rate`) — a straight rate on the *real* ROLLING, applied for real. Saving it runs `settlementModel.recomputeCommission()`, which **overwrites the stored** `settlements.COMMISSION` for every row on that account: `COMMISSION = ROLLING × rate / 100`. The Guests page just reads this back — no extra display math, real ROLLING shown unchanged.

- **Rolling % alone** (`commission_percent`) — **display-only**, never writes to the database (so it can't affect the Settlements page or other guests on the same account). Computed per row in `effectiveRow()` ([GuestsPage.jsx](src/pages/GuestsPage.jsx), search `function effectiveRow`):
  ```
  ROLLING (shown)    = real ROLLING × Rolling% / 100
  COMMISSION (shown) = ROLLING (shown) × original game rate / 100
  ```
  RATE shows the **original** junket rate in this case (not the Rolling %), so `RATE × ROLLING(shown) / 100` reconciles to COMMISSION.

- **Both set (hybrid)** — Rolling % still discounts ROLLING for display; Com % becomes the rate multiplied against that *discounted* ROLLING instead of the original game rate, for COMMISSION and RATE display:
  ```
  ROLLING (shown)    = real ROLLING × Rolling% / 100
  COMMISSION (shown) = ROLLING (shown) × Com% / 100
  RATE (shown)        = Com%
  ```
  Com % **still separately recomputes the real stored COMMISSION** the normal way (`real ROLLING × Com% / 100`, not the discounted one) — that write path doesn't know or care whether Rolling % is also set. So in hybrid mode, the DB's real commission and the Guests-page-displayed commission are deliberately two different numbers computed two different ways; that's expected, not a bug.

The **"Original data"** modal always bypasses all of this — every column there is the untouched value from the junket's own raw report.

`customRate()` (same file, search `function customRate`) picks the RATE column value to match whichever formula above is in play: Com % if set (hybrid or Com-alone), else the original game rate (Rolling-alone), else null.

**Verified examples** (INF555, real ROLLING = 3,225,000, original game rate = 1.45%):
- **Com** @ 1.2% (alone) → RATE `1.20%`, COMMISSION = `3,225,000 × 1.2 / 100` = **38,700** (= the real stored value).
- **Rolling** @ 50% (alone) → ROLLING `1,612,500`, RATE `1.45%` (original), COMMISSION = `1,612,500 × 1.45 / 100` = **23,381**.
- **Hybrid**: Rolling 50% + Com 1.2% → ROLLING `1,612,500`, RATE `1.20%`, COMMISSION = `1,612,500 × 1.2 / 100` = **19,350** (display only — the real stored commission is still 38,700 from the Com % write path above).

**When touching this logic:** verify with concrete numbers (pick a row, compute by hand) before changing the formula — this area has had more than one wrong-on-first-try implementation because "recompute the commission" is ambiguous between "recompute against the discounted rolling" vs "recompute against the original rolling," and between using the custom percent vs the original rate as the multiplier.
