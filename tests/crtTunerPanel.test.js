import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CabinetPanel } from '../src/ui/CabinetPanel.js';
import { DISPLAY_PROFILES } from '../src/rendering/displayProfiles.js';

test('CRT tuner maps scalar and axis controls to live shader parameters', () => {
  const calls = [];
  const renderSystem = {
    shaderParams: { crt: { curvature: { x: 4, y: 5 } } },
    setCRTParameters: (patch) => calls.push(patch),
  };

  assert.equal(CabinetPanel.applyCRTTuning?.(
    renderSystem,
    DISPLAY_PROFILES.eighties,
    'scanlineIntensity',
    '0.41',
  ), true);
  assert.equal(CabinetPanel.applyCRTTuning?.(
    renderSystem,
    DISPLAY_PROFILES.eighties,
    'curvatureX',
    '7.25',
  ), true);
  assert.equal(CabinetPanel.applyCRTTuning?.(
    renderSystem,
    DISPLAY_PROFILES.eighties,
    'saturation',
    '1.35',
  ), true);
  assert.deepEqual(calls, [
    { scanlineIntensity: 0.41 },
    { curvature: { x: 7.25, y: 5 } },
    { saturation: 1.35 },
  ]);
});

test('CRT tuner refuses to modify the shader in clean early-2000s mode', () => {
  const calls = [];
  const renderSystem = {
    shaderParams: { crt: { curvature: { x: 1000, y: 1000 } } },
    setCRTParameters: (patch) => calls.push(patch),
  };

  assert.equal(CabinetPanel.applyCRTTuning?.(
    renderSystem,
    DISPLAY_PROFILES.early2000s,
    'noise',
    '0.05',
  ), false);
  assert.deepEqual(calls, []);
});
