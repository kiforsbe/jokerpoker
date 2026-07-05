import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPaying, isOneCardAway } from '../src/game/nearWin.js';

const c = (value, suit = 'Hearts') => ({ value, suit });

test('partial pair is not paying but is one card away (trips / two pairs)', () => {
  const knowns = [c('J', 'Hearts'), c('J', 'Spades'), c('3', 'Clubs')];
  assert.equal(isPaying(knowns), false);
  assert.equal(isOneCardAway(knowns), true);
});

test('unrelated high cards are neither paying nor one card away', () => {
  const knowns = [c('A', 'Hearts'), c('K', 'Spades')];
  assert.equal(isPaying(knowns), false);
  assert.equal(isOneCardAway(knowns), false);
});

test('two pairs among four knowns is already paying', () => {
  const knowns = [c('4', 'Hearts'), c('4', 'Spades'), c('9', 'Clubs'), c('9', 'Diamonds')];
  assert.equal(isPaying(knowns), true);
  assert.equal(isOneCardAway(knowns), false);
});

test('partial trips are locked-in paying regardless of the rest', () => {
  assert.equal(isPaying([c('7', 'Hearts'), c('7', 'Spades'), c('7', 'Clubs')]), true);
});

test('four to a flush is one card away; a missed fifth card does not pay', () => {
  const fourFlush = [c('2'), c('6'), c('9'), c('K')]; // all hearts
  assert.equal(isPaying(fourFlush), false);
  assert.equal(isOneCardAway(fourFlush), true);
  assert.equal(isPaying(fourFlush.concat([c('3', 'Spades')])), false);
});

test('open-ended four to a straight is one card away', () => {
  const knowns = [c('5', 'Hearts'), c('6', 'Spades'), c('7', 'Clubs'), c('8', 'Diamonds')];
  assert.equal(isOneCardAway(knowns), true);
});

test('joker pairs up: joker + lone card is not paying, joker + pair is', () => {
  assert.equal(isPaying([c('Joker', 'Special'), c('Q', 'Hearts')]), false);
  assert.equal(isPaying([c('Joker', 'Special'), c('Q', 'Hearts'), c('Q', 'Spades')]), true);
});

test('joker + lone card is one card away (matching card makes wild trips)', () => {
  assert.equal(isOneCardAway([c('Joker', 'Special'), c('Q', 'Hearts'), c('3', 'Clubs')]), true);
});

test('full five-card hands defer to the evaluator', () => {
  const twoPairs = [c('2', 'Hearts'), c('2', 'Spades'), c('3', 'Clubs'), c('3', 'Diamonds'), c('K', 'Hearts')];
  assert.equal(isPaying(twoPairs), true);
  const nothing = [c('2', 'Hearts'), c('5', 'Spades'), c('9', 'Clubs'), c('J', 'Diamonds'), c('K', 'Hearts')];
  assert.equal(isPaying(nothing), false);
});

test('minPayout 3 (> double bet): a pair chasing two pairs/trips does not qualify', () => {
  const knowns = [c('J', 'Hearts'), c('J', 'Spades'), c('3', 'Clubs')];
  assert.equal(isOneCardAway(knowns, 3), false);
  assert.equal(isOneCardAway(knowns), true); // still a tease at any payout
});

test('minPayout 3: four to a flush qualifies (flush pays 4)', () => {
  const fourFlush = [c('2'), c('6'), c('9'), c('K')]; // all hearts
  assert.equal(isOneCardAway(fourFlush, 3), true);
});

test('minPayout 3: trips are not paying enough, but are one card from quads', () => {
  const trips = [c('7', 'Hearts'), c('7', 'Spades'), c('7', 'Clubs')];
  assert.equal(isPaying(trips, 3), false); // trips pay only 2
  assert.equal(isOneCardAway(trips, 3), true); // fourth 7 pays 15
});

test('minPayout 3: completed flush is paying, straight completion counts', () => {
  const flush = [c('2'), c('6'), c('9'), c('K'), c('A')]; // all hearts
  assert.equal(isPaying(flush, 3), true);
  const openStraight = [c('5', 'Hearts'), c('6', 'Spades'), c('7', 'Clubs'), c('8', 'Diamonds')];
  assert.equal(isOneCardAway(openStraight, 3), true); // straight pays 3
});

test('a complete hand is never "one card away"', () => {
  const five = [c('2', 'Hearts'), c('5', 'Spades'), c('9', 'Clubs'), c('J', 'Diamonds'), c('K', 'Hearts')];
  assert.equal(isOneCardAway(five), false);
  assert.equal(isOneCardAway([]), false);
});
