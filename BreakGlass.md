# OpsDesk — Full Build Prompt for Codex

## What you are building

A single-user, offline-first Windows desktop app called **OpsDesk**. It is a personal IT emergency runbook and reference tool for a working IT admin. This is not a prototype. Build every file completely with no stubs, no placeholder comments, no TODOs. Every feature described below must work end-to-end when the app launches.

The user is a Windows IT admin who may open this app at 2 AM while something is on fire. The app must be fast, readable at a glance, and keyboard-friendly.

---

## Tech stack — use exactly these, no substitutions

| Layer | Package / version |
|---|---|
| Desktop shell | `tauri` v2 (latest stable) |
| Rust backend | Rust 2021 edition |
| SQLite | `rusqlite` crate with `bundled` feature — do NOT use tauri-plugin-sql |
| Frontend | React 18 + TypeScript 5 |
| Build tool | Vite 5 |
| Styling | Tailwind CSS v3 with `tailwind-merge` and `clsx` |
| Rich text editor | TipTap 2 (`@tiptap/react`, `@tiptap/starter-kit`, and extensions listed below) |
| Icons | `lucide-react` |
| Toasts | `react-hot-toast` |
| Date formatting | `date-fns` |
| UUID | `uuid` (npm) on the frontend for generating IDs before sending to Rust |
| State management | React context + `useReducer` — no Redux, no Zustand |

---

## Project scaffold — run these commands first

```bash
npm create tauri-app@latest opsdesk -- --template react-ts
cd opsdesk
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-image \
  @tiptap/extension-link @tiptap/extension-highlight @tiptap/extension-table \
  @tiptap/extension-table-row @tiptap/extension-table-cell \
  @tiptap/extension-table-header @tiptap/extension-placeholder \
  @tiptap/extension-character-count @tiptap/extension-color \
  @tiptap/extension-text-style \
  lucide-react react-hot-toast date-fns uuid clsx tailwind-merge
npm install -D tailwindcss postcss autoprefixer @types/uuid
npx tailwindcss init -p
```

`Cargo.toml` dependencies:
```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
rusqlite = { version = "0.31", features = ["bundled"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
once_cell = "1"
```

---

## Complete file listing — generate ALL of these in full

### Rust backend

#### `src-tauri/src/main.rs`
```rust
// Entry point. Initialize the database, register all commands, build and run the Tauri app.
// Call db::init() before app.run(). 
// Use manage() to share the DB connection pool (wrap rusqlite::Connection in 
// a Mutex<Connection> stored via tauri::State).
// Register every command from commands.rs.
// Enable the shell plugin for opening links.
// Set the window to 1280x800 minimum size, resizable, with title "OpsDesk".
```

Implement it fully — no stubs.

#### `src-tauri/src/db.rs`

Implement `pub fn init(app_handle: &tauri::AppHandle) -> rusqlite::Connection`.

- Resolve the DB path via `app_handle.path().app_data_dir()` + `"opsdesk.db"`
- Create the directory if it doesn't exist
- Open the SQLite connection with `rusqlite::Connection::open(path)`
- Run all migrations in a single transaction using a `user_version` PRAGMA for versioning
- Return the open connection

Migration 1 — create all tables:

```sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS entries (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  category     TEXT NOT NULL CHECK(category IN ('runbooks','contacts','network','servers','security','vendors','notes')),
  status       TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('active','in_progress','draft')),
  severity     TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info','warning','critical')),
  is_favorite  INTEGER NOT NULL DEFAULT 0,
  content      TEXT NOT NULL DEFAULT '{}',
  tags         TEXT NOT NULL DEFAULT '[]',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT '',
  company      TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  tags         TEXT NOT NULL DEFAULT '[]',
  is_favorite  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id           TEXT PRIMARY KEY,
  entry_id     TEXT NOT NULL,
  filename     TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  data         BLOB NOT NULL,
  created_at   TEXT NOT NULL,
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
  id UNINDEXED,
  title,
  content_text,
  tags_flat,
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS entries_fts_insert AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(id, title, content_text, tags_flat)
  VALUES (new.id, new.title, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS entries_fts_update AFTER UPDATE ON entries BEGIN
  UPDATE entries_fts SET title=new.title, content_text=new.content, tags_flat=new.tags
  WHERE id=new.id;
END;

CREATE TRIGGER IF NOT EXISTS entries_fts_delete AFTER DELETE ON entries BEGIN
  DELETE FROM entries_fts WHERE id=old.id;
END;

CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(category);
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
CREATE INDEX IF NOT EXISTS idx_entries_favorite ON entries(is_favorite);
CREATE INDEX IF NOT EXISTS idx_entries_updated ON entries(updated_at DESC);
```

#### `src-tauri/src/models.rs`

Define these structs, all `#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]`:

```rust
pub struct Entry {
    pub id: String,
    pub title: String,
    pub category: String,
    pub status: String,
    pub severity: String,
    pub is_favorite: bool,
    pub content: String,      // TipTap JSON string
    pub tags: Vec<String>,    // parsed from JSON column
    pub created_at: String,
    pub updated_at: String,
}

pub struct EntryInput {
    pub id: Option<String>,   // None = new entry, Some = update
    pub title: String,
    pub category: String,
    pub status: String,
    pub severity: String,
    pub is_favorite: bool,
    pub content: String,
    pub tags: Vec<String>,
}

pub struct Contact {
    pub id: String,
    pub name: String,
    pub role: String,
    pub company: String,
    pub phone: String,
    pub email: String,
    pub notes: String,
    pub tags: Vec<String>,
    pub is_favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

pub struct ContactInput {
    pub id: Option<String>,
    pub name: String,
    pub role: String,
    pub company: String,
    pub phone: String,
    pub email: String,
    pub notes: String,
    pub tags: Vec<String>,
    pub is_favorite: bool,
}

pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub category: String,
    pub snippet: String,
    pub status: String,
    pub severity: String,
    pub is_favorite: bool,
    pub updated_at: String,
}

pub struct CategoryCount {
    pub category: String,
    pub count: i64,
    pub draft_count: i64,
    pub in_progress_count: i64,
}

pub struct ExportData {
    pub version: u32,
    pub exported_at: String,
    pub entries: Vec<Entry>,
    pub contacts: Vec<Contact>,
}
```

All tags columns are stored as JSON arrays in SQLite (`TEXT`). Helper functions: `parse_tags(s: &str) -> Vec<String>` and `serialize_tags(tags: &[String]) -> String` using `serde_json`.

#### `src-tauri/src/commands.rs`

Implement every function below as `#[tauri::command]`. All return `Result<T, String>` — map all rusqlite errors to `String` via `.map_err(|e| e.to_string())`. State is `tauri::State<'_, Mutex<rusqlite::Connection>>`.

```rust
// --- Entries ---

// Returns all entries matching filters. favorites_only pins favorites first.
// Sort: is_favorite DESC, updated_at DESC always.
pub fn get_entries(
    state: State<Mutex<Connection>>,
    category: Option<String>,
    status: Option<String>,
    favorites_only: bool,
    tag: Option<String>,
) -> Result<Vec<Entry>, String>

// Returns a single entry by id
pub fn get_entry(
    state: State<Mutex<Connection>>,
    id: String,
) -> Result<Option<Entry>, String>

// Upsert: if entry.id is None, generate a UUID and INSERT.
// If entry.id is Some, UPDATE. Set updated_at = now(). Return the saved entry.
pub fn save_entry(
    state: State<Mutex<Connection>>,
    entry: EntryInput,
) -> Result<Entry, String>

// Hard delete. Returns true if a row was deleted.
pub fn delete_entry(
    state: State<Mutex<Connection>>,
    id: String,
) -> Result<bool, String>

// Toggle is_favorite. Returns the new boolean value.
pub fn toggle_favorite(
    state: State<Mutex<Connection>>,
    id: String,
    item_type: String,  // "entry" or "contact"
) -> Result<bool, String>

// Cycle status: draft -> in_progress -> active -> draft. Returns new status string.
pub fn cycle_status(
    state: State<Mutex<Connection>>,
    id: String,
) -> Result<String, String>

// FTS search across entries. Returns up to 50 results ranked by bm25.
// Snippet is ~120 chars of context around the match.
pub fn search_entries(
    state: State<Mutex<Connection>>,
    query: String,
) -> Result<Vec<SearchResult>, String>

// Returns count per category plus draft and in_progress sub-counts
pub fn get_category_counts(
    state: State<Mutex<Connection>>,
) -> Result<Vec<CategoryCount>, String>

// --- Contacts ---

pub fn get_contacts(
    state: State<Mutex<Connection>>,
    favorites_only: bool,
    tag: Option<String>,
) -> Result<Vec<Contact>, String>

pub fn save_contact(
    state: State<Mutex<Connection>>,
    contact: ContactInput,
) -> Result<Contact, String>

pub fn delete_contact(
    state: State<Mutex<Connection>>,
    id: String,
) -> Result<bool, String>

// --- Import / Export ---

// Serialize all entries and contacts to JSON string, write to user-chosen path via dialog.
// Returns the path written to.
pub fn export_json(
    app: tauri::AppHandle,
    state: State<Mutex<Connection>>,
) -> Result<String, String>

// Read JSON from path, validate version field, then upsert all entries and contacts.
// Returns counts: { entries_imported, contacts_imported }
pub fn import_json(
    state: State<Mutex<Connection>>,
    path: String,
) -> Result<serde_json::Value, String>
```

---

### Frontend

#### `src/types/index.ts`

```ts
export interface Entry {
  id: string;
  title: string;
  category: Category;
  status: EntryStatus;
  severity: Severity;
  is_favorite: boolean;
  content: string;          // TipTap JSON string
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

export type Category = 'runbooks' | 'contacts' | 'network' | 'servers' | 'security' | 'vendors' | 'notes';
export type EntryStatus = 'active' | 'in_progress' | 'draft';
export type Severity = 'info' | 'warning' | 'critical';
export type SidebarView = 'all' | 'favorites' | 'in_progress' | 'drafts' | Category;
```

#### `src/lib/categories.ts`

```ts
import { Category } from '../types';

export const CATEGORIES = [
  { id: 'runbooks'  as Category, label: 'Runbooks',          icon: 'BookOpen',    color: 'blue',   tw: 'border-blue-500',   badge: 'bg-blue-500/20 text-blue-300'   },
  { id: 'contacts'  as Category, label: 'Contacts',          icon: 'Phone',       color: 'green',  tw: 'border-green-500',  badge: 'bg-green-500/20 text-green-300' },
  { id: 'network'   as Category, label: 'Network',           icon: 'Network',     color: 'violet', tw: 'border-violet-500', badge: 'bg-violet-500/20 text-violet-300'},
  { id: 'servers'   as Category, label: 'Servers & Services',icon: 'Server',      color: 'orange', tw: 'border-orange-500', badge: 'bg-orange-500/20 text-orange-300'},
  { id: 'security'  as Category, label: 'Security',          icon: 'ShieldAlert', color: 'red',    tw: 'border-red-500',    badge: 'bg-red-500/20 text-red-300'     },
  { id: 'vendors'   as Category, label: 'Vendors & Support', icon: 'Headset',     color: 'teal',   tw: 'border-teal-500',   badge: 'bg-teal-500/20 text-teal-300'   },
  { id: 'notes'     as Category, label: 'Notes & How-Tos',   icon: 'StickyNote',  color: 'yellow', tw: 'border-yellow-500', badge: 'bg-yellow-500/20 text-yellow-300'},
] as const;

export const getCategoryMeta = (id: Category) => CATEGORIES.find(c => c.id === id)!;
```

#### `src/lib/invoke.ts`

Typed wrappers for all Tauri commands using `@tauri-apps/api/core`'s `invoke`. Every function must have full TypeScript types matching the Rust command signatures. No `any` types. Example:

```ts
import { invoke } from '@tauri-apps/api/core';
import { Entry, EntryInput, Contact, ContactInput, SearchResult, CategoryCount } from '../types';

export const db = {
  getEntries: (args: { category?: string; status?: string; favorites_only?: boolean; tag?: string }) =>
    invoke<Entry[]>('get_entries', args),
  getEntry: (id: string) => invoke<Entry | null>('get_entry', { id }),
  saveEntry: (entry: EntryInput) => invoke<Entry>('save_entry', { entry }),
  deleteEntry: (id: string) => invoke<boolean>('delete_entry', { id }),
  toggleFavorite: (id: string, item_type: 'entry' | 'contact') => invoke<boolean>('toggle_favorite', { id, item_type }),
  cycleStatus: (id: string) => invoke<string>('cycle_status', { id }),
  searchEntries: (query: string) => invoke<SearchResult[]>('search_entries', { query }),
  getCategoryCounts: () => invoke<CategoryCount[]>('get_category_counts'),
  getContacts: (args: { favorites_only?: boolean; tag?: string }) => invoke<Contact[]>('get_contacts', args),
  saveContact: (contact: ContactInput) => invoke<Contact>('save_contact', { contact }),
  deleteContact: (id: string) => invoke<boolean>('delete_contact', { id }),
  exportJson: () => invoke<string>('export_json'),
  importJson: (path: string) => invoke<{ entries_imported: number; contacts_imported: number }>('import_json', { path }),
};
```

#### `src/lib/utils.ts`

```ts
// formatRelativeDate(iso: string): string  — "just now" / "2 hours ago" / "3 days ago" / "Jan 5" using date-fns
// cn(...classes): string  — clsx + tailwind-merge helper
// extractPlainText(tiptapJson: string): string  — recursively walks TipTap JSON nodes and returns plain text for display/FTS
// truncate(s: string, n: number): string
// copyToClipboard(text: string): Promise<void>  — uses navigator.clipboard.writeText
```

Implement all functions fully.

#### `src/context/AppContext.tsx`

Single global context wrapping the entire app. State shape:

```ts
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
  activeTag: string | null;
  theme: 'dark' | 'light';
}
```

Actions (useReducer): `SET_VIEW`, `SET_ENTRIES`, `SET_CONTACTS`, `SET_COUNTS`, `SELECT_ENTRY`, `SELECT_CONTACT`, `SET_LOADING`, `TOGGLE_SEARCH`, `TOGGLE_EXPORT_DIALOG`, `SET_TAG_FILTER`, `TOGGLE_THEME`, `UPDATE_ENTRY`, `REMOVE_ENTRY`, `UPDATE_CONTACT`, `REMOVE_CONTACT`.

Expose `dispatch` and all state fields via context. Include a `useApp()` hook that throws if used outside the provider.

On mount, load all entries, contacts, and category counts from Tauri and populate state.

---

## Component specifications — implement every component fully

### `src/App.tsx`

Top-level layout. Renders:
- `<Toaster />` from react-hot-toast (position: bottom-right, dark theme)
- `<SearchModal />` (conditionally rendered when `searchOpen`)
- `<ExportDialog />` (conditionally rendered when `exportDialogOpen`)
- Three-column layout: `<Sidebar />` | `<EntryList />` | `<DetailPane />`
- Keyboard listener: Ctrl+K → open search, Ctrl+N → create new entry in current category, Ctrl+S → save current entry (emit a custom event that DetailPane listens to)

Layout CSS: `flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden`

---

### `src/components/Sidebar.tsx`

Fixed 220px left panel. Background `bg-zinc-900` with right border `border-zinc-800`.

Top section:
- App logo/name: "OpsDesk" in `text-zinc-100 font-semibold text-lg` with a `Shield` lucide icon in blue, 16px padding

Quick filters section (no section header):
- "All Entries" — `LayoutDashboard` icon, total count badge
- "⭐ Favorites" — `Star` icon, favorites count
- "In Progress" — `Clock` icon, total in_progress count (summed across categories)  
- "Drafts" — `FileEdit` icon, total draft count

Divider, then "CATEGORIES" section header in `text-zinc-500 text-xs uppercase tracking-wider`.

For each of the 7 categories, render a sidebar item:
- Category icon (lucide, 16px)
- Category label
- Count badge (total entries) on the right in `text-zinc-500 text-xs`
- Active state: `bg-zinc-800` background, left border in the category accent color, label in `text-zinc-100`
- Inactive: `text-zinc-400` label, hover `bg-zinc-800/50`

Bottom of sidebar: a small "Dark / Light" theme toggle button with `Sun`/`Moon` icon.

---

### `src/components/EntryList.tsx`

320px middle column. Background `bg-zinc-900/50` with right border `border-zinc-800`.

Header area:
- Current view title (e.g. "Runbooks", "All Entries") in `font-medium text-zinc-200`
- Entry count in `text-zinc-500 text-sm`
- "+ New" button: `bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-1 rounded-md`

Search bar (local filter within current view):
- Input with `Search` icon, placeholder "Filter entries..."
- Filters the visible list in real time (client-side, no Tauri call)
- `bg-zinc-800 border-zinc-700 text-zinc-200 rounded-md`

Sort/filter row:
- Dropdown for sort: "Updated (newest)", "Updated (oldest)", "A–Z", "Status"  
- Active tag filter chip (shown when `activeTag` is set) with an X to clear it

Entry list: scrollable `overflow-y-auto`. Renders `<EntryCard />` for each entry. If the view is `contacts`, render a contact-optimized list instead. Empty state: centered icon + "No entries yet" + "+ Add your first entry" button.

---

### `src/components/EntryCard.tsx`

Props: `entry: Entry`, `isSelected: boolean`, `onClick: () => void`

Card layout (no outer border-radius, left-border accent):
```
┌─[4px category color border]──────────────────────┐
│ [severity dot]  [Title text bold]        [★]     │
│ [STATUS badge]  [CATEGORY badge]                  │
│ [tag pill] [tag pill] [+N more]                   │
│                                        [rel date] │
└───────────────────────────────────────────────────┘
```

- Selected state: `bg-zinc-800` background
- Unselected: `bg-transparent hover:bg-zinc-800/60`
- Severity dot: 8px circle — red for critical, amber for warning, hidden for info
- Status badge: `text-[10px] uppercase font-medium px-1.5 py-0.5 rounded` — green/amber/zinc colors
- Category badge: same size, category color
- Star: `Star` icon, filled yellow when favorite. Clicking it calls `toggleFavorite` immediately without re-selecting the card (stopPropagation)
- Tags: each tag is `bg-zinc-700 text-zinc-300 text-[10px] px-1.5 py-0.5 rounded-full cursor-pointer`. Clicking a tag sets `activeTag` filter in context

---

### `src/components/DetailPane.tsx`

Flex-fill right panel. Two modes: **read** and **edit**. Starts in read mode.

**Empty state** (no entry selected):
- Centered: `Shield` icon in blue, "Select an entry to view it" in `text-zinc-500`

**Read mode header:**
```
[← back on mobile]   [Title h1]                    [Edit] [Delete] [⋮ more]
[STATUS badge clickable]  [SEVERITY badge]  [CATEGORY badge]
[tag pills]
[Updated: rel date]  [Created: rel date]
```

Clicking the STATUS badge cycles it (calls `cycle_status` command, updates state). No edit form needed.

The `[⋮ more]` dropdown menu contains: "Duplicate entry", "Change severity" submenu (Info / Warning / Critical).

**Read mode body:**
- Renders TipTap content as read-only (`editable={false}`)
- The same TipTap editor component, just with `editable={false}` and no toolbar

**Edit mode:**
- Title becomes a plain text `input` (full width, `text-2xl font-bold bg-transparent border-b border-zinc-700`)
- Status, severity, category selectable via small inline dropdowns in the header
- Tags: inline tag editor — existing tags shown as deletable pills, click "+ Add tag" to type a new one (Enter or comma to confirm)
- TipTap editor with toolbar (editable)
- Save button (Ctrl+S also triggers): calls `save_entry`, shows toast "Saved ✓", switches back to read mode
- Cancel button: reverts all changes, switches back to read mode
- Unsaved changes indicator: small dot on the Edit button when content has changed

**Contacts detail view** (when `category === 'contacts'`):
- Skip TipTap entirely
- Show contact fields in a structured card layout
- Phone and email: click to copy, shows "Copied!" toast
- Notes field: plain `<pre>` with `whitespace-pre-wrap`

---

### `src/components/Editor.tsx`

TipTap editor wrapper. Props: `content: string`, `onChange: (json: string) => void`, `editable: boolean`, `placeholder?: string`

Extensions to configure:

```ts
StarterKit.configure({ codeBlock: { languageClassPrefix: 'language-' } })
Image.configure({ inline: false, allowBase64: true })
Link.configure({ openOnClick: false })  // we handle clicks manually
Highlight.configure({ multicolor: false })
Table.configure({ resizable: true })
TableRow
TableHeader
TableCell
Placeholder.configure({ placeholder: props.placeholder ?? 'Start writing...' })
CharacterCount
Color
TextStyle
```

**Clipboard image paste handler:** Add a custom ProseMirror plugin that intercepts paste events. If `event.clipboardData.files` contains an image, read it as base64 with `FileReader`, then insert it as a TipTap Image node with `src="data:image/png;base64,..."`. This must work without any file system access — pure base64 inline.

**Link click handler:** Add an `onClick` handler on the editor container. Walk the DOM to find if the click target is inside an `<a>` tag. If yes, call `open(href)` from `@tauri-apps/plugin-shell` to open in the system browser.

**Toolbar** (shown only when `editable === true`):

```
[B] [I] [H1] [H2] [H3] [—] | [• List] [1. List] [✓ Task] | [< Code] [❝ Quote] | [⊞ Table] [🔗 Link] [📷 Image] | [Highlight] | [Undo] [Redo]
```

Each toolbar button: `bg-zinc-800 hover:bg-zinc-700 text-zinc-300 p-1.5 rounded text-sm`. Active (isActive) state: `bg-zinc-700 text-zinc-100`.

For the Link button: show a small inline popover with an `<input>` for the URL and a "Set Link" button.

For the Image button: open a native file dialog via Tauri's `open()` from `@tauri-apps/plugin-dialog`, read the file as base64, insert as Image node.

Show character count in the bottom-right of the editor area: `{chars} chars · {words} words` in `text-zinc-600 text-xs`.

**Code blocks** must use a monospace font (`font-mono`) and have a language label in the top-right corner and a "Copy" button.

---

### `src/components/ContactCard.tsx` and `src/components/ContactsGrid.tsx`

`ContactsGrid` renders contacts in a 2-column CSS grid (`grid-cols-2 gap-3`).

Each `ContactCard`:
```
┌─────────────────────────────────────────┐
│ [name bold]                          [★] │
│ [role text-zinc-400]                     │
│ [company text-zinc-500 text-sm]          │
├─────────────────────────────────────────┤
│ 📞 [phone]                    [Copy]     │
│ ✉  [email]                    [Copy]     │
├─────────────────────────────────────────┤
│ [notes text-sm text-zinc-400 line-clamp-2]│
│ [tag] [tag]                              │
│                         [Edit] [Delete]  │
└─────────────────────────────────────────┘
```

Copy button: copies to clipboard, shows toast "Phone copied" or "Email copied". 

---

### `src/components/ContactForm.tsx`

Modal dialog (overlay + centered card) for adding/editing a contact.

Fields: Name (required), Role, Company, Phone, Email, Notes (textarea), Tags (same inline tag editor as entries), Favorite toggle.

Validate: Name must not be empty. Phone and email: no strict validation, just trim whitespace. 

Save button calls `save_contact`, dispatches `UPDATE_CONTACT` or adds to contacts list, shows toast "Contact saved", closes modal.

---

### `src/components/SearchModal.tsx`

Full-screen overlay (`bg-zinc-950/80 backdrop-blur-sm`) with a centered search panel (`bg-zinc-900 rounded-xl shadow-2xl w-full max-w-2xl`).

Input at top: magnifier icon, large text input (autofocused on open), Escape to close.

Behavior:
- Wait 150ms after last keystroke before calling `search_entries` (debounce)
- While waiting / loading: subtle spinner
- Results: grouped by category with category header rows
- Each result row: category color left border, title in `text-zinc-100`, snippet in `text-zinc-400 text-sm`, relative date on the right
- Keyboard: Up/Down to move selection, Enter to open the entry (close modal, select entry in sidebar + list)
- Mouse: hover highlights row, click opens entry
- "No results" empty state with a helpful message

---

### `src/components/ExportDialog.tsx`

Modal dialog. Three sections:

**Export:**
- "Export all data to JSON" button → calls `export_json` command, shows file-saved toast with the path
- "Export selected entries to PDF" button → generates a print-friendly HTML page in a hidden iframe and triggers `window.print()`. The print CSS should show entries with their full content, one per page.

**Import:**
- "Import from JSON backup" button → opens a file picker (`open()` from `@tauri-apps/plugin-dialog`, filter `.json`), calls `import_json`, shows toast with counts "Imported 42 entries, 8 contacts"
- Warning text: "Importing will add entries. Existing entries with the same ID will be updated."

---

### `src/components/StatusBadge.tsx`

```ts
// Props: status: EntryStatus, clickable?: boolean, onClick?: () => void
// Renders a small pill. When clickable, shows a subtle ↻ rotation icon on hover.
// Colors: active = bg-green-500/20 text-green-400, in_progress = bg-amber-500/20 text-amber-400, draft = bg-zinc-700 text-zinc-400
// Label: "Active" | "In Progress" | "Draft"
```

---

## Styling — Tailwind configuration

`tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
```

`src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* TipTap editor content styles */
.tiptap-content h1 { @apply text-2xl font-bold text-zinc-100 mt-6 mb-3; }
.tiptap-content h2 { @apply text-xl font-semibold text-zinc-200 mt-5 mb-2; }
.tiptap-content h3 { @apply text-lg font-medium text-zinc-200 mt-4 mb-2; }
.tiptap-content p  { @apply text-zinc-300 leading-7 mb-3; }
.tiptap-content ul { @apply list-disc list-outside pl-6 mb-3 text-zinc-300; }
.tiptap-content ol { @apply list-decimal list-outside pl-6 mb-3 text-zinc-300; }
.tiptap-content li { @apply mb-1; }
.tiptap-content code { @apply bg-zinc-800 text-amber-300 px-1.5 py-0.5 rounded text-sm font-mono; }
.tiptap-content pre { @apply bg-zinc-800 rounded-lg p-4 mb-4 overflow-x-auto relative; }
.tiptap-content pre code { @apply bg-transparent text-zinc-200 p-0; }
.tiptap-content blockquote { @apply border-l-4 border-blue-500 pl-4 text-zinc-400 italic my-4; }
.tiptap-content a { @apply text-blue-400 underline cursor-pointer hover:text-blue-300; }
.tiptap-content img { @apply rounded-lg max-w-full my-4; }
.tiptap-content hr { @apply border-zinc-700 my-6; }
.tiptap-content table { @apply border-collapse w-full mb-4; }
.tiptap-content th { @apply border border-zinc-700 bg-zinc-800 text-zinc-200 font-medium px-3 py-2 text-left; }
.tiptap-content td { @apply border border-zinc-700 text-zinc-300 px-3 py-2; }
.tiptap-content mark { @apply bg-yellow-500/30 text-yellow-200 px-0.5 rounded; }
.tiptap-content .task-list { @apply list-none pl-2; }
.tiptap-content .task-item { @apply flex items-start gap-2 mb-1; }

/* Custom scrollbar for dark theme */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { @apply bg-zinc-900; }
::-webkit-scrollbar-thumb { @apply bg-zinc-700 rounded-full; }
::-webkit-scrollbar-thumb:hover { @apply bg-zinc-600; }

/* Prevent text selection during panel resizing */
.no-select { user-select: none; }
```

Apply the class `dark` to `<html>` by default. When toggling light mode, remove it. Persist choice in `localStorage` and apply on load before React renders (add a tiny inline script to `index.html` to avoid flash of wrong theme).

---

## `tauri.conf.json` — complete configuration

```json
{
  "productName": "OpsDesk",
  "version": "1.0.0",
  "identifier": "com.opsdesk.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [{
      "title": "OpsDesk",
      "width": 1280,
      "height": 800,
      "minWidth": 1024,
      "minHeight": 600,
      "resizable": true,
      "center": true,
      "decorations": true
    }],
    "security": { "csp": null }
  },
  "plugins": {
    "shell": { "open": true }
  }
}
```

---

## `package.json` — complete

```json
{
  "name": "opsdesk",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  }
}
```

---

## Build order — follow this sequence

1. Scaffold the project with the commands in the "Project scaffold" section
2. Write `src-tauri/src/models.rs` completely
3. Write `src-tauri/src/db.rs` completely — test that `cargo check` passes
4. Write `src-tauri/src/commands.rs` completely — test that `cargo check` passes
5. Write `src-tauri/src/main.rs` — register all commands, test that `cargo build` succeeds
6. Configure Tailwind and write `src/index.css`
7. Write all TypeScript types, constants, and utilities
8. Write AppContext
9. Write all components bottom-up: StatusBadge → EntryCard → Editor → ContactCard → ContactForm → EntryList → DetailPane → Sidebar → SearchModal → ExportDialog → App
10. Run `npm run tauri dev` and verify the app launches and the DB is created

---

## Absolute requirements

- Every file must be complete. Do not write `// ...implement...` or `// TODO` anywhere.
- Every Tauri command must handle all error cases — never `.unwrap()` in production code paths.
- The app must compile and run with `npm run tauri dev` without modifications after generation.
- The SQLite DB file path must be resolved through `app_handle.path().app_data_dir()` — never hardcoded.
- The theme toggle must work: `dark` class on `<html>`, persisted in localStorage, applied before React mounts.
- Ctrl+K, Ctrl+N, Ctrl+S must all work.
- All `invoke` calls must have proper error handling — catch errors and show a toast with the error message.
- The contacts view must show the grid layout, not the rich-text entry layout.
- Image paste into TipTap must work via the clipboard paste plugin.
- Links in TipTap read mode must open in the system browser via `shell.open`.
- The FTS search must use the `entries_fts` virtual table, not a LIKE query.
