import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

import type { CategorisedTxn } from '../core/categorise/categoriser';
import type { SafeStore } from '../core/storage/storage';
import type { Action, AppState } from './state';

export interface AppContextValue {
  state: AppState;
  dispatch: (action: Action) => void;
  /** The statement's transactions with categories applied. Empty when no statement is open. */
  txns: CategorisedTxn[];
  store: SafeStore;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside the app');
  return value;
}
