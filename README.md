# BreakGlass

Personal IT reference tool. Single-user, offline-first, Windows desktop. Built with Tauri 2 + React + SQLite.

The goal: find your stuff fast when something is on fire.

## Sidebar

The sidebar is grouped into three sections:

- **INFRA** — Servers, DBS & SQL, Network
- **OPS** — Emergency, How To, Weekly Reports
- **WORKSPACE** — Apps, Notes, Site Links, Contacts

Plus two quick filters at the top: **Home** (pinned + recent) and **Pinned**.

## Models per page

| Page          | Shape                                                                |
|---------------|---------------------------------------------------------------------|
| Emergency     | Folder tree + rich-body entries                                     |
| Servers       | Records with `name`, `IP`, `role` fields + body                     |
| DBS & SQL     | Records (databases or SQL snippets) with kind-specific fields        |
| Network       | Records by kind: VLAN, Subnet, IP/Host, Switch, Other                |
| Emergency     | Tree of runbook entries                                              |
| How To        | Tree of procedure entries                                            |
| Weekly Reports| Date-keyed report entries                                            |
| Apps          | App records (name, vendor, URL, login notes) each holding entries   |
| Notes         | Tree of generic notes                                                |
| Site Links    | Title + URL + description cards                                     |
| Contacts      | Name + role + company + phone + email + notes                       |

## Keyboard

- **Ctrl+K** — global search (folders, entries, contacts, apps)
- **Ctrl+S** — save current entry body
- **Ctrl+E** — open backup/restore dialog

## Run / build

```bash
npm install
npm run tauri dev        # dev mode
npm run tauri build      # release build + MSI + NSIS installers
```

Installers land in `src-tauri/target/release/bundle/{msi,nsis}/`.

## Architecture

- **Backend**: Rust (`src-tauri/src/`). SQLite via `rusqlite`. Commands in `commands.rs`. Schema migrations in `db.rs` (versioned via SQLite `user_version` pragma).
- **Frontend**: React 18 + TypeScript. State via `useReducer` + `Context` in `src/context/AppContext.tsx`. TipTap editor for rich body.
- **Theming**: CSS custom properties on `:root` (dark) and `html.light` (light). Toggle wired in `AppContext`.

## Adding a new top-level category

1. Add the id to `TopCategory` in `src/types/index.ts`.
2. Add to `TOP_CATEGORIES` in `src-tauri/src/models.rs`.
3. Add a `TOPS` entry in `src/lib/categories.ts` with label, icon, and group.
4. If it has structured fields, define a kind schema in `src/lib/kinds.ts`.
5. Optionally write a dedicated module component (see `ContactsModule`, `AppsModule`, `SiteLinksModule`) and route it in `src/components/ContentRouter.tsx`. Otherwise it'll fall back to the generic `TopView` (folder tree of entries) or `StructuredModule` (master-detail with kind fields) if added to the `STRUCTURED_TOPS` array.

## Data

SQLite file lives at `%APPDATA%/com.breakglass.app/breakglass.db` (Windows). Schema is migrated automatically on startup.

## License

MIT — see [LICENSE](LICENSE).
