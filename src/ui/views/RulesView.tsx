import { useRef, useState } from 'preact/hooks';

import {
  CATEGORIES,
  categoryLabel,
  isCategoryId,
  RULE_CATEGORIES,
} from '../../core/categorise/categories';
import { clearMerchantOverride, EMPTY_OVERRIDES } from '../../core/categorise/overrides';
import { normaliseKeyword, type Rule } from '../../core/categorise/rules';
import { defaultSettings, parseSettings, serialiseSettings } from '../../core/settings/settings';
import { plural } from '../components/common';
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, DownloadIcon } from '../components/icons';
import { useApp } from '../context';
import { downloadText } from '../files';

function RuleCard({ rule, index, count }: { rule: Rule; index: number; count: number }) {
  const { state, dispatch } = useApp();
  const { rules } = state.settings;
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const replace = (next: Rule) =>
    dispatch({
      type: 'set-rules',
      rules: rules.map((entry) => (entry.id === rule.id ? next : entry)),
    });
  const move = (offset: number) => {
    const next = [...rules];
    const [moved] = next.splice(index, 1);
    next.splice(index + offset, 0, moved!);
    dispatch({ type: 'set-rules', rules: next });
  };
  const add = () => {
    const keyword = normaliseKeyword(draft);
    if (!keyword) {
      setError('Type a word or phrase made of letters or digits.');
      return;
    }
    if (rule.keywords.includes(keyword)) {
      setError(`${keyword} is already in this rule.`);
      return;
    }
    replace({ ...rule, keywords: [...rule.keywords, keyword] });
    setDraft('');
    setError('');
  };

  return (
    <li class="rule-card">
      <div class="rule-head">
        <span class="rule-order">{index + 1}</span>
        <div class="field">
          <label for={`rule-category-${rule.id}`} class="visually-hidden">
            Category for rule {index + 1}
          </label>
          <select
            id={`rule-category-${rule.id}`}
            value={rule.category}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (isCategoryId(value)) replace({ ...rule, category: value });
            }}
          >
            {RULE_CATEGORIES.map((id) => (
              <option key={id} value={id}>
                {categoryLabel(id)}
              </option>
            ))}
          </select>
        </div>
        <div class="rule-buttons">
          <button
            type="button"
            class="button button-quiet icon-button"
            disabled={index === 0}
            aria-label={`Move the ${categoryLabel(rule.category)} rule up`}
            onClick={() => move(-1)}
          >
            <ArrowUpIcon />
          </button>
          <button
            type="button"
            class="button button-quiet icon-button"
            disabled={index === count - 1}
            aria-label={`Move the ${categoryLabel(rule.category)} rule down`}
            onClick={() => move(1)}
          >
            <ArrowDownIcon />
          </button>
          <button
            type="button"
            class="button button-quiet button-small button-danger"
            onClick={() =>
              dispatch({ type: 'set-rules', rules: rules.filter((entry) => entry.id !== rule.id) })
            }
          >
            Delete rule
          </button>
        </div>
      </div>
      <ul class="keyword-list" aria-label={`Keywords for ${categoryLabel(rule.category)}`}>
        {rule.keywords.map((keyword) => (
          <li key={keyword} class="keyword">
            <span>{keyword}</span>
            <button
              type="button"
              class="keyword-remove"
              aria-label={`Remove ${keyword} from ${categoryLabel(rule.category)}`}
              onClick={() =>
                replace({ ...rule, keywords: rule.keywords.filter((entry) => entry !== keyword) })
              }
            >
              <CloseIcon />
            </button>
          </li>
        ))}
        {rule.keywords.length === 0 ? <li class="empty-note">No keywords yet.</li> : null}
      </ul>
      <form
        class="keyword-form"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <label for={`rule-add-${rule.id}`} class="visually-hidden">
          New keyword for {categoryLabel(rule.category)}
        </label>
        <input
          id={`rule-add-${rule.id}`}
          type="text"
          maxLength={60}
          placeholder="Add a keyword"
          value={draft}
          onInput={(event) => {
            setDraft(event.currentTarget.value);
            setError('');
          }}
        />
        <button type="submit" class="button button-secondary button-small">
          Add
        </button>
      </form>
      {error ? (
        <p class="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function RulesView() {
  const { state, dispatch, store } = useApp();
  const { settings } = state;
  const { rules, overrides, profiles } = settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const merchantChoices = Object.entries(overrides.byMerchant).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const txnChoices = Object.keys(overrides.byTxn).length;

  const importSettings = async (file: File | undefined) => {
    if (!file) return;
    setImportError('');
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportError('This file could not be read.');
      return;
    }
    const result = parseSettings(text);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    dispatch({
      type: 'replace-settings',
      settings: result.settings,
      notice: `Imported ${plural(result.settings.rules.length, 'rule')} and your category choices.`,
    });
  };

  return (
    <div class="rules">
      <header class="page-head">
        <h1 tabIndex={-1}>Rules and data</h1>
        <p class="lead">
          How transactions get their category, and everything this app keeps in your browser.
        </p>
        {!store.persistent ? (
          <p class="callout callout-warn">
            This browser is not letting the page save anything, so changes made here last only until
            you close or reload the tab. Use "Export settings" to keep them.
          </p>
        ) : null}
      </header>

      <section class="card" aria-labelledby="rules-title">
        <header class="card-head">
          <div>
            <h2 class="card-title" id="rules-title">
              Keyword rules
            </h2>
            <p class="card-subtitle">
              Rules apply to money out and are tried from the top: the first keyword that matches
              decides. A keyword matches whole words only, so OLA matches "OLA CABS" but not
              "COLABA". End a keyword with * to match the start of a word: SWIGGY* matches
              "SWIGGYINSTAMART". Your own choices on the Transactions tab always win over rules.
            </p>
          </div>
        </header>
        <ol class="rule-list">
          {rules.map((rule, index) => (
            <RuleCard key={rule.id} rule={rule} index={index} count={rules.length} />
          ))}
        </ol>
        {rules.length === 0 ? (
          <p class="empty-note">There are no rules. Everything is filed under Other.</p>
        ) : null}
        <div class="button-row">
          <button
            type="button"
            class="button button-secondary"
            onClick={() =>
              dispatch({
                type: 'set-rules',
                rules: [
                  ...rules,
                  { id: `rule-${Date.now().toString(36)}`, category: 'shopping', keywords: [] },
                ],
              })
            }
          >
            Add a rule
          </button>
          <button
            type="button"
            class="button button-quiet"
            onClick={() => dispatch({ type: 'set-rules', rules: defaultSettings().rules })}
          >
            Reset rules to the defaults
          </button>
        </div>
      </section>

      <section class="card" aria-labelledby="choices-title">
        <h2 class="card-title" id="choices-title">
          Your category choices
        </h2>
        <p class="card-subtitle">
          {plural(merchantChoices.length, 'merchant-wide choice')} and{' '}
          {plural(txnChoices, 'single-transaction choice')}. Single-transaction choices are kept
          under a short fingerprint of the row, not the row itself.
        </p>
        {merchantChoices.length > 0 ? (
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Merchant</th>
                  <th scope="col">Always filed under</th>
                  <th scope="col">
                    <span class="visually-hidden">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {merchantChoices.map(([merchantKey, category]) => (
                  <tr key={merchantKey}>
                    <th scope="row">{merchantKey}</th>
                    <td>{CATEGORIES.find((entry) => entry.id === category)?.label}</td>
                    <td class="num">
                      <button
                        type="button"
                        class="button button-quiet button-small"
                        onClick={() =>
                          dispatch({
                            type: 'set-overrides',
                            overrides: clearMerchantOverride(overrides, merchantKey),
                          })
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {merchantChoices.length + txnChoices > 0 ? (
          <div class="button-row">
            <button
              type="button"
              class="button button-quiet button-danger"
              onClick={() => dispatch({ type: 'set-overrides', overrides: EMPTY_OVERRIDES })}
            >
              Remove all my category choices
            </button>
          </div>
        ) : null}
      </section>

      <section class="card" aria-labelledby="profiles-title">
        <h2 class="card-title" id="profiles-title">
          Saved column mappings
        </h2>
        {profiles.length === 0 ? (
          <p class="empty-note">
            None yet. Tick "Remember this mapping" when you import a file to save one.
          </p>
        ) : (
          <ul class="profile-list">
            {profiles.map((profile) => (
              <li key={profile.id}>
                <span>
                  <strong>{profile.name}</strong>
                  <span class="cell-sub">
                    {plural(profile.signature.split('|').length, 'column')} in the file
                  </span>
                </span>
                <button
                  type="button"
                  class="button button-quiet button-small"
                  onClick={() =>
                    dispatch({
                      type: 'set-profiles',
                      profiles: profiles.filter((entry) => entry.id !== profile.id),
                    })
                  }
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="card" aria-labelledby="backup-title">
        <h2 class="card-title" id="backup-title">
          Export, import and delete
        </h2>
        <p class="card-subtitle">
          Rules, category choices and column mappings live in this browser's local storage and
          nowhere else. Your transactions are never stored at all. The export is a JSON file with no
          transactions in it.
        </p>
        <div class="button-row">
          <button
            type="button"
            class="button button-secondary"
            onClick={() =>
              downloadText(
                'upi-spend-analyzer-settings.json',
                serialiseSettings(settings),
                'application/json',
              )
            }
          >
            <DownloadIcon />
            Export settings
          </button>
          <button
            type="button"
            class="button button-secondary"
            onClick={() => fileRef.current?.click()}
          >
            Import settings
          </button>
          <input
            ref={fileRef}
            class="visually-hidden"
            type="file"
            accept=".json,application/json"
            aria-label="Settings file"
            tabIndex={-1}
            onChange={(event) => {
              const input = event.currentTarget;
              void importSettings(input.files?.[0]);
              input.value = '';
            }}
          />
        </div>
        {importError ? (
          <p class="form-error" role="alert">
            {importError}
          </p>
        ) : null}
        <p class="field-hint">Importing replaces the rules, choices and mappings you have now.</p>

        <div class="danger-zone">
          {confirmDelete ? (
            <>
              <p>
                This removes your rules, category choices and column mappings from this browser and
                puts the default rules back. It cannot be undone.
              </p>
              <div class="button-row">
                <button
                  type="button"
                  class="button button-danger-solid"
                  onClick={() => {
                    store.clear();
                    dispatch({
                      type: 'replace-settings',
                      settings: defaultSettings(),
                      notice: 'Everything stored in this browser was deleted.',
                    });
                    setConfirmDelete(false);
                  }}
                >
                  Yes, delete everything
                </button>
                <button
                  type="button"
                  class="button button-quiet"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep it
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              class="button button-quiet button-danger"
              onClick={() => setConfirmDelete(true)}
            >
              Delete everything stored in this browser
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
