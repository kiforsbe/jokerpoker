import HandEvaluator from './HandEvaluator.js';

// Near-win detection for the draw-phase suspense reveal. Pure module (no
// three.js / DOM) so `node --test` can import it.

const SUITS = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Does this (possibly partial, 1-5 card) set already contain a paying
// combination, whatever the still-hidden cards turn out to be? A full hand
// defers to HandEvaluator; with fewer cards only count-based hands (two
// pairs / three-plus of a kind) are locked in — straights and flushes need
// all five. The single joker is wild: it always pairs up the largest group.
export function isPaying(cards) {
  const simple = cards.map(c => ({ value: c.value, suit: c.suit }));
  if (simple.length >= 5) return HandEvaluator.evaluate(simple).payout > 0;

  const jokers = simple.filter(c => c.value === 'Joker').length;
  const counts = {};
  for (const c of simple) {
    if (c.value !== 'Joker') counts[c.value] = (counts[c.value] || 0) + 1;
  }
  const sorted = Object.values(counts).sort((a, b) => b - a);
  const c0 = (sorted[0] || 0) + jokers;
  const c1 = sorted[1] || 0;
  return c0 >= 3 || (c0 >= 2 && c1 >= 2);
}

// True when the known cards don't pay yet but some single card would turn
// them into a paying combination — the "one card from a win" tease.
export function isOneCardAway(cards) {
  if (cards.length === 0 || cards.length >= 5) return false;
  if (isPaying(cards)) return false;
  for (const value of RANKS) {
    for (const suit of SUITS) {
      if (isPaying(cards.concat([{ value, suit }]))) return true;
    }
  }
  return isPaying(cards.concat([{ value: 'Joker', suit: 'Special' }]));
}
