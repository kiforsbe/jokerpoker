import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, getLanguage, setLanguage, cycleLanguage, onLanguageChanged, t, translationKeys } from '../src/i18n.js';
import { PAYTABLE } from '../src/game/payouts.js';

test('defaults to english and cycles en -> sv -> fi -> en', () => {
  setLanguage('en');
  assert.deepEqual(LANGUAGES, ['en', 'sv', 'fi']);
  assert.equal(cycleLanguage(), 'sv');
  assert.equal(cycleLanguage(), 'fi');
  assert.equal(cycleLanguage(), 'en');
});

test('every key has all three languages', () => {
  for (const key of translationKeys()) {
    for (const lang of LANGUAGES) {
      const v = t(key, lang);
      assert.ok(typeof v === 'string' && v.length > 0, `${key}/${lang}`);
    }
  }
});

test('every pay table hand has a translation', () => {
  for (const row of PAYTABLE) {
    assert.notEqual(t(row.key, 'sv'), row.key, row.key);
    assert.notEqual(t(row.key, 'fi'), row.key, row.key);
  }
});

test('t falls back to english then the key, and notifies listeners', () => {
  setLanguage('en');
  assert.equal(t('no_such_key'), 'no_such_key');
  const seen = [];
  const off = onLanguageChanged(l => seen.push(l));
  setLanguage('fi');
  assert.equal(t('hold'), 'PIDÄ');
  assert.equal(getLanguage(), 'fi');
  off();
  setLanguage('en');
  assert.deepEqual(seen, ['fi']);
});
