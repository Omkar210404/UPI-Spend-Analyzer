import { render } from 'preact';

import { readOverrides, readProfiles, readRules, defaultSettings } from './core/settings/settings';
import { createStore, type StorageLike } from './core/storage/storage';
import { App, initialState } from './ui/App';
import type { Theme } from './ui/state';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/components.css';
import './ui/styles/views.css';

/** Reaching for localStorage can itself throw when storage is blocked. */
function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const store = createStore(browserStorage());
const defaults = defaultSettings();
const settings = {
  rules: store.read('rules', readRules) ?? defaults.rules,
  overrides: store.read('overrides', readOverrides) ?? defaults.overrides,
  profiles: store.read('profiles', readProfiles) ?? defaults.profiles,
};
// Light is the default. Dark is used only when the user chose it before.
const theme: Theme =
  store.read('theme', (value) => (value === 'dark' || value === 'light' ? value : null)) ?? 'light';

// Load both font files now, while the page is loading, so no font request can
// happen later when a rupee sign or an accented letter first appears.
if ('fonts' in document) {
  document.fonts.forEach((face) => void face.load().catch(() => undefined));
}

render(
  <App store={store} initial={initialState(settings, theme)} />,
  document.getElementById('app')!,
);
