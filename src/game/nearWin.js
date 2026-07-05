import HandEvaluator from './HandEvaluator.js';
import { payoutFor } from './payouts.js';

// Near-win detection for the draw-phase suspense reveal. Pure module (no
// three.js / DOM) so `node --test` can import it.

const SUITS = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Best payout already locked in by this (possibly partial, 1-5 card) set,
// whatever the still-hidden cards turn out to be. A full hand defers to
// HandEvaluator; with fewer cards only count-based hands (two pairs /
// three-plus of a kind) are locked in — straights and flushes need all
// five. The single joker is wild: it always pairs up the largest group.
function lockedInPayout(cards) {
  const simple = cards.map(c => ({ value: c.value, suit: c.suit }));
  if (simple.length >= 5) return HandEvaluator.evaluate(simple).payout;

  const jokers = simple.filter(c => c.value === 'Joker').length;
  const counts = {};
  for (const c of simple) {
    if (c.value !== 'Joker') counts[c.value] = (counts[c.value] || 0) + 1;
  }
  const sorted = Object.values(counts).sort((a, b) => b - a);
  const c0 = (sorted[0] || 0) + jokers;
  const c1 = sorted[1] || 0;
  if (c0 >= 5) return payoutFor('five_of_a_kind');
  if (c0 >= 4) return payoutFor('four_of_a_kind');
  if (c0 >= 3) return payoutFor('three_of_a_kind');
  if (c0 >= 2 && c1 >= 2) return payoutFor('two_pairs');
  return 0;
}

// Do these cards already guarantee a payout of at least minPayout
// (a per-bet multiplier from the pay table)?
export function isPaying(cards, minPayout = 1) {
  return lockedInPayout(cards) >= minPayout;
}

// True when the known cards don't reach minPayout yet but some single card
// would lift them to it — the "one card from a win" tease.
export function isOneCardAway(cards, minPayout = 1) {
  if (cards.length === 0 || cards.length >= 5) return false;
  if (isPaying(cards, minPayout)) return false;
  for (const value of RANKS) {
    for (const suit of SUITS) {
      if (isPaying(cards.concat([{ value, suit }]), minPayout)) return true;
    }
  }
  return isPaying(cards.concat([{ value: 'Joker', suit: 'Special' }]), minPayout);
}
