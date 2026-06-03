# BreakGlass

Personal IT reference tool. Single-user, offline-first, Windows desktop. Built with Tauri 2 + React + SQLite.

The goal: find your stuff fast when something is on fire.

## Status

BreakGlass is a local desktop app for one operator's reference data. It is not a ticketing system, team knowledge base, or hosted service.

## Sidebar

The sidebar is grouped into three sections:

- **INFRA** — Servers, Services, DBS & SQL, Network
- **OPS** — Emergency, How To, Weekly Reports
- **WORKSPACE** — Apps, Notes, Site Links, Contacts

Plus two quick filters at the top: **Home** (pinned + recent) and **Pinned**.

## Models per page

| Page          | Shape                                                                |
|---------------|---------------------------------------------------------------------|
| Emergency     | Folder tree + rich-body runbook entries                             |
| Servers       | Records with `name`, `IP`, `role` fields + body                     |
| Services      | Records with service, host/server, port, and purpose fields          |
| DBS & SQL     | Records (databases or SQL snippets) with kind-specific fields        |
| Network       | Records by kind: VLAN, Subnet, IP/Host, Switch, Other                |
| How To        | Tree of procedure entries                                            |
| Weekly Reports| Date-keyed report entries with note sections                         |
| Apps          | App records (name, vendor, URL, login notes) each holding entries   |
| Notes         | Tree of generic notes                                                |
| Site Links    | Title-first link cards with optional descriptions                    |
| Contacts      | Name + role + company + phone + email + notes                       |

## Usage

Global search is opened with **Ctrl+K**. It searches folders, entries, apps, contacts, titles, body text, tags, structured fields, URLs, app notes, and contact notes. Results are ranked so exact titles and strong title matches rise first, while body/keyword matches still show up.

Use the sidebar to switch between top-level pages, folders, entries, app records, site links, contacts, Home, Pinned, and Settings. Most record and folder actions are available from inline buttons or right-click context menus.

## Keyboard

- **Ctrl+K** — global search (folders, entries, contacts, apps)

## Install

```bash
npm install
```

## Development

```bash
npm run tauri dev        # dev mode
```

## Testing and verification

```bash
npm exec tsc -- --noEmit
cargo check --manifest-path src-tauri/Cargo.toml
npm run build
```

## Build installers

```bash
npm run tauri build      # release build + MSI + NSIS installers
```

Installers land in `src-tauri/target/release/bundle/{msi,nsis}/`.

## Configuration

No external service configuration is required. The app stores its SQLite database locally at `%APPDATA%/com.breakglass.app/breakglass.db` on Windows. Theme and sidebar expansion state are stored in browser local storage inside the Tauri webview.

## Architecture

- **Backend**: Rust (`src-tauri/src/`). SQLite via `rusqlite`. Commands in `commands.rs`. Schema migrations in `db.rs` (versioned via SQLite `user_version` pragma).
- **Frontend**: React 18 + TypeScript. State via `useReducer` + `Context` in `src/context/AppContext.tsx`. TipTap editor for rich body.
- **Theming**: CSS custom properties on `:root` (dark) and `html.light` (light). Toggle wired in `AppContext`.

## Project structure

```text
src/                 React app, components, types, and Tauri invoke wrappers
src-tauri/src/       Rust commands, models, database setup, and migrations
public/              Static assets bundled with the app
docs/                Design notes and historical planning docs
```

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
