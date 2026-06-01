import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronRight, FolderPlus, Home as HomeIcon, Moon, Pencil, Plus, Settings as SettingsIcon, Star, Sun, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../lib/invoke';
import { GROUP_LABELS, TOPS, TopMeta } from '../lib/categories';
import { defaultKind } from '../lib/kinds';
import { App, Contact, Entry, Folder, TopCategory } from '../types';

type Node =
  | { kind: 'folder'; folder: Folder }
  | { kind: 'entry'; entry: Entry }
  | { kind: 'contact'; contact: Contact }
  | { kind: 'app'; app: App };

// Module tops still skip enumerating individual entries because their detail
// view is the module itself, not an EntryView. Apps is special: app *records*
// (from the apps table) do show as expandable tree leaves so you can scan
// every app quickly without scrolling chip filters.
const MODULE_TOPS = new Set<TopCategory>(['contacts', 'sitelinks', 'network', 'servers', 'dbs', 'weekly']);

function buildTrees(folders: Folder[], entries: Entry[], apps: App[], _contacts: Contact[]) {
  const out = {} as Record<TopCategory, Record<string, Node[]>>;
  for (const t of TOPS) out[t.id] = {};
  const push = (top: TopCategory, key: string, node: Node) => {
    const bucket = out[top];
    if (!bucket[key]) bucket[key] = [];
    bucket[key].push(node);
  };
  for (const folder of folders) push(folder.top_category, folder.parent_id ?? '__root__', { kind: 'folder', folder });
  for (const entry of entries) {
    if (MODULE_TOPS.has(entry.top_category)) continue;
    if (entry.top_category === 'apps' && entry.app_id) continue; // entries under an app hide in tree (shown in app detail)
    push(entry.top_category, entry.folder_id ?? '__root__', { kind: 'entry', entry });
  }
  for (const a of apps) push('apps', a.folder_id ?? '__root__', { kind: 'app', app: a });
  const cmp = (a: Node, b: Node) => {
    const ord = (n: Node) => (n.kind === 'folder' ? 0 : 1);
    if (ord(a) !== ord(b)) return ord(a) - ord(b);
    const an =
      a.kind === 'folder' ? a.folder.name :
      a.kind === 'entry' ? a.entry.title :
      a.kind === 'app' ? a.app.name :
      a.contact.name;
    const bn =
      b.kind === 'folder' ? b.folder.name :
      b.kind === 'entry' ? b.entry.title :
      b.kind === 'app' ? b.app.name :
      b.contact.name;
    return an.localeCompare(bn);
  };
  for (const top of TOPS) {
    for (const k of Object.keys(out[top.id])) out[top.id][k].sort(cmp);
  }
  return out;
}

type CtxMenu = {
  x: number;
  y: number;
  items: { label: string; onClick: () => void; danger?: boolean }[];
};

export function Sidebar() {
  const { folders, entries, apps, contacts, selection, expanded, dispatch, selectEntry, selectContact, selectApp, selectFolder, selectTop, goHome, theme } = useApp();
  const [ctx, setCtx] = useState<CtxMenu | null>(null);

  const trees = useMemo(() => buildTrees(folders, entries, apps, contacts), [folders, entries, apps, contacts]);
  const isExpanded = (id: string) => expanded[id] !== false;
  const toggleExpand = (id: string) => dispatch({ type: 'TOGGLE_EXPANDED', id });

  const isSel = (kind: 'entry' | 'contact' | 'folder' | 'top' | 'app', id: string) => {
    if (kind === 'entry') return selection.kind === 'entry' && selection.entry_id === id;
    if (kind === 'contact') return selection.kind === 'contact' && selection.contact_id === id;
    if (kind === 'folder') return selection.kind === 'folder' && selection.folder_id === id;
    if (kind === 'app') return selection.kind === 'app' && selection.app_id === id;
    return selection.kind === 'top' && selection.top === id;
  };

  const closeMenu = () => setCtx(null);
  const openMenu = (e: React.MouseEvent, items: CtxMenu['items']) => {
    e.preventDefault(); e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, items });
  };

  const addFolderAt = async (top: TopCategory, parentId: string | null) => {
    const name = window.prompt('New folder name');
    if (!name?.trim()) return;
    try {
      const folder = await db.saveFolder({ top_category: top, parent_id: parentId, name: name.trim() });
      dispatch({ type: 'UPSERT_FOLDER', folder });
      if (parentId) dispatch({ type: 'TOGGLE_EXPANDED', id: parentId, value: true });
      dispatch({ type: 'TOGGLE_EXPANDED', id: `top-${top}`, value: true });
    } catch (err) { toast.error(String(err)); }
  };

  const addEntryAt = async (top: TopCategory, folderId: string | null) => {
    const title = window.prompt('New entry title');
    if (!title?.trim()) return;
    try {
      const entry = await db.saveEntry({
        title: title.trim(), top_category: top, folder_id: folderId, app_id: null,
        kind: defaultKind(top), properties: '{}',
        is_favorite: false, content: '', url: null, tags: [],
      });
      dispatch({ type: 'UPSERT_ENTRY', entry });
      void selectEntry(entry.id);
    } catch (err) { toast.error(String(err)); }
  };

  const renameFolder = async (f: Folder) => {
    const next = window.prompt('Rename folder', f.name);
    if (!next?.trim() || next.trim() === f.name) return;
    try {
      const updated = await db.renameFolder(f.id, next.trim());
      dispatch({ type: 'UPSERT_FOLDER', folder: updated });
    } catch (err) { toast.error(String(err)); }
  };

  const deleteFolder = async (f: Folder) => {
    if (!window.confirm(`Delete folder "${f.name}"? Sub-folders go with it. Entries inside survive but lose their folder.`)) return;
    try {
      await db.deleteFolder(f.id);
      dispatch({ type: 'REMOVE_FOLDER', id: f.id });
    } catch (err) { toast.error(String(err)); }
  };

  const renameEntry = async (id: string) => {
    const e = entries.find((x) => x.id === id); if (!e) return;
    const next = window.prompt('Rename entry', e.title); if (!next?.trim() || next.trim() === e.title) return;
    try {
      const saved = await db.saveEntry({
        id: e.id, title: next.trim(), top_category: e.top_category, folder_id: e.folder_id,
        app_id: e.app_id, kind: e.kind, properties: e.properties,
        is_favorite: e.is_favorite, content: e.content, url: e.url, tags: e.tags,
      });
      dispatch({ type: 'UPSERT_ENTRY', entry: saved });
    } catch (err) { toast.error(String(err)); }
  };

  const deleteEntry = async (id: string) => {
    const e = entries.find((x) => x.id === id); if (!e) return;
    if (!window.confirm(`Delete entry "${e.title}"?`)) return;
    try { await db.deleteEntry(id); dispatch({ type: 'REMOVE_ENTRY', id }); }
    catch (err) { toast.error(String(err)); }
  };

  const togglePinApp = async (appId: string) => {
    const a = apps.find((x) => x.id === appId); if (!a) return;
    try {
      const saved = await db.saveApp({
        id: a.id, folder_id: a.folder_id, name: a.name, vendor: a.vendor, url: a.url,
        login_notes: a.login_notes, criticality: a.criticality, tags: a.tags,
        is_favorite: !a.is_favorite,
      });
      dispatch({ type: 'UPSERT_APP', app: saved });
    } catch (err) { toast.error(String(err)); }
  };

  const renameApp = async (appId: string) => {
    const a = apps.find((x) => x.id === appId); if (!a) return;
    const next = window.prompt('Rename app', a.name); if (!next?.trim() || next.trim() === a.name) return;
    try {
      const saved = await db.saveApp({
        id: a.id, folder_id: a.folder_id, name: next.trim(), vendor: a.vendor, url: a.url,
        login_notes: a.login_notes, criticality: a.criticality, tags: a.tags, is_favorite: a.is_favorite,
      });
      dispatch({ type: 'UPSERT_APP', app: saved });
    } catch (err) { toast.error(String(err)); }
  };

  const deleteApp = async (appId: string) => {
    const a = apps.find((x) => x.id === appId); if (!a) return;
    const count = entries.filter((e) => e.app_id === a.id).length;
    if (!window.confirm(`Delete app "${a.name}"?${count > 0 ? ` Has ${count} child entries.` : ''}`)) return;
    const cascade = count > 0 ? window.confirm(`Also delete the ${count} entries under it?\nOK = delete, Cancel = orphan`) : false;
    try { await db.deleteApp(a.id, cascade); dispatch({ type: 'REMOVE_APP', id: a.id }); }
    catch (err) { toast.error(String(err)); }
  };

  const togglePinEntry = async (entryId: string) => {
    const entry = entries.find((x) => x.id === entryId); if (!entry) return;
    try {
      const saved = await db.saveEntry({
        id: entry.id, title: entry.title, top_category: entry.top_category, folder_id: entry.folder_id,
        app_id: entry.app_id, kind: entry.kind, properties: entry.properties,
        is_favorite: !entry.is_favorite, content: entry.content, url: entry.url, tags: entry.tags,
      });
      dispatch({ type: 'UPSERT_ENTRY', entry: saved });
    } catch (err) { toast.error(String(err)); }
  };

  const renderNodes = (top: TopMeta, parentKey: string) => {
    const nodes = trees[top.id][parentKey] || [];
    if (!nodes.length) return null;
    return (
      <ul className="tree-list">
        {nodes.map((n) => {
          if (n.kind === 'folder') {
            const fid = n.folder.id;
            const open = isExpanded(fid);
            const hasKids = (trees[top.id][fid] || []).length > 0;
            const isAppsFolder = top.id === 'apps';
            return (
              <li key={`f-${fid}`}>
                <div className={`tree-row ${isSel('folder', fid) ? 'is-selected' : ''}`}
                     onContextMenu={(e) => openMenu(e, [
                       ...(isAppsFolder
                         ? [{ label: 'New app here', onClick: () => newAppAt(fid) }]
                         : [{ label: 'New entry here', onClick: () => addEntryAt(top.id, fid) }]),
                       { label: 'New folder here', onClick: () => addFolderAt(top.id, fid) },
                       { label: 'Rename folder', onClick: () => renameFolder(n.folder) },
                       { label: 'Delete folder', onClick: () => deleteFolder(n.folder), danger: true },
                     ])}>
                  <button className="tree-twisty" onClick={() => toggleExpand(fid)} aria-label="toggle">
                    <ChevronRight className={`twisty-icon ${open ? 'open' : ''} ${hasKids ? '' : 'invisible'}`} size={12} />
                  </button>
                  <button className="tree-name" onClick={() => selectFolder(fid)} onDoubleClick={() => toggleExpand(fid)} title={n.folder.name}>
                    <span className="folder-icon">▸</span>
                    <span className="truncate">{n.folder.name}</span>
                  </button>
                  <div className="tree-actions">
                    {isAppsFolder
                      ? <button title="New app" onClick={(e) => { e.stopPropagation(); newAppAt(fid); }}><Plus size={11} /></button>
                      : <button title="New entry" onClick={(e) => { e.stopPropagation(); addEntryAt(top.id, fid); }}><Plus size={11} /></button>}
                    <button title="New folder" onClick={(e) => { e.stopPropagation(); addFolderAt(top.id, fid); }}><FolderPlus size={11} /></button>
                    <button title="Rename" onClick={(e) => { e.stopPropagation(); renameFolder(n.folder); }}><Pencil size={11} /></button>
                    <button title="Delete" onClick={(e) => { e.stopPropagation(); deleteFolder(n.folder); }}><Trash2 size={11} /></button>
                  </div>
                </div>
                {open && renderNodes(top, fid)}
              </li>
            );
          }
          if (n.kind === 'entry') {
            const id = n.entry.id;
            const pinned = n.entry.is_favorite;
            return (
              <li key={`e-${id}`}>
                <div className={`tree-row leaf ${isSel('entry', id) ? 'is-selected' : ''}`}
                     onContextMenu={(e) => openMenu(e, [
                       { label: pinned ? 'Unpin' : 'Pin', onClick: () => togglePinEntry(id) },
                       { label: 'Rename', onClick: () => renameEntry(id) },
                       { label: 'Delete', onClick: () => deleteEntry(id), danger: true },
                     ])}>
                  <span className="tree-twisty" />
                  <button className="tree-name" onClick={() => selectEntry(id)} title={n.entry.title}>
                    <span className="leaf-icon">·</span>
                    <span className="truncate">{n.entry.title || '(untitled)'}</span>
                  </button>
                  <button className={`leaf-pin ${pinned ? 'is-pinned' : ''}`} onClick={(e) => { e.stopPropagation(); togglePinEntry(id); }} title={pinned ? 'Unpin' : 'Pin'}>
                    <Star size={11} />
                  </button>
                </div>
              </li>
            );
          }
          if (n.kind === 'app') {
            const id = n.app.id;
            const pinned = n.app.is_favorite;
            return (
              <li key={`a-${id}`}>
                <div className={`tree-row leaf ${isSel('app', id) ? 'is-selected' : ''}`}
                     onContextMenu={(e) => openMenu(e, [
                       { label: pinned ? 'Unpin' : 'Pin', onClick: () => togglePinApp(id) },
                       { label: 'Rename', onClick: () => renameApp(id) },
                       { label: 'Delete', onClick: () => deleteApp(id), danger: true },
                     ])}>
                  <span className="tree-twisty" />
                  <button className="tree-name" onClick={() => selectApp(id)} title={n.app.name}>
                    <span className="leaf-icon">▦</span>
                    <span className="truncate">{n.app.name}</span>
                  </button>
                  <button className={`leaf-pin ${pinned ? 'is-pinned' : ''}`} onClick={(e) => { e.stopPropagation(); togglePinApp(id); }} title={pinned ? 'Unpin' : 'Pin'}>
                    <Star size={11} />
                  </button>
                </div>
              </li>
            );
          }
          return null; // contacts no longer enumerated
        })}
      </ul>
    );
  };

  const newAppAt = async (folderId: string | null) => {
    const name = window.prompt('New app name');
    if (!name?.trim()) return;
    try {
      const app = await db.saveApp({
        folder_id: folderId, name: name.trim(), vendor: '', url: '',
        login_notes: '', criticality: '', tags: [], is_favorite: false,
      });
      dispatch({ type: 'UPSERT_APP', app });
      dispatch({ type: 'TOGGLE_EXPANDED', id: 'top-apps', value: true });
      if (folderId) dispatch({ type: 'TOGGLE_EXPANDED', id: folderId, value: true });
      void selectApp(app.id);
    } catch (err) { toast.error(String(err)); }
  };

  const renderTop = (top: TopMeta) => {
    const topId = `top-${top.id}`;
    const open = isExpanded(topId);
    const isModule = MODULE_TOPS.has(top.id);
    const isApps = top.id === 'apps';
    return (
      <div key={top.id} className="tree-top">
        <div className={`tree-row top ${isSel('top', top.id) ? 'is-selected' : ''}`}
             onContextMenu={(e) => openMenu(e, [
               { label: 'Open', onClick: () => selectTop(top.id) },
               ...(isApps ? [{ label: 'New app', onClick: () => newAppAt(null) }] : []),
               { label: 'New folder', onClick: () => addFolderAt(top.id, null) },
             ])}>
          {!isModule && (
            <button className="tree-twisty" onClick={() => toggleExpand(topId)}>
              <ChevronRight className={`twisty-icon ${open ? 'open' : ''}`} size={12} />
            </button>
          )}
          {isModule && <span className="tree-twisty" />}
          <button className="tree-name top-name" onClick={() => selectTop(top.id)} onDoubleClick={() => toggleExpand(topId)}>
            <span className="truncate">{top.label}</span>
          </button>
          <div className="tree-actions">
            {isApps
              ? <button title="New app" onClick={(e) => { e.stopPropagation(); newAppAt(null); }}><Plus size={11} /></button>
              : !isModule && (
                <button title="New entry" onClick={(e) => { e.stopPropagation(); addEntryAt(top.id, null); }}><Plus size={11} /></button>
              )}
            <button title="New folder" onClick={(e) => { e.stopPropagation(); addFolderAt(top.id, null); }}><FolderPlus size={11} /></button>
          </div>
        </div>
        {!isModule && open && renderNodes(top, '__root__')}
      </div>
    );
  };

  const groups: ('infra' | 'ops' | 'workspace')[] = ['infra', 'ops', 'workspace'];

  return (
    <aside className="sidebar">
      <div className="filters">
        <button className={`filter-row ${selection.kind === 'home' ? 'is-selected' : ''}`} onClick={goHome}>
          <HomeIcon size={13} /> <span>Home</span>
        </button>
        <button className={`filter-row ${selection.kind === 'pinned' ? 'is-selected' : ''}`}
                onClick={() => dispatch({ type: 'SELECT', target: { kind: 'pinned' } })}>
          <Star size={13} /> <span>Pinned</span>
        </button>
      </div>

      <div className="tree">
        {groups.map((g) => (
          <div key={g} className="tree-group">
            <div className="tree-group-label">{GROUP_LABELS[g]}</div>
            {TOPS.filter((t) => t.group === g).map(renderTop)}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <button className="footer-btn" onClick={() => dispatch({ type: 'TOGGLE_THEME' })} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
        </button>
        <button className="footer-btn" onClick={() => dispatch({ type: 'TOGGLE_EXPORT', value: true })} title="Backup / restore">
          <SettingsIcon size={13} />
        </button>
      </div>

      {ctx && (
        <>
          <div className="ctx-backdrop" onClick={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }} />
          <div className="ctx-menu" style={{ top: ctx.y, left: ctx.x }}>
            {ctx.items.map((item, i) => (
              <button key={i} className={`ctx-item ${item.danger ? 'danger' : ''}`} onClick={() => { item.onClick(); closeMenu(); }}>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
