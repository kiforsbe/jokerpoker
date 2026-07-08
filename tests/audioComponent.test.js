import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameAudioComponent } from '../src/audio/AudioComponent.js';

function makeComponent() {
  const played = [];
  const component = new GameAudioComponent();
  component._audioSystem = { playEffect: (name, params) => played.push({ name, params }) };
  return { component, played };
}

test('legacy sound names route to registry names', () => {
  const { component, played } = makeComponent();
  component.playDeal();
  component.playButtonPress();
  component.playCardFlip();
  component.playBurst();
  assert.deepEqual(played.map(p => p.name),
    ['cardDeal', 'buttonPress', 'cardFlip', 'burst']);
});

test('playSound without an audio system is a no-op', () => {
  const component = new GameAudioComponent();
  component.playSound('win'); // must not throw
});
