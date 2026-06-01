export type TopCategory =
  | 'emergency'
  | 'servers'
  | 'dbs'
  | 'network'
  | 'apps'
  | 'contacts'
  | 'notes'
  | 'howto'
  | 'sitelinks';

export interface Folder {
  id: string;
  parent_id: string | null;
  top_category: TopCategory;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface FolderInput {
  id?: string;
  parent_id: string | null;
  top_category: TopCategory;
  name: string;
}

export interface Entry {
  id: string;
  title: string;
  top_category: TopCategory;
  folder_id: string | null;
  is_favorite: boolean;
  content: string;
  url: string | null;
  tags: string[];
  position: number;
  created_at: string;
  updated_at: string;
}

export interface EntryInput {
  id?: string;
  title: string;
  top_category: TopCategory;
  folder_id: string | null;
  is_favorite: boolean;
  content: string;
  url: string | null;
  tags: string[];
}

export interface Contact {
  id: string;
  folder_id: string | null;
  name: string;
  role: string;
  company: string;
  phone: string;
  email: string;
  notes: string;
  tags: string[];
  is_favorite: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ContactInput {
  id?: string;
  folder_id: string | null;
  name: string;
  role: string;
  company: string;
  phone: string;
  email: string;
  notes: string;
  tags: string[];
  is_favorite: boolean;
}

export interface SearchHit {
  kind: 'entry' | 'contact' | 'folder';
  id: string;
  title: string;
  top_category: TopCategory;
  snippet: string;
  is_favorite: boolean;
  updated_at: string;
}

export interface RecentItem {
  kind: 'entry' | 'contact';
  id: string;
  title: string;
  top_category: TopCategory;
  folder_id: string | null;
  viewed_at: string;
}

export type SelectionTarget =
  | { kind: 'home' }
  | { kind: 'pinned' }
  | { kind: 'top'; top: TopCategory }
  | { kind: 'folder'; folder_id: string }
  | { kind: 'entry'; entry_id: string }
  | { kind: 'contact'; contact_id: string };
