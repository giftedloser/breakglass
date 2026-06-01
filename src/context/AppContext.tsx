import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import toast from 'react-hot-toast';
import { Contact, Entry, Folder, RecentItem, SelectionTarget, TopCategory } from '../types';
import { db } from '../lib/invoke';

interface AppState {
  folders: Folder[];
  entries: Entry[];
  contacts: Contact[];
  recents: RecentItem[];
  selection: SelectionTarget;
  expanded: Record<string, boolean>; // folder/top ids that are open in the sidebar
  searchOpen: boolean;
  exportOpen: boolean;
  theme: 'dark' | 'light';
  isLoading: boolean;
}

type Action =
  | { type: 'SET_DATA'; folders: Folder[]; entries: Entry[]; contacts: Contact[]; recents: RecentItem[] }
  | { type: 'SET_RECENTS'; recents: RecentItem[] }
  | { type: 'SELECT'; target: SelectionTarget }
  | { type: 'TOGGLE_EXPANDED'; id: string; value?: boolean }
  | { type: 'EXPAND_PATH'; ids: string[] }
  | { type: 'TOGGLE_SEARCH'; value?: boolean }
  | { type: 'TOGGLE_EXPORT'; value?: boolean }
  | { type: 'TOGGLE_THEME' }
  | { type: 'SET_LOADING'; value: boolean }
  | { type: 'UPSERT_FOLDER'; folder: Folder }
  | { type: 'REMOVE_FOLDER'; id: string }
  | { type: 'UPSERT_ENTRY'; entry: Entry }
  | { type: 'REMOVE_ENTRY'; id: string }
  | { type: 'UPSERT_CONTACT'; contact: Contact }
  | { type: 'REMOVE_CONTACT'; id: string };

const initial: AppState = {
  folders: [],
  entries: [],
  contacts: [],
  recents: [],
  selection: { kind: 'home' },
  expanded: JSON.parse(localStorage.getItem('bg-expanded') || '{}'),
  searchOpen: false,
  exportOpen: false,
  theme: (localStorage.getItem('bg-theme') as 'dark' | 'light') || 'dark',
  isLoading: true,
};

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'SET_DATA':
      return { ...s, folders: a.folders, entries: a.entries, contacts: a.contacts, recents: a.recents };
    case 'SET_RECENTS':
      return { ...s, recents: a.recents };
    case 'SELECT':
      return { ...s, selection: a.target };
    case 'TOGGLE_EXPANDED': {
      const next = { ...s.expanded, [a.id]: a.value ?? !s.expanded[a.id] };
      localStorage.setItem('bg-expanded', JSON.stringify(next));
      return { ...s, expanded: next };
    }
    case 'EXPAND_PATH': {
      const next = { ...s.expanded };
      for (const id of a.ids) next[id] = true;
      localStorage.setItem('bg-expanded', JSON.stringify(next));
      return { ...s, expanded: next };
    }
    case 'TOGGLE_SEARCH':
      return { ...s, searchOpen: a.value ?? !s.searchOpen };
    case 'TOGGLE_EXPORT':
      return { ...s, exportOpen: a.value ?? !s.exportOpen };
    case 'TOGGLE_THEME': {
      const theme = s.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('bg-theme', theme);
      document.documentElement.classList.toggle('dark', theme === 'dark');
      return { ...s, theme };
    }
    case 'SET_LOADING':
      return { ...s, isLoading: a.value };
    case 'UPSERT_FOLDER': {
      const exists = s.folders.some((f) => f.id === a.folder.id);
      return { ...s, folders: exists ? s.folders.map((f) => f.id === a.folder.id ? a.folder : f) : [...s.folders, a.folder] };
    }
    case 'REMOVE_FOLDER': {
      const removeIds = new Set<string>([a.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const f of s.folders) {
          if (f.parent_id && removeIds.has(f.parent_id) && !removeIds.has(f.id)) {
            removeIds.add(f.id);
            changed = true;
          }
        }
      }
      return {
        ...s,
        folders: s.folders.filter((f) => !removeIds.has(f.id)),
        entries: s.entries.map((e) => removeIds.has(e.folder_id || '') ? { ...e, folder_id: null } : e),
        contacts: s.contacts.map((c) => removeIds.has(c.folder_id || '') ? { ...c, folder_id: null } : c),
      };
    }
    case 'UPSERT_ENTRY': {
      const exists = s.entries.some((e) => e.id === a.entry.id);
      return { ...s, entries: exists ? s.entries.map((e) => e.id === a.entry.id ? a.entry : e) : [a.entry, ...s.entries] };
    }
    case 'REMOVE_ENTRY':
      return { ...s, entries: s.entries.filter((e) => e.id !== a.id), selection: matchesEntry(s.selection, a.id) ? { kind: 'home' } : s.selection };
    case 'UPSERT_CONTACT': {
      const exists = s.contacts.some((c) => c.id === a.contact.id);
      return { ...s, contacts: exists ? s.contacts.map((c) => c.id === a.contact.id ? a.contact : c) : [a.contact, ...s.contacts] };
    }
    case 'REMOVE_CONTACT':
      return { ...s, contacts: s.contacts.filter((c) => c.id !== a.id), selection: matchesContact(s.selection, a.id) ? { kind: 'home' } : s.selection };
  }
}

function matchesEntry(sel: SelectionTarget, id: string) {
  return sel.kind === 'entry' && sel.entry_id === id;
}
function matchesContact(sel: SelectionTarget, id: string) {
  return sel.kind === 'contact' && sel.contact_id === id;
}

interface Ctx extends AppState {
  dispatch: React.Dispatch<Action>;
  refresh: () => Promise<void>;
  selectEntry: (id: string) => Promise<void>;
  selectContact: (id: string) => Promise<void>;
  selectFolder: (id: string) => void;
  selectTop: (top: TopCategory) => void;
  goHome: () => void;
}

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  const refresh = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', value: true });
      const [folders, entries, contacts, recents] = await Promise.all([
        db.listFolders(), db.listEntries(), db.listContacts(), db.listRecents(),
      ]);
      dispatch({ type: 'SET_DATA', folders, entries, contacts, recents });
    } catch (err) {
      toast.error(String(err));
    } finally {
      dispatch({ type: 'SET_LOADING', value: false });
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
    void refresh();
  }, [refresh]);

  const selectEntry = useCallback(async (id: string) => {
    dispatch({ type: 'SELECT', target: { kind: 'entry', entry_id: id } });
    try {
      await db.touchRecent('entry', id);
      const recents = await db.listRecents();
      dispatch({ type: 'SET_RECENTS', recents });
    } catch {/* ignore */}
  }, []);

  const selectContact = useCallback(async (id: string) => {
    dispatch({ type: 'SELECT', target: { kind: 'contact', contact_id: id } });
    try {
      await db.touchRecent('contact', id);
      const recents = await db.listRecents();
      dispatch({ type: 'SET_RECENTS', recents });
    } catch {/* ignore */}
  }, []);

  const selectFolder = useCallback((id: string) => {
    dispatch({ type: 'SELECT', target: { kind: 'folder', folder_id: id } });
  }, []);

  const selectTop = useCallback((top: TopCategory) => {
    dispatch({ type: 'SELECT', target: { kind: 'top', top } });
  }, []);

  const goHome = useCallback(() => {
    dispatch({ type: 'SELECT', target: { kind: 'home' } });
  }, []);

  const value = useMemo<Ctx>(() => ({
    ...state, dispatch, refresh, selectEntry, selectContact, selectFolder, selectTop, goHome,
  }), [state, refresh, selectEntry, selectContact, selectFolder, selectTop, goHome]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
