import test from 'node:test';
import assert from 'node:assert/strict';

import { DisplayProfileController } from '../src/rendering/DisplayProfileController.js';

const PROFILE_KEY = 'jokerpoker.displayProfile';
const LEGACY_KEY = 'jokerpoker.resolution';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    writes,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { writes.push([key, value]); values.set(key, String(value)); },
  };
}

function createApplier(log, name, failure) {
  return {
    applyDisplayProfile(profile) {
      log.push(`${name}:${profile.label}`);
      const error = failure?.(profile);
      if (error) throw error;
    },
  };
}

test('defaults to eighties and migrates a legacy resolution only without a current profile', () => {
  const defaultController = new DisplayProfileController({ storage: createStorage() });
  assert.equal(defaultController.getDisplayProfile().label, '1980s');

  const migratedStorage = createStorage({ [LEGACY_KEY]: 'medium' });
  const migratedController = new DisplayProfileController({ storage: migratedStorage });
  assert.equal(migratedController.getDisplayProfile().label, '1990s');
  assert.deepEqual(migratedStorage.writes, [[PROFILE_KEY, 'nineties']]);

  const currentStorage = createStorage({ [PROFILE_KEY]: 'early2000s', [LEGACY_KEY]: 'retro' });
  const currentController = new DisplayProfileController({ storage: currentStorage });
  assert.equal(currentController.getDisplayProfile().label, 'Early 2000s');
  assert.deepEqual(currentStorage.writes, []);
});

test('applies in order before persisting and synchronously notifying listeners', () => {
  const storage = createStorage();
  const log = [];
  const controller = new DisplayProfileController({ storage });
  controller.configureAppliers([
    createApplier(log, 'first'),
    createApplier(log, 'second'),
  ]);
  controller.onDisplayProfileChanged((profile) => log.push(`listener:${profile.label}:${storage.getItem(PROFILE_KEY)}`));

  const result = controller.setDisplayProfile('nineties');

  assert.equal(result.label, '1990s');
  assert.deepEqual(log, ['first:1990s', 'second:1990s', 'listener:1990s:nineties']);
  assert.deepEqual(storage.writes, [[PROFILE_KEY, 'nineties']]);
});

test('cycles through the profile order and wraps to eighties', () => {
  const controller = new DisplayProfileController({ storage: createStorage() });
  assert.equal(controller.cycleDisplayProfile().label, '1990s');
  assert.equal(controller.cycleDisplayProfile().label, 'Early 2000s');
  assert.equal(controller.cycleDisplayProfile().label, '1980s');
});

test('does nothing for unknown and already-active profile IDs', () => {
  const storage = createStorage();
  const log = [];
  const controller = new DisplayProfileController({ storage });
  controller.configureAppliers([createApplier(log, 'applier')]);
  controller.onDisplayProfileChanged(() => log.push('listener'));

  assert.equal(controller.setDisplayProfile('unknown').label, '1980s');
  assert.equal(controller.setDisplayProfile('eighties').label, '1980s');
  assert.deepEqual(log, []);
  assert.deepEqual(storage.writes, []);
});

test('rolls every applier back and rethrows the original application failure without side effects', () => {
  const storage = createStorage();
  const log = [];
  const originalError = new Error('apply failed');
  const controller = new DisplayProfileController({ storage });
  controller.configureAppliers([
    createApplier(log, 'first'),
    createApplier(log, 'second', (profile) => profile.label === '1990s' ? originalError : undefined),
    createApplier(log, 'third'),
  ]);
  controller.onDisplayProfileChanged(() => log.push('listener'));

  assert.throws(() => controller.setDisplayProfile('nineties'), (error) => error === originalError);
  assert.equal(controller.getDisplayProfile().label, '1980s');
  assert.deepEqual(log, ['first:1990s', 'second:1990s', 'first:1980s', 'second:1980s', 'third:1980s']);
  assert.deepEqual(storage.writes, []);
});

test('unsubscribe prevents later display-profile notifications', () => {
  const controller = new DisplayProfileController({ storage: createStorage() });
  const received = [];
  const unsubscribe = controller.onDisplayProfileChanged((profile) => received.push(profile.label));
  unsubscribe();

  controller.setDisplayProfile('nineties');
  assert.deepEqual(received, []);
});

test('reports the first rollback failure while rethrowing the original application error', () => {
  const storage = createStorage();
  const applyError = new Error('apply failed');
  const rollbackError = new Error('rollback failed');
  const rollbackFailures = [];
  const controller = new DisplayProfileController({
    storage,
    onRollbackFailure: (failure) => rollbackFailures.push(failure),
  });
  controller.configureAppliers([
    createApplier([], 'first', (profile) => profile.label === '1980s' ? rollbackError : undefined),
    createApplier([], 'second', (profile) => profile.label === '1990s' ? applyError : undefined),
  ]);

  assert.throws(() => controller.setDisplayProfile('nineties'), (error) => error === applyError);
  assert.deepEqual(rollbackFailures, [{
    profile: controller.getDisplayProfile(), originalError: applyError, rollbackError,
  }]);
});

test('rejects duplicate configuration and appliers without the required method', () => {
  const controller = new DisplayProfileController({ storage: createStorage() });
  assert.throws(() => controller.configureAppliers([{}]), /Every display profile applier/);
  controller.configureAppliers([]);
  assert.throws(() => controller.configureAppliers([]), /once only/);
});

test('falls back to eighties for invalid current stored IDs without using legacy migration', () => {
  const storage = createStorage({ [PROFILE_KEY]: 'malformed', [LEGACY_KEY]: 'medium' });
  const controller = new DisplayProfileController({ storage });
  assert.equal(controller.getDisplayProfile().label, '1980s');
  assert.deepEqual(storage.writes, []);
});

test('does not migrate inherited legacy property names', () => {
  const storage = createStorage({ [LEGACY_KEY]: 'toString' });
  const controller = new DisplayProfileController({ storage });

  assert.equal(controller.getDisplayProfile().label, '1980s');
  assert.deepEqual(storage.writes, []);
});

test('defaults to eighties when persisted profile reads are unavailable', () => {
  const storageError = new Error('storage unavailable');
  const storage = {
    getItem() { throw storageError; },
    setItem() { throw storageError; },
  };

  let controller;
  assert.doesNotThrow(() => { controller = new DisplayProfileController({ storage }); });
  assert.equal(controller.getDisplayProfile().label, '1980s');
});

test('uses a migrated legacy profile even when its persistence write is unavailable', () => {
  const storage = createStorage({ [LEGACY_KEY]: 'medium' });
  storage.setItem = () => { throw new Error('storage unavailable'); };

  const controller = new DisplayProfileController({ storage });

  assert.equal(controller.getDisplayProfile().label, '1990s');
});

test('completes a profile switch consistently when persistence is unavailable', () => {
  const storage = createStorage();
  storage.setItem = () => { throw new Error('storage unavailable'); };
  const log = [];
  const controller = new DisplayProfileController({ storage });
  controller.configureAppliers([
    createApplier(log, 'first'),
    createApplier(log, 'second'),
  ]);
  controller.onDisplayProfileChanged((profile) => log.push(`listener:${profile.label}`));

  const result = controller.setDisplayProfile('nineties');

  assert.equal(result.label, '1990s');
  assert.equal(controller.getDisplayProfile().label, '1990s');
  assert.deepEqual(log, ['first:1990s', 'second:1990s', 'listener:1990s']);
});
