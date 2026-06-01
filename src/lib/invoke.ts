import { invoke } from '@tauri-apps/api/core';
import { CategoryCount, Contact, ContactInput, Entry, EntryInput, SearchResult } from '../types';

export const db = {
  getEntries: ({ favorites_only = false, ...args }: { category?: string; status?: string; favorites_only?: boolean; tag?: string }) =>
    invoke<Entry[]>('get_entries', { favoritesOnly: favorites_only, ...args }),
  getEntry: (id: string) => invoke<Entry | null>('get_entry', { id }),
  saveEntry: (entry: EntryInput) => invoke<Entry>('save_entry', { entry }),
  deleteEntry: (id: string) => invoke<boolean>('delete_entry', { id }),
  toggleFavorite: (id: string, item_type: 'entry' | 'contact') => invoke<boolean>('toggle_favorite', { id, itemType: item_type }),
  cycleStatus: (id: string) => invoke<string>('cycle_status', { id }),
  searchEntries: (query: string) => invoke<SearchResult[]>('search_entries', { query }),
  getCategoryCounts: () => invoke<CategoryCount[]>('get_category_counts'),
  getContacts: ({ favorites_only = false, ...args }: { favorites_only?: boolean; tag?: string }) =>
    invoke<Contact[]>('get_contacts', { favoritesOnly: favorites_only, ...args }),
  saveContact: (contact: ContactInput) => invoke<Contact>('save_contact', { contact }),
  deleteContact: (id: string) => invoke<boolean>('delete_contact', { id }),
  exportJson: () => invoke<string>('export_json'),
  importJson: (path: string) => invoke<{ entries_imported: number; contacts_imported: number }>('import_json', { path }),
};
