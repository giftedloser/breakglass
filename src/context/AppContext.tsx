import { createContext, ReactNode, useCallback, useContext, useEffect, useReducer } from 'react';
import toast from 'react-hot-toast';
import { CategoryCount, Contact, Entry, SidebarView } from '../types';
import { db } from '../lib/invoke';

interface AppState {
  entries: Entry[];
  contacts: Contact[];
  categoryCounts: CategoryCount[];
  selectedView: SidebarView;
  selectedEntryId: string | null;
  selectedContactId: string | null;
  isLoading: boolean;
  searchOpen: boolean;
  exportDialogOpen: boolean;
  navCollapsed: boolean;
  listCollapsed: boolean;
  activeTag: string | null;
  theme: 'dark' | 'light';
}

type Action =
  | { type: 'SET_VIEW'; view: SidebarView }
  | { type: 'SET_ENTRIES'; entries: Entry[] }
  | { type: 'SET_CONTACTS'; contacts: Contact[] }
  | { type: 'SET_COUNTS'; counts: CategoryCount[] }
  | { type: 'SELECT_ENTRY'; id: string | null }
  | { type: 'SELECT_CONTACT'; id: string | null }
  | { type: 'SET_LOADING'; value: boolean }
  | { type: 'TOGGLE_SEARCH'; value?: boolean }
  | { type: 'TOGGLE_EXPORT_DIALOG'; value?: boolean }
  | { type: 'TOGGLE_NAV'; value?: boolean }
  | { type: 'TOGGLE_LIST'; value?: boolean }
  | { type: 'SET_TAG_FILTER'; tag: string | null }
  | { type: 'TOGGLE_THEME' }
  | { type: 'UPDATE_ENTRY'; entry: Entry }
  | { type: 'REMOVE_ENTRY'; id: string }
  | { type: 'UPDATE_CONTACT'; contact: Contact }
  | { type: 'REMOVE_CONTACT'; id: string };

const initialState: AppState = {
  entries: [],
  contacts: [],
  categoryCounts: [],
  selectedView: 'all',
  selectedEntryId: null,
  selectedContactId: null,
  isLoading: true,
  searchOpen: false,
  exportDialogOpen: false,
  navCollapsed: localStorage.getItem('breakglass-nav-collapsed') === 'true',
  listCollapsed: localStorage.getItem('breakglass-list-collapsed') === 'true',
  activeTag: null,
  theme: (localStorage.getItem('breakglass-theme') as 'dark' | 'light') || 'dark',
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, selectedView: action.view, selectedEntryId: null, selectedContactId: null };
    case 'SET_ENTRIES':
      return { ...state, entries: action.entries };
    case 'SET_CONTACTS':
      return { ...state, contacts: action.contacts };
    case 'SET_COUNTS':
      return { ...state, categoryCounts: action.counts };
    case 'SELECT_ENTRY':
      return { ...state, selectedEntryId: action.id, selectedContactId: null };
    case 'SELECT_CONTACT':
      return { ...state, selectedContactId: action.id, selectedEntryId: null };
    case 'SET_LOADING':
      return { ...state, isLoading: action.value };
    case 'TOGGLE_SEARCH':
      return { ...state, searchOpen: action.value ?? !state.searchOpen };
    case 'TOGGLE_EXPORT_DIALOG':
      return { ...state, exportDialogOpen: action.value ?? !state.exportDialogOpen };
    case 'TOGGLE_NAV': {
      const navCollapsed = action.value ?? !state.navCollapsed;
      localStorage.setItem('breakglass-nav-collapsed', String(navCollapsed));
      return { ...state, navCollapsed };
    }
    case 'TOGGLE_LIST': {
      const listCollapsed = action.value ?? !state.listCollapsed;
      localStorage.setItem('breakglass-list-collapsed', String(listCollapsed));
      return { ...state, listCollapsed };
    }
    case 'SET_TAG_FILTER':
      return { ...state, activeTag: action.tag };
    case 'TOGGLE_THEME': {
      const theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('breakglass-theme', theme);
      document.documentElement.classList.toggle('dark', theme !== 'light');
      return { ...state, theme };
    }
    case 'UPDATE_ENTRY': {
      const exists = state.entries.some((e) => e.id === action.entry.id);
      return { ...state, entries: exists ? state.entries.map((e) => (e.id === action.entry.id ? action.entry : e)) : [action.entry, ...state.entries], selectedEntryId: action.entry.id };
    }
    case 'REMOVE_ENTRY':
      return { ...state, entries: state.entries.filter((e) => e.id !== action.id), selectedEntryId: state.selectedEntryId === action.id ? null : state.selectedEntryId };
    case 'UPDATE_CONTACT': {
      const exists = state.contacts.some((c) => c.id === action.contact.id);
      return { ...state, contacts: exists ? state.contacts.map((c) => (c.id === action.contact.id ? action.contact : c)) : [action.contact, ...state.contacts], selectedContactId: action.contact.id };
    }
    case 'REMOVE_CONTACT':
      return { ...state, contacts: state.contacts.filter((c) => c.id !== action.id), selectedContactId: state.selectedContactId === action.id ? null : state.selectedContactId };
  }
}

const AppContext = createContext<(AppState & { dispatch: React.Dispatch<Action>; refresh: () => Promise<void> }) | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const refresh = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', value: true });
      const [entries, contacts, counts] = await Promise.all([
        db.getEntries({}),
        db.getContacts({}),
        db.getCategoryCounts(),
      ]);
      dispatch({ type: 'SET_ENTRIES', entries });
      dispatch({ type: 'SET_CONTACTS', contacts });
      dispatch({ type: 'SET_COUNTS', counts });
    } catch (error) {
      toast.error(String(error));
    } finally {
      dispatch({ type: 'SET_LOADING', value: false });
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.theme !== 'light');
    void refresh();
  }, [refresh]);

  return <AppContext.Provider value={{ ...state, dispatch, refresh }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
