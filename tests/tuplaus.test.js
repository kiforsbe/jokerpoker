import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDoubleCard, isRed, resolveDouble, canDouble } from '../src/game/Tuplaus.js';

test('classify small/large/seven', () => {
  assert.equal(classifyDoubleCard('2'), 'small');
  assert.equal(classifyDoubleCard('6'), 'small');
  assert.equal(classifyDoubleCard('7'), 'seven');
  assert.equal(classifyDoubleCard('8'), 'large');
  assert.equal(classifyDoubleCard('A'), 'large');
});

test('correct guess wins, wrong guess loses', () => {
  assert.equal(resolveDouble('large', { value: 'K', suit: 'Clubs' }).outcome, 'win');
  assert.equal(resolveDouble('small', { value: 'K', suit: 'Clubs' }).outcome, 'lose');
  assert.equal(resolveDouble('small', { value: '3', suit: 'Clubs' }).outcome, 'win');
});

test('red 7 keeps, black 7 loses (default)', () => {
  assert.equal(resolveDouble('large', { value: '7', suit: 'Hearts' }).outcome, 'keep');
  assert.equal(resolveDouble('large', { value: '7', suit: 'Diamonds' }).outcome, 'keep');
  assert.equal(resolveDouble('large', { value: '7', suit: 'Clubs' }).outcome, 'lose');
  assert.equal(resolveDouble('large', { value: '7', suit: 'Spades' }).outcome, 'lose');
});

test('any-7-loses when redSevenKeeps disabled', () => {
  assert.equal(resolveDouble('large', { value: '7', suit: 'Hearts' }, { redSevenKeeps: false }).outcome, 'lose');
});

test('isRed', () => {
  assert.equal(isRed('Hearts'), true);
  assert.equal(isRed('Spades'), false);
});

test('canDouble only when win in (0, jackpot/2]', () => {
  assert.equal(canDouble(50, 200), true);
  assert.equal(canDouble(100, 200), true);
  assert.equal(canDouble(101, 200), false);
  assert.equal(canDouble(0, 200), false);
});
