export interface Entry {
  id: string;
  title: string;
  category: Category;
  status: EntryStatus;
  severity: Severity;
  is_favorite: boolean;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface EntryInput {
  id?: string;
  title: string;
  category: Category;
  status: EntryStatus;
  severity: Severity;
  is_favorite: boolean;
  content: string;
  tags: string[];
}

export interface Contact {
  id: string;
  name: string;
  role: string;
  company: string;
  phone: string;
  email: string;
  notes: string;
  tags: string[];
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContactInput {
  id?: string;
  name: string;
  role: string;
  company: string;
  phone: string;
  email: string;
  notes: string;
  tags: string[];
  is_favorite: boolean;
}

export interface SearchResult {
  id: string;
  title: string;
  category: Category;
  snippet: string;
  status: EntryStatus;
  severity: Severity;
  is_favorite: boolean;
  updated_at: string;
}

export interface CategoryCount {
  category: Category;
  count: number;
  draft_count: number;
  in_progress_count: number;
}

export type Category = 'emergency' | 'runbooks' | 'apps' | 'contacts' | 'network' | 'servers' | 'security' | 'vendors' | 'notes';
export type EntryStatus = 'active' | 'in_progress' | 'draft';
export type Severity = 'info' | 'warning' | 'critical';
export type SidebarView = 'all' | 'favorites' | 'in_progress' | 'drafts' | Category;
