// Pure tuplaus (double-up) rules. No rendering/DOM dependencies.
const RANK = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };

export function classifyDoubleCard(value) {
  const r = RANK[value];
  if (r === 7) return 'seven';
  return r < 7 ? 'small' : 'large';
}

export function isRed(suit) {
  return suit === 'Hearts' || suit === 'Diamonds';
}

// guess: 'small' | 'large'; card: { value, suit }; options: { redSevenKeeps = true }
export function resolveDouble(guess, card, options = {}) {
  const redSevenKeeps = options.redSevenKeeps !== false;
  const cls = classifyDoubleCard(card.value);
  if (cls === 'seven') {
    return { outcome: redSevenKeeps && isRed(card.suit) ? 'keep' : 'lose' };
  }
  return { outcome: cls === guess ? 'win' : 'lose' };
}

export function canDouble(win, jackpot) {
  return win > 0 && win <= jackpot / 2;
}
