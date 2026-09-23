# CLAUDE.md

Project-specific notes for Claude Code. See [README.md](README.md) for the full architecture writeup — this file is for things worth surfacing every session.

## Guests page — custom commission modes (display-only)

A guest's linked junket account (`guest_junkets.commission_rate` / `commission_percent`) can override how commission is *shown* on the Guests page, via two independent, optional fields in [GuestsPage.jsx](src/pages/GuestsPage.jsx)'s `JunketPicker` and the badge inline editor — **Rolling %** and **Com %**. Either can be set alone, or both together (hybrid).

**Both fields are 100% display-only.** Neither is ever written back to `settlements` — the real settlements data, the Settlements page, the "Original data" modal, and any exports always show exactly what the junket itself reported, untouched. This was a deliberate reversal of an earlier design (`recomputeCommission()`/`recomputeForJunkets()`) that used to overwrite the real stored `settlements.COMMISSION` when Com % was set — that write path was removed because it silently desynced the Settlements page from the source-of-truth junket reports. If you ever see `recomputeCommission` or `recomputeForJunkets` referenced anywhere, that's stale — those functions were deleted.

Computed per row in `effectiveRow()` / `customRate()` (search those names in GuestsPage.jsx):

- **Com % alone** (`commission_rate`): `ROLLING (shown) = real ROLLING` (unchanged), `COMMISSION (shown) = real ROLLING × Com% / 100`. RATE shows Com%.
- **Rolling % alone** (`commission_percent`): `ROLLING (shown) = real ROLLING × Rolling% / 100`, `COMMISSION (shown) = ROLLING(shown) × original game rate / 100`. RATE shows the original game rate.
- **Both set (hybrid)**: `ROLLING (shown) = real ROLLING × Rolling% / 100`, `COMMISSION (shown) = ROLLING(shown) × Com% / 100`. RATE shows Com%.

The **"Original data"** modal always bypasses all of the above — every column there is the untouched value from the junket's own raw report.

**Verified examples** (INF555, real ROLLING = 3,225,000, original game rate = 1.45%):
- **Com** @ 1.2% (alone) → RATE `1.20%`, COMMISSION = `3,225,000 × 1.2 / 100` = **38,700** (display only — real stored commission is untouched).
- **Rolling** @ 50% (alone) → ROLLING `1,612,500`, RATE `1.45%` (original), COMMISSION = `1,612,500 × 1.45 / 100` = **23,381**.
- **Hybrid**: Rolling 50% + Com 1.2% → ROLLING `1,612,500`, RATE `1.20%`, COMMISSION = `1,612,500 × 1.2 / 100` = **19,350**.

**When touching this logic:** verify with concrete numbers (pick a row, compute by hand) before changing the formula. Also: never reintroduce a write path from `guest_junkets` back into `settlements` — that's the exact bug this design fixed (a stale test `commission_rate` on one guest silently changed that account's real COMMISSION and desynced the Settlements page's grand total from the source reports until it was caught and reverted).
