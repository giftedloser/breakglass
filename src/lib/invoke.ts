import { invoke } from '@tauri-apps/api/core';
import { open as openShell } from '@tauri-apps/plugin-shell';
import toast from 'react-hot-toast';
import { Contact, ContactInput, Entry, EntryInput, Folder, FolderInput, RecentItem, SearchHit } from '../types';

export async function openExternal(url: string | null | undefined) {
  if (!url) { toast.error('No URL set'); return; }
  try { await openShell(url); }
  catch (e) { toast.error(String(e)); }
}

export const db = {
  // folders
  listFolders: () => invoke<Folder[]>('list_folders'),
  saveFolder: (folder: FolderInput) => invoke<Folder>('save_folder', { folder }),
  deleteFolder: (id: string) => invoke<boolean>('delete_folder', { id }),
  renameFolder: (id: string, name: string) => invoke<Folder>('rename_folder', { id, name }),
  moveFolder: (id: string, newParentId: string | null) =>
    invoke<Folder>('move_folder', { id, newParentId }),

  // entries
  listEntries: () => invoke<Entry[]>('list_entries'),
  getEntry: (id: string) => invoke<Entry | null>('get_entry', { id }),
  saveEntry: (entry: EntryInput) => invoke<Entry>('save_entry', { entry }),
  deleteEntry: (id: string) => invoke<boolean>('delete_entry', { id }),
  moveEntry: (id: string, newTop: string, newFolderId: string | null) =>
    invoke<Entry>('move_entry', { id, newTop, newFolderId }),
  toggleFavorite: (id: string, item_type: 'entry' | 'contact') =>
    invoke<boolean>('toggle_favorite', { id, itemType: item_type }),

  // contacts
  listContacts: () => invoke<Contact[]>('list_contacts'),
  saveContact: (contact: ContactInput) => invoke<Contact>('save_contact', { contact }),
  deleteContact: (id: string) => invoke<boolean>('delete_contact', { id }),
  moveContact: (id: string, newFolderId: string | null) =>
    invoke<Contact>('move_contact', { id, newFolderId }),

  // search & recents
  searchAll: (query: string) => invoke<SearchHit[]>('search_all', { query }),
  touchRecent: (kind: 'entry' | 'contact', id: string) =>
    invoke<void>('touch_recent', { kind, id }),
  listRecents: () => invoke<RecentItem[]>('list_recents'),

  // import/export
  exportJson: () => invoke<string>('export_json'),
  importJson: (path: string) =>
    invoke<{ folders_imported: number; entries_imported: number; contacts_imported: number }>('import_json', { path }),
};
