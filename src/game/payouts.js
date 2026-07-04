// Pure pay table data for the 200-jackpot Jokeri Pokeri variant.
// Ordered highest-to-lowest as shown on the machine. `payout` is per credit bet.
// `display` is the on-screen wording from the reference photos; `name` remains
// the prose name used by game logic and win effects.
export const PAYTABLE = [
  { key: 'royal_flush',     name: 'Royal flush',     display: 'Royal flush',     payout: 200 },
  { key: 'five_of_a_kind',  name: 'Five of a kind',  display: 'Five-of-a-kind',  payout: 100 },
  { key: 'straight_flush',  name: 'Straight flush',  display: 'Straight flush',  payout: 40 },
  { key: 'four_of_a_kind',  name: 'Four of a kind',  display: 'Four-of-a-kind',  payout: 15 },
  { key: 'full_house',      name: 'Full house',      display: 'Full house',      payout: 7 },
  { key: 'flush',           name: 'Flush',           display: 'Flush',           payout: 4 },
  { key: 'straight',        name: 'Straight',        display: 'Straight',        payout: 3 },
  { key: 'three_of_a_kind', name: 'Three of a kind', display: 'Three-of-a-kind', payout: 2 },
  { key: 'two_pairs',       name: 'Two pairs',       display: 'Two pairs',       payout: 2 },
];

export const ROYAL_PAYOUT = 200;

export function payoutFor(key) {
  const entry = PAYTABLE.find(p => p.key === key);
  return entry ? entry.payout : 0;
}

export function nameFor(key) {
  const entry = PAYTABLE.find(p => p.key === key);
  return entry ? entry.name : 'High card';
}
