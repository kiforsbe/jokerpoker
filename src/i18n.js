// Display language for all on-screen text. Pure module (no top-level DOM)
// so `node --test` can import it. The cabinet button panel stays trilingual
// like the original machines' printed buttons.
export const LANGUAGES = ['en', 'sv', 'fi'];

const STORAGE_KEY = 'jokerpoker.lang';

const STRINGS = {
  // status bar
  credits: { en: 'Credits', sv: 'Saldo', fi: 'Saldo' },
  bet:     { en: 'Bet', sv: 'Insats', fi: 'Panos' },
  wins:    { en: 'Wins', sv: 'Vinst', fi: 'Voitto' },
  // win overlay
  win:     { en: 'WIN', sv: 'VINST', fi: 'VOITTO' },
  // joker card corner/caption
  joker:   { en: 'JOKER', sv: 'JOKER', fi: 'JOKERI' },
  // hold indicator + gamble hints
  hold:    { en: 'HOLD', sv: 'HÅLL', fi: 'PIDÄ' },
  low:     { en: 'LOW', sv: 'LÅG', fi: 'PIENI' },
  high:    { en: 'HIGH', sv: 'HÖG', fi: 'SUURI' },
  // pay table hands (keys match payouts.js); Swedish and Finnish use the
  // standard poker hand names (fyrtal/kåk/triss, neloset/täyskäsi/kolmoset)
  royal_flush:     { en: 'Royal flush', sv: 'Royal flush', fi: 'Kuningasvärisuora' },
  five_of_a_kind:  { en: 'Five-of-a-kind', sv: 'Femtal', fi: 'Viitoset' },
  straight_flush:  { en: 'Straight flush', sv: 'Färgstege', fi: 'Värisuora' },
  four_of_a_kind:  { en: 'Four-of-a-kind', sv: 'Fyrtal', fi: 'Neloset' },
  full_house:      { en: 'Full house', sv: 'Kåk', fi: 'Täyskäsi' },
  flush:           { en: 'Flush', sv: 'Färg', fi: 'Väri' },
  straight:        { en: 'Straight', sv: 'Stege', fi: 'Suora' },
  three_of_a_kind: { en: 'Three-of-a-kind', sv: 'Triss', fi: 'Kolmoset' },
  two_pairs:       { en: 'Two pairs', sv: 'Två par', fi: 'Kaksi paria' },
  // tuplaus rules ticker ("dubbelt eller kvitt" / "tupla tai kuitti" are
  // the standard double-or-nothing idioms)
  ticker_title: {
    en: 'TUPLAUS - DOUBLE OR NOTHING',
    sv: 'TUPLAUS - DUBBELT ELLER KVITT',
    fi: 'TUPLAUS - TUPLA TAI KUITTI',
  },
  seven_loses: { en: '7 LOSES', sv: '7 FÖRLORAR', fi: '7 HÄVIÄÄ' },
  red_seven:   { en: 'RED 7', sv: 'RÖD 7', fi: 'PUNAINEN 7' },
  keeps_win:   { en: ' KEEPS THE WIN', sv: ' BEHÅLLER VINSTEN', fi: ' PITÄÄ VOITON' },
  double_up_to: { en: 'DOUBLE UP TO ', sv: 'DUBBLA UPP TILL ', fi: 'TUPLAA ENINTÄÄN ' },
  half_jackpot: { en: 'HALF THE JACKPOT', sv: 'HALVA JACKPOTTEN', fi: 'PUOLEEN JACKPOTISTA' },
};

let active = loadStored() ?? 'en';
const listeners = new Set();

function loadStored() {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    return LANGUAGES.includes(v) ? v : null;
  } catch { return null; }
}

export function getLanguage() { return active; }

export function setLanguage(lang) {
  if (!LANGUAGES.includes(lang) || lang === active) return active;
  active = lang;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, lang); } catch { /* private mode */ }
  for (const cb of listeners) cb(active);
  return active;
}

export function cycleLanguage() {
  return setLanguage(LANGUAGES[(LANGUAGES.indexOf(active) + 1) % LANGUAGES.length]);
}

export function onLanguageChanged(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Translate a key into the active (or given) language.
export function t(key, lang = active) {
  return STRINGS[key]?.[lang] ?? STRINGS[key]?.en ?? key;
}

// All translatable keys, for consistency tests.
export function translationKeys() { return Object.keys(STRINGS); }
