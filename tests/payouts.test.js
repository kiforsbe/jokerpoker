import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAYTABLE, ROYAL_PAYOUT, payoutFor, nameFor } from '../src/game/payouts.js';

test('paytable has the 9 authentic hands in order', () => {
  assert.deepEqual(
    PAYTABLE.map(p => p.key),
    ['royal_flush','five_of_a_kind','straight_flush','four_of_a_kind',
     'full_house','flush','straight','three_of_a_kind','two_pairs']
  );
});

test('paytable payouts match the 200 version', () => {
  assert.deepEqual(PAYTABLE.map(p => p.payout), [200,100,40,15,7,4,3,2,2]);
});

test('ROYAL_PAYOUT is 200', () => assert.equal(ROYAL_PAYOUT, 200));

test('payoutFor and nameFor look up by key', () => {
  assert.equal(payoutFor('full_house'), 7);
  assert.equal(payoutFor('high_card'), 0);
  assert.equal(nameFor('two_pairs'), 'Two pairs');
});

test('paytable display names match the machine photos', () => {
  assert.deepEqual(PAYTABLE.map(p => p.display), [
    'Royal flush', 'Five-of-a-kind', 'Straight flush', 'Four-of-a-kind',
    'Full house', 'Flush', 'Straight', 'Three-of-a-kind', 'Two pairs',
  ]);
});
