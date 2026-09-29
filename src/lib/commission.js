// Display-only custom commission modes for a guest's linked junket account —
// see CLAUDE.md's "custom commission modes" section. Shared by the Guests
// page and the Trips detail screen so both show the same numbers. Nothing
// here is ever written back to `settlements`.
//
// `r` is a settlement row with `rolling`, `commission` and `game_rate` (the
// junket's original rate); `entry` is the matching guest_junkets link
// ({ commission_rate, commission_percent }) or undefined.
//
// Rolling % always discounts ROLLING; the rate multiplied against that
// discounted ROLLING is the custom Com % when set, else the original game
// rate. Com % alone keeps ROLLING unchanged and shows ROLLING × Com%.
export function effectiveCommission(r, entry) {
  if (entry?.commission_percent != null) {
    const rolling =
      r.rolling != null ? Math.round((Number(r.rolling) * entry.commission_percent) / 100) : null;
    const rate = entry.commission_rate ?? r.game_rate;
    const commission = rolling != null && rate != null ? Math.round((rolling * rate) / 100) : null;
    return { rolling, commission };
  }
  if (entry?.commission_rate != null) {
    const commission =
      r.rolling != null ? Math.round((Number(r.rolling) * entry.commission_rate) / 100) : null;
    return { rolling: r.rolling, commission };
  }
  return { rolling: r.rolling, commission: r.commission };
}

// The RATE shown next to effectiveCommission() — kept in sync with it so
// RATE × ROLLING / 100 = COMMISSION reads correctly. null = no custom mode
// (callers fall back to the original game rate).
export function effectiveRate(r, entry) {
  if (entry?.commission_percent != null) return entry.commission_rate ?? r.game_rate;
  if (entry?.commission_rate != null) return entry.commission_rate;
  return null;
}
