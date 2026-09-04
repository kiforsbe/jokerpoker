import {
  DISPLAY_PROFILE_ORDER,
  LEGACY_PROFILE_IDS,
  getDisplayProfile,
} from './displayProfiles.js';

const PROFILE_KEY = 'jokerpoker.displayProfile';
const LEGACY_KEY = 'jokerpoker.resolution';
const DEFAULT_PROFILE_ID = 'eighties';

function profileForCanonicalId(id) {
  return DISPLAY_PROFILE_ORDER.includes(id) ? getDisplayProfile(id) : null;
}

function persistProfile(storage, id) {
  try {
    storage?.setItem(PROFILE_KEY, id);
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
}

export class DisplayProfileController {
  constructor({ storage = globalThis.localStorage, onRollbackFailure = () => {} } = {}) {
    this.storage = storage;
    this.onRollbackFailure = onRollbackFailure;
    this.appliers = [];
    this.configured = false;
    this.listeners = new Set();

    let storedId = null;
    let legacyId;
    try {
      storedId = storage?.getItem(PROFILE_KEY) ?? null;
      if (storedId === null) {
        const legacyStoredId = storage?.getItem(LEGACY_KEY) ?? null;
        legacyId = Object.hasOwn(LEGACY_PROFILE_IDS, legacyStoredId)
          ? LEGACY_PROFILE_IDS[legacyStoredId]
          : undefined;
      }
    } catch {
      storedId = null;
      legacyId = undefined;
    }

    if (storedId === null) {
      if (legacyId) persistProfile(storage, legacyId);
      this.activeProfile = profileForCanonicalId(legacyId) ?? profileForCanonicalId(DEFAULT_PROFILE_ID);
    } else {
      this.activeProfile = profileForCanonicalId(storedId) ?? profileForCanonicalId(DEFAULT_PROFILE_ID);
    }
  }

  getDisplayProfile() {
    return this.activeProfile;
  }

  configureAppliers(appliers) {
    if (this.configured) throw new Error('Display profile appliers may be configured once only');
    if (!Array.isArray(appliers) || appliers.some((applier) => typeof applier?.applyDisplayProfile !== 'function')) {
      throw new TypeError('Every display profile applier must expose applyDisplayProfile(profile)');
    }
    this.appliers = appliers;
    this.configured = true;
  }

  setDisplayProfile(id) {
    const nextProfile = profileForCanonicalId(id);
    if (!nextProfile || nextProfile === this.activeProfile) return this.activeProfile;

    const previousProfile = this.activeProfile;
    try {
      this.appliers.forEach((applier) => applier.applyDisplayProfile(nextProfile));
    } catch (originalError) {
      let rollbackError;
      this.appliers.forEach((applier) => {
        try {
          applier.applyDisplayProfile(previousProfile);
        } catch (error) {
          rollbackError ??= error;
        }
      });
      if (rollbackError) {
        try {
          this.onRollbackFailure({ profile: previousProfile, originalError, rollbackError });
        } catch {
          // The original apply failure remains authoritative.
        }
      }
      throw originalError;
    }

    this.activeProfile = nextProfile;
    persistProfile(this.storage, id);
    this.listeners.forEach((listener) => listener(nextProfile));
    return this.activeProfile;
  }

  cycleDisplayProfile() {
    const currentIndex = DISPLAY_PROFILE_ORDER.findIndex((id) => profileForCanonicalId(id) === this.activeProfile);
    const nextId = DISPLAY_PROFILE_ORDER[(currentIndex + 1) % DISPLAY_PROFILE_ORDER.length];
    return this.setDisplayProfile(nextId);
  }

  onDisplayProfileChanged(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}
