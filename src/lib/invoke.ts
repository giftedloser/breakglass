import { invoke } from '@tauri-apps/api/core';
import { open as openShell } from '@tauri-apps/plugin-shell';
import toast from 'react-hot-toast';
import { App, AppInput, Attachment, AttachmentParent, Contact, ContactInput, Entry, EntryInput, Folder, FolderInput, RecentItem, SearchHit } from '../types';

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
  toggleFavorite: (id: string, item_type: 'entry' | 'contact' | 'app') =>
    invoke<boolean>('toggle_favorite', { id, itemType: item_type }),

  // contacts
  listContacts: () => invoke<Contact[]>('list_contacts'),
  saveContact: (contact: ContactInput) => invoke<Contact>('save_contact', { contact }),
  deleteContact: (id: string) => invoke<boolean>('delete_contact', { id }),
  moveContact: (id: string, newFolderId: string | null) =>
    invoke<Contact>('move_contact', { id, newFolderId }),

  // apps
  listApps: () => invoke<App[]>('list_apps'),
  saveApp: (app: AppInput) => invoke<App>('save_app', { app }),
  deleteApp: (id: string, cascadeEntries: boolean) =>
    invoke<boolean>('delete_app', { id, cascadeEntries }),
  moveApp: (id: string, newFolderId: string | null) =>
    invoke<App>('move_app', { id, newFolderId }),

  // search & recents
  searchAll: (query: string) => invoke<SearchHit[]>('search_all', { query }),
  touchRecent: (kind: 'entry' | 'contact' | 'app', id: string) =>
    invoke<void>('touch_recent', { kind, id }),
  listRecents: () => invoke<RecentItem[]>('list_recents'),

  // attachments
  listAttachments: (parentKind: AttachmentParent, parentId: string) =>
    invoke<Attachment[]>('list_attachments', { parentKind, parentId }),
  addAttachment: (parentKind: AttachmentParent, parentId: string, filename: string, mimeType: string, dataBase64: string) =>
    invoke<Attachment>('add_attachment', { parentKind, parentId, filename, mimeType, dataBase64 }),
  deleteAttachment: (id: string) => invoke<boolean>('delete_attachment', { id }),
  saveAttachmentTo: (id: string, destPath: string) =>
    invoke<string>('save_attachment_to', { id, destPath }),
  readAttachmentB64: (id: string) => invoke<string>('read_attachment_b64', { id }),

  // demo / import / export
  seedDemoData: () => invoke<{ ok: boolean }>('seed_demo_data'),
  categoryCounts: () => invoke<Record<string, number>>('category_counts'),
  exportCategory: (category: string) => invoke<string>('export_category', { category }),
  importCategory: (category: string, path: string) =>
    invoke<{ folders: number; entries: number; contacts: number; apps: number; attachments: number }>('import_category', { category, path }),
  exportJson: () => invoke<string>('export_json'),
  importJson: (path: string) =>
    invoke<{ folders_imported: number; apps_imported: number; entries_imported: number; contacts_imported: number }>('import_json', { path }),
};
