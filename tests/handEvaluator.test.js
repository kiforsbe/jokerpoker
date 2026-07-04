import { test } from 'node:test';
import assert from 'node:assert/strict';
import HandEvaluator from '../src/game/HandEvaluator.js';

const C = (value, suit) => ({ value, suit });
const J = () => ({ value: 'Joker', suit: 'Special' });
const key = (cards) => HandEvaluator.evaluate(cards).key;

test('natural royal flush', () => {
  assert.equal(key([C('10','Hearts'),C('J','Hearts'),C('Q','Hearts'),C('K','Hearts'),C('A','Hearts')]), 'royal_flush');
});

test('joker completes a royal flush', () => {
  assert.equal(key([C('10','Hearts'),C('J','Hearts'),C('Q','Hearts'),C('K','Hearts'),J()]), 'royal_flush');
});

test('five of a kind needs the joker', () => {
  assert.equal(key([C('K','Hearts'),C('K','Diamonds'),C('K','Clubs'),C('K','Spades'),J()]), 'five_of_a_kind');
});

test('straight flush', () => {
  assert.equal(key([C('5','Clubs'),C('6','Clubs'),C('7','Clubs'),C('8','Clubs'),C('9','Clubs')]), 'straight_flush');
});

test('wheel A-2-3-4-5 is a straight', () => {
  assert.equal(key([C('A','Hearts'),C('2','Clubs'),C('3','Diamonds'),C('4','Spades'),C('5','Hearts')]), 'straight');
});

test('four of a kind', () => {
  assert.equal(key([C('9','Hearts'),C('9','Diamonds'),C('9','Clubs'),C('9','Spades'),C('2','Hearts')]), 'four_of_a_kind');
});

test('joker makes four of a kind from trips', () => {
  assert.equal(key([C('9','Hearts'),C('9','Diamonds'),C('9','Clubs'),C('2','Spades'),J()]), 'four_of_a_kind');
});

test('full house', () => {
  assert.equal(key([C('9','Hearts'),C('9','Diamonds'),C('9','Clubs'),C('2','Spades'),C('2','Hearts')]), 'full_house');
});

test('flush', () => {
  assert.equal(key([C('2','Hearts'),C('5','Hearts'),C('8','Hearts'),C('J','Hearts'),C('K','Hearts')]), 'flush');
});

test('three of a kind', () => {
  assert.equal(key([C('9','Hearts'),C('9','Diamonds'),C('9','Clubs'),C('2','Spades'),C('5','Hearts')]), 'three_of_a_kind');
});

test('two pairs is the minimum paying hand', () => {
  assert.equal(key([C('9','Hearts'),C('9','Diamonds'),C('2','Clubs'),C('2','Spades'),C('5','Hearts')]), 'two_pairs');
});

test('a single pair does NOT pay (high card)', () => {
  const r = HandEvaluator.evaluate([C('9','Hearts'),C('9','Diamonds'),C('2','Clubs'),C('4','Spades'),C('5','Hearts')]);
  assert.equal(r.key, 'high_card');
  assert.equal(r.payout, 0);
});

test('joker with a pair makes a paying three of a kind', () => {
  assert.equal(key([C('9','Hearts'),C('9','Diamonds'),C('2','Clubs'),C('4','Spades'),J()]), 'three_of_a_kind');
});

test('evaluateWithDetails multiplies by bet and reports joker', () => {
  const d = HandEvaluator.evaluateWithDetails([C('9','Hearts'),C('9','Diamonds'),C('9','Clubs'),C('2','Spades'),J()], 5);
  assert.equal(d.key, 'four_of_a_kind');
  assert.equal(d.totalWin, 15 * 5);
  assert.equal(d.details.hasJoker, true);
});
