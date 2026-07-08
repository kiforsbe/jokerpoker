// Tune data for the original machine's repertoire, transcribed against the
// reference recordings listed in the design spec. The MusicPlayer supports
// multi-channel songs, but the original is a monophonic PSG — every tune here
// is a single square-wave voice on purpose.

// Equal-temperament note frequency, semitones relative to A4 (440 Hz).
export const N = (semis) => 440 * Math.pow(2, semis / 12);

const sq = (freq, dur) => ({ freq, dur, type: 'square' });

// --- Tuplaus (double-or-nothing) tune -------------------------------------
// A brisk 30-note phrase played three times, then a 9-note ending line.
// Note names are German/Helmholtz: h = B natural, b = B flat, c1 = C4.
const TUPLAUS_BASE_DUR = 0.56;
export const TUPLAUS_MAX_RATE = 4.6; // 0.56 / 4.6 ≈ 0.12s — the old tempo floor

const C4 = N(-9), E4 = N(-5), F4 = N(-4), G4 = N(-2), A4 = N(0);
const Bb4 = N(1), B4 = N(2), C5 = N(3), D5 = N(5);

const TUPLAUS_PHRASE = [
  F4, C5, B4, C5, D5, C5, B4, C5,   C5, C5, B4, Bb4, Bb4, A4, G4,
  F4, C5, B4, C5, D5, C5, B4, C5,   Bb4, Bb4, B4, C5, Bb4, A4, G4,
];
const TUPLAUS_ENDING = [C4, C4, C4, C4, C4, C4, G4, E4, C4];

export const TUPLAUS = [
  ...TUPLAUS_PHRASE, ...TUPLAUS_PHRASE, ...TUPLAUS_PHRASE,
  ...TUPLAUS_ENDING,
].map((freq, i, arr) => sq(freq, i === arr.length - 1 ? TUPLAUS_BASE_DUR * 3 : TUPLAUS_BASE_DUR));

// --- Attract-mode jingle ---------------------------------------------------
const E5 = N(7), G5 = N(10), C6 = N(15);
export const ATTRACT = [
  sq(C5, 0.18), sq(E5, 0.18), sq(G5, 0.18), sq(C6, 0.24),
  sq(0, 0.12), sq(G5, 0.18), sq(E5, 0.18), sq(C5, 0.30),
  sq(0, 0.30),
];

// --- Procedural cues ---------------------------------------------------------
// Ascending win melody; longer/higher for stronger hands (rank 1..9).
export function winMelody(rank) {
  const steps = Math.min(3 + rank, 9);
  const notes = [];
  for (let i = 0; i < steps; i++) notes.push(sq(N(3 + i * 2), 0.09)); // climbing from C5
  return notes;
}

// The iconic payout tally: rapid rising ticks (capped so long wins stay short).
export function countUp(amount) {
  const ticks = Math.min(Math.max(amount, 1), 40);
  const notes = [];
  for (let i = 0; i < ticks; i++) notes.push(sq(700 + i * 25, 0.04));
  return notes;
}
