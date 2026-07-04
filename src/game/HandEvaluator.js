import { PAYTABLE, nameFor, payoutFor } from './payouts.js';

const RANK = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
const SUITS = ['Hearts','Diamonds','Clubs','Spades'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

// rank integer per hand key (higher = better), matching the machine's pay order.
const RANK_OF = {
  royal_flush: 9, five_of_a_kind: 8, straight_flush: 7, four_of_a_kind: 6,
  full_house: 5, flush: 4, straight: 3, three_of_a_kind: 2, two_pairs: 1, high_card: 0,
};

class HandEvaluator {
  // cards: array of { value, suit } (CardComponent instances work too).
  static evaluate(cards) {
    const simple = cards.map(c => ({ value: c.value, suit: c.suit }));
    const jokers = simple.filter(c => c.value === 'Joker');
    const naturals = simple.filter(c => c.value !== 'Joker');

    let best = { key: 'high_card', rank: -1 };
    if (jokers.length === 0) {
      best = this._rankFive(naturals);
    } else {
      // One wild joker: brute-force every substitution, keep the best.
      for (const suit of SUITS) {
        for (const value of RANKS) {
          const candidate = naturals.concat([{ value, suit }]);
          const r = this._rankFive(candidate);
          if (r.rank > best.rank) best = r;
        }
      }
    }
    return { rank: best.rank, key: best.key, name: nameFor(best.key), payout: payoutFor(best.key) };
  }

  static evaluateWithDetails(cards, bet = 1) {
    const result = this.evaluate(cards);
    return {
      ...result,
      totalWin: result.payout * bet,
      details: { hasJoker: cards.some(c => c.value === 'Joker') },
    };
  }

  static _rankFive(cards) {
    const values = cards.map(c => RANK[c.value]).sort((a, b) => a - b);
    const isFlush = new Set(cards.map(c => c.suit)).size === 1;
    const counts = {};
    for (const v of values) counts[v] = (counts[v] || 0) + 1;
    const countVals = Object.values(counts).sort((a, b) => b - a);
    const straightHigh = this._straightHigh(values);
    const isStraight = straightHigh > 0;
    const isRoyal = isStraight && isFlush && straightHigh === 14 && values[0] === 10;

    let key;
    if (isRoyal) key = 'royal_flush';
    else if (countVals[0] === 5) key = 'five_of_a_kind';
    else if (isStraight && isFlush) key = 'straight_flush';
    else if (countVals[0] === 4) key = 'four_of_a_kind';
    else if (countVals[0] === 3 && countVals[1] === 2) key = 'full_house';
    else if (isFlush) key = 'flush';
    else if (isStraight) key = 'straight';
    else if (countVals[0] === 3) key = 'three_of_a_kind';
    else if (countVals[0] === 2 && countVals[1] === 2) key = 'two_pairs';
    else key = 'high_card';

    return { key, rank: RANK_OF[key] };
  }

  // Returns the high card value of a 5-card straight, or 0 if not a straight.
  static _straightHigh(values) {
    const uniq = [...new Set(values)];
    if (uniq.length !== 5) return 0;
    if (uniq[4] - uniq[0] === 4) return uniq[4];
    // wheel: A-2-3-4-5
    if (uniq[0] === 2 && uniq[1] === 3 && uniq[2] === 4 && uniq[3] === 5 && uniq[4] === 14) return 5;
    return 0;
  }
}

export default HandEvaluator;
export { HandEvaluator };
