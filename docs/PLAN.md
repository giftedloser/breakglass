# BreakGlass Design Snapshot

BreakGlass is a personal IT reference tool for one operator. It is built around fast retrieval, local data ownership, and low-friction notes during operational work.

This file records the current product shape. It is not a release roadmap.

## Product Boundaries

- Single-user desktop app.
- Offline-first local SQLite data.
- No ticket lifecycle, assignment, multi-user permissions, or hosted backend.
- Data should be quick to browse from the sidebar and quick to find through global search.

## Sidebar Model

The sidebar has fixed top-level pages grouped by operational area:

- **INFRA**: Servers, Services, DBS & SQL, Network
- **OPS**: Emergency, How To, Weekly Reports
- **WORKSPACE**: Apps, Notes, Site Links, Contacts

Home and Pinned sit above the grouped pages. Settings sits in the footer.

Folders can be nested under top-level pages. Some pages use dedicated modules instead of a generic entry list.

## Page Shapes

| Page | Current shape |
| --- | --- |
| Home | Quick shortcut row plus pinned/recent work |
| Pinned | Favorite entries, apps, and contacts |
| Emergency | Folder tree of runbook entries |
| Servers | Structured server records |
| Services | Structured service records |
| DBS & SQL | Database records and SQL snippets |
| Network | VLAN, subnet, host/IP, switch/device, and generic records |
| How To | Procedure entries in folders |
| Weekly Reports | Weekly report records with note sections |
| Apps | App records with vendor, URL, login notes, criticality, tags, and child entries |
| Notes | Generic note entries in folders |
| Site Links | Title-first link cards with optional descriptions; URLs open on click and are edited in detail view |
| Contacts | Contact records with role, company, phone, email, notes, and tags |

## Entry Behavior

- Entries save title, top category, optional folder, optional app, kind, structured properties, favorite state, rich body, URL, tags, and timestamps.
- Structured pages hide or emphasize fields depending on kind.
- Detail components are keyed by selected record id so draft/editor state does not leak between newly created or selected records.
- Rich text uses TipTap.

## Search

Global search opens with Ctrl+K. Search covers:

- Folder names
- Entry titles, bodies, tags, URLs, kinds, and structured properties
- App names, vendors, URLs, login notes, criticality, and tags
- Contact names, roles, companies, phones, emails, notes, and tags

Search ranking favors exact titles and title prefixes first, then strong title/body/keyword matches, favorites, and recency.

## Backup / Restore

Settings supports per-category export/import and full backup export/import. Category imports only touch the selected category.

## Development Notes

- Frontend state lives in `src/context/AppContext.tsx`.
- Tauri commands live in `src-tauri/src/commands.rs`.
- Database schema and migrations live in `src-tauri/src/db.rs`.
- Top-level category metadata lives in `src/lib/categories.ts`.
- Structured entry kind definitions live in `src/lib/kinds.ts`.
