# BreakGlass redesign — locked decisions

Personal IT reference tool for one user. Not a ticketing system. Not multi-user.
Goal: remember stuff spread across 5 places, find it fast in a pinch.

## Model

User-defined **tree** of folders and entries. Any depth. Entries can live at
any node (under a top-level category, under a sub-folder, under a sub-sub-folder).

Top-level categories (fixed list, in this order):

1. Emergency
2. Servers & Services
3. DBs
4. Network
5. Apps
6. Contacts
7. Notes
8. How To
9. Site Links

What goes INSIDE each top-level is user-built. Sub-folders are unlimited depth.
Apps tends to nest deeper (vendor → product → entry), but the model is uniform —
nothing is special-cased.

## Sidebar

```
⌂ Home
★ Pinned
──
[ tree of the 9 top-level categories, expandable ]
──
⚙ Settings
```

No "Active" / "Drafts" / "In Progress" filters. No status lifecycle.

## Entries

- Just reference docs. Title + tags + rich-text body.
- No status. No severity. No active/resolved.
- One flag: pinned (★). Click star to toggle.
- Tags are free-form, cross-cutting filter.
- Inline edit for title and tags. TipTap body keeps a read/edit toggle.

## Home view

Two sections only:
- **Pinned** — everything starred.
- **Recent** — last ~10 entries opened or edited. Tracked silently.

No emergency strip. No active fires panel.

## Folder view (clicking any folder in the tree)

- **Sub-folders** section — every child folder.
- **Entries directly under [folder]** — entries at this level, only renders if any exist.

## Entry view

- Breadcrumb at top (Category / Sub-folder / Entry).
- Title (inline-editable), star, tags.
- Body (TipTap, read mode by default, click Edit to switch).
- Related section (auto: shared tags + same parent folder).
- "Updated Xm ago" in the corner. No created timestamp shown.

## Search (Ctrl+K)

- Global. Searches title, body, tags across the whole tree.
- Results grouped by top-level category.
- Folder hits ranked above entry hits when query matches a folder name.

## Visual

- Warmer charcoal background (`#1a1816`), not zinc-950 black.
- One accent color (warm red/orange `#d65b3b`) used sparingly.
- Wider reading column (~720px cap on body content).
- Theme toggle lives in Settings, not a full-width sidebar button.

## What's getting cut from current build

- `emergency` / `vendors` / `servers` / `security` / `network` / `notes` /
  `runbooks` / `apps` / `contacts` fixed category enum
- `status` column on entries (active/in_progress/draft)
- `severity` column on entries (info/warning/critical)
- Three-column always-on layout (becomes two-column)
- Middle list strip with sort/filter dropdown
- Untitled draft persistence (entries don't save until they have content)
- "All Entries / Favorites / In Progress / Drafts" quick filters
- Full-width Dark/Light button at sidebar bottom

## What's getting added

- `folders` table: id, parent_id (nullable, points to folder or top category),
  top_category (one of the 9 enum values), name, position, created_at, updated_at
- `entries` keeps id/title/content/tags/is_favorite/created_at/updated_at,
  adds `folder_id` (nullable; null means directly under a top category) and
  `top_category` (which of the 9 it belongs to)
- Drop `status`, `severity`, `category` enum on entries (replaced by `top_category`
  which is broader and matches the new model)
- `contacts` table stays — same structured fields (name, role, company, phone,
  email, notes, tags, is_favorite). Treated like an entry for tree purposes:
  appears under the Contacts top-level, can live in sub-folders.
- Recent-views table or column for the Home "Recent" section.

## Migration plan

Existing data (the 4 entries visible in current screenshot) maps as:
- `runbooks` → top_category = "How To" or "Emergency" (user picks during one-time prompt)
- `vendors` → top_category = "Contacts"
- `emergency` → top_category = "Emergency"
- Empty "Untitled Runbook" drafts → delete on migration

## Build order (for tomorrow)

1. Rust: new schema migration (v2). Adds folders table, alters entries.
2. Rust: commands for folder CRUD, move entry, list tree.
3. TS: types for Folder, updated Entry, TreeNode.
4. New Sidebar component rendering the tree from data, expandable.
5. New FolderView component (sub-folders + direct entries).
6. New HomeView component (pinned + recent).
7. EntryView simplification (drop status/severity UI).
8. Migration prompt on first launch after upgrade.
9. Drop dead components (StatusBadge, old category badges, old sort dropdown).

## Open / TBD for tomorrow

- Can the user rename / reorder the 9 top-level categories, or are they fixed forever?
- Contacts: keep separate structured table, or treat as just-another-entry with
  phone/email as fields on a regular entry? Leaning: keep separate table, but
  render in the tree alongside everything else.
- Site Links: each link = its own one-line entry (title + URL), no body? Or full
  entry with body? Leaning: title + URL only, no body, opens in browser on click.
- Drag-and-drop in the tree to move folders/entries around? Or move via a menu?
