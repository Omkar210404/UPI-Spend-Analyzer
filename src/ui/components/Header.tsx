import type { TargetedKeyboardEvent } from 'preact';
import { useRef } from 'preact/hooks';

import { formatDate } from '../../core/import/dates';
import { statementRange } from '../../core/analytics/monthly';
import { useApp } from '../context';
import { TABS, type Tab } from '../state';
import { plural } from './common';
import { Logo, MoonIcon, ShieldIcon, SunIcon } from './icons';

function ThemeToggle() {
  const { state, dispatch } = useApp();
  const dark = state.theme === 'dark';
  return (
    <button
      type="button"
      class="button button-quiet icon-button"
      aria-label={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      onClick={() => dispatch({ type: 'set-theme', theme: dark ? 'light' : 'dark' })}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/** Tabs follow the standard pattern: arrow keys move between them, Tab leaves the list. */
function TabList() {
  const { state, dispatch } = useApp();
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: TargetedKeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((tab) => tab.id === state.tab);
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    const tab = TABS[next]!.id;
    dispatch({ type: 'set-tab', tab });
    listRef.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.focus();
  };

  return (
    <div class="tabs" role="tablist" aria-label="Sections" ref={listRef} onKeyDown={onKeyDown}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          data-tab={tab.id}
          class="tab"
          aria-selected={state.tab === tab.id}
          tabIndex={state.tab === tab.id ? 0 : -1}
          onClick={() => dispatch({ type: 'set-tab', tab: tab.id as Tab })}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Header() {
  const { state, dispatch, txns } = useApp();
  const { statement } = state;
  const range = statementRange(txns);

  return (
    <header class="header">
      <div class="header-row">
        <div class="brand">
          <Logo />
          <span class="brand-name">UPI Spend Analyzer</span>
        </div>
        <div class="header-meta">
          <span class="privacy-pill">
            <ShieldIcon />
            <span>Nothing leaves this browser</span>
          </span>
          {statement?.source === 'sample' ? (
            <span
              class="sample-badge"
              title="This is synthetic data made by a script, not a real statement"
            >
              Sample data
            </span>
          ) : null}
          <ThemeToggle />
        </div>
      </div>
      {statement && !state.pending ? (
        <>
          <div class="header-row statement-row">
            <p class="statement-summary">
              <strong>{statement.fileName}</strong>
              <span>
                {plural(txns.length, 'transaction')}
                {range ? `, ${formatDate(range.first)} to ${formatDate(range.last)}` : ''}
              </span>
            </p>
            <button
              type="button"
              class="button button-secondary button-small"
              onClick={() => dispatch({ type: 'close-statement' })}
            >
              Open another file
            </button>
          </div>
          <TabList />
        </>
      ) : null}
    </header>
  );
}
