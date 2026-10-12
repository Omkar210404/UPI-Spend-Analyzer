import { useEffect, useMemo, useReducer, useRef } from 'preact/hooks';

import { categoriseAll } from '../core/categorise/categoriser';
import type { SafeStore } from '../core/storage/storage';
import { Header } from './components/Header';
import { AppContext } from './context';
import { initialState, reducer, type AppState } from './state';
import { AboutView } from './views/AboutView';
import { MappingView } from './views/MappingView';
import { OverviewView } from './views/OverviewView';
import { RulesView } from './views/RulesView';
import { SignalsView } from './views/SignalsView';
import { StartView } from './views/StartView';
import { TransactionsView } from './views/TransactionsView';

/** Saves settings whenever they change. Transactions are never written anywhere. */
function usePersistence(state: AppState, store: SafeStore): void {
  const { rules, overrides, profiles } = state.settings;
  useEffect(() => void store.write('rules', rules), [store, rules]);
  useEffect(() => void store.write('overrides', overrides), [store, overrides]);
  useEffect(() => void store.write('profiles', profiles), [store, profiles]);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
    store.write('theme', state.theme);
  }, [store, state.theme]);
}

export function App({ store, initial }: { store: SafeStore; initial: AppState }) {
  const [state, dispatch] = useReducer(reducer, initial);
  usePersistence(state, store);

  const { statement, settings } = state;
  const txns = useMemo(
    () => (statement ? categoriseAll(statement.txns, settings.rules, settings.overrides) : []),
    [statement, settings.rules, settings.overrides],
  );

  // The statement exists only in this tab's memory, so leaving the page loses
  // it. Ask before that happens to a statement the user imported themselves.
  // (The tab is deliberately not kept in the URL: changing the URL makes
  // browsers fetch the page icon again, and this page makes no requests after load.)
  const hasOwnStatement = statement !== null && statement.source !== 'sample';
  useEffect(() => {
    if (!hasOwnStatement) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasOwnStatement]);

  // Move focus to the main heading when the screen changes, so keyboard and
  // screen-reader users land at the top of the new content.
  const screen = state.pending ? 'mapping' : statement ? state.tab : 'start';
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.querySelector<HTMLElement>('h1')?.focus();
    window.scrollTo(0, 0);
  }, [screen]);

  const context = useMemo(() => ({ state, dispatch, txns, store }), [state, txns, store]);

  let view;
  if (state.pending) view = <MappingView />;
  else if (!statement) view = <StartView />;
  else if (state.tab === 'overview') view = <OverviewView />;
  else if (state.tab === 'transactions') view = <TransactionsView />;
  else if (state.tab === 'signals') view = <SignalsView />;
  else if (state.tab === 'rules') view = <RulesView />;
  else view = <AboutView />;

  return (
    <AppContext.Provider value={context}>
      <a class="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main" ref={mainRef} class="page" tabIndex={-1}>
        {view}
      </main>
      <footer class="footer">
        <p>
          UPI Spend Analyzer runs entirely in this browser tab. It reports what a statement contains
          and how each figure was worked out. It is not financial advice.
        </p>
      </footer>
      <div class="visually-hidden" role="status" aria-live="polite">
        {state.notice}
      </div>
    </AppContext.Provider>
  );
}

export { initialState };
