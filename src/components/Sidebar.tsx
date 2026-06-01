import { useMemo } from 'react';
import toast from 'react-hot-toast';
import { ChevronRight, FolderPlus, Home as HomeIcon, Moon, Pencil, Plus, Search, Settings as SettingsIcon, Star, Sun, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../lib/invoke';
import { TOPS, TopMeta } from '../lib/categories';
import { Contact, Entry, Folder, TopCategory } from '../types';

type Node =
  | { kind: 'folder'; folder: Folder }
  | { kind: 'entry'; entry: Entry }
  | { kind: 'contact'; contact: Contact };

function buildTree(top: TopCategory, folders: Folder[], entries: Entry[], contacts: Contact[]) {
  const byParent: Record<string, Node[]> = {};
  const push = (key: string, node: Node) => {
    if (!byParent[key]) byParent[key] = [];
    byParent[key].push(node);
  };
  for (const folder of folders.filter((f) => f.top_category === top)) {
    push(folder.parent_id ?? '__root__', { kind: 'folder', folder });
  }
  for (const entry of entries.filter((e) => e.top_category === top)) {
    push(entry.folder_id ?? '__root__', { kind: 'entry', entry });
  }
  if (top === 'contacts') {
    for (const c of contacts) push(c.folder_id ?? '__root__', { kind: 'contact', contact: c });
  }
  const cmp = (a: Node, b: Node) => {
    const ord = (n: Node) => (n.kind === 'folder' ? 0 : 1);
    if (ord(a) !== ord(b)) return ord(a) - ord(b);
    const an = a.kind === 'folder' ? a.folder.name : a.kind === 'entry' ? a.entry.title : a.contact.name;
    const bn = b.kind === 'folder' ? b.folder.name : b.kind === 'entry' ? b.entry.title : b.contact.name;
    return an.localeCompare(bn);
  };
  for (const k of Object.keys(byParent)) byParent[k].sort(cmp);
  return byParent;
}

export function Sidebar() {
  const { folders, entries, contacts, selection, expanded, dispatch, selectEntry, selectContact, selectFolder, selectTop, goHome, theme } = useApp();

  const trees = useMemo(() => {
    const out = {} as Record<TopCategory, ReturnType<typeof buildTree>>;
    for (const t of TOPS) out[t.id] = buildTree(t.id, folders, entries, contacts);
    return out;
  }, [folders, entries, contacts]);

  const isExpanded = (id: string) => expanded[id] !== false; // default open
  const toggleExpand = (id: string) => dispatch({ type: 'TOGGLE_EXPANDED', id });

  const isSel = (kind: 'entry' | 'contact' | 'folder' | 'top', id: string) => {
    if (kind === 'entry') return selection.kind === 'entry' && selection.entry_id === id;
    if (kind === 'contact') return selection.kind === 'contact' && selection.contact_id === id;
    if (kind === 'folder') return selection.kind === 'folder' && selection.folder_id === id;
    return selection.kind === 'top' && selection.top === id;
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
        title: title.trim(), top_category: top, folder_id: folderId,
        is_favorite: false, content: '', url: null, tags: [],
      });
      dispatch({ type: 'UPSERT_ENTRY', entry });
      void selectEntry(entry.id);
    } catch (err) { toast.error(String(err)); }
  };

  const addContactAt = async (folderId: string | null) => {
    const name = window.prompt('New contact name');
    if (!name?.trim()) return;
    try {
      const contact = await db.saveContact({
        name: name.trim(), folder_id: folderId, role: '', company: '',
        phone: '', email: '', notes: '', tags: [], is_favorite: false,
      });
      dispatch({ type: 'UPSERT_CONTACT', contact });
      void selectContact(contact.id);
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
            return (
              <li key={`f-${fid}`}>
                <div className={`tree-row ${isSel('folder', fid) ? 'is-selected' : ''}`}>
                  <button className="tree-twisty" onClick={() => toggleExpand(fid)} aria-label="toggle">
                    <ChevronRight className={`twisty-icon ${open ? 'open' : ''} ${hasKids ? '' : 'invisible'}`} size={12} />
                  </button>
                  <button className="tree-name" onClick={() => selectFolder(fid)} onDoubleClick={() => toggleExpand(fid)} title={n.folder.name}>
                    <span className="folder-icon">▸</span>
                    <span className="truncate">{n.folder.name}</span>
                  </button>
                  <div className="tree-actions">
                    <button title="New entry here" onClick={(e) => { e.stopPropagation(); addEntryAt(top.id, fid); }}><Plus size={11} /></button>
                    <button title="New folder here" onClick={(e) => { e.stopPropagation(); addFolderAt(top.id, fid); }}><FolderPlus size={11} /></button>
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
            return (
              <li key={`e-${id}`}>
                <div className={`tree-row leaf ${isSel('entry', id) ? 'is-selected' : ''}`}>
                  <span className="tree-twisty" />
                  <button className="tree-name" onClick={() => selectEntry(id)} title={n.entry.title}>
                    <span className="leaf-icon">·</span>
                    <span className="truncate">{n.entry.title || '(untitled)'}</span>
                    {n.entry.is_favorite && <Star size={10} className="star-mark" />}
                  </button>
                </div>
              </li>
            );
          }
          const id = n.contact.id;
          return (
            <li key={`c-${id}`}>
              <div className={`tree-row leaf ${isSel('contact', id) ? 'is-selected' : ''}`}>
                <span className="tree-twisty" />
                <button className="tree-name" onClick={() => selectContact(id)} title={n.contact.name}>
                  <span className="leaf-icon">☎</span>
                  <span className="truncate">{n.contact.name}</span>
                  {n.contact.is_favorite && <Star size={10} className="star-mark" />}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" />
        <b>BREAKGLASS</b>
        <button className="brand-search" title="Search (Ctrl+K)" onClick={() => dispatch({ type: 'TOGGLE_SEARCH', value: true })}>
          <Search size={13} />
        </button>
      </div>

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
        {TOPS.map((top) => {
          const topId = `top-${top.id}`;
          const open = isExpanded(topId);
          return (
            <div key={top.id} className="tree-top">
              <div className={`tree-row top ${isSel('top', top.id) ? 'is-selected' : ''}`}>
                <button className="tree-twisty" onClick={() => toggleExpand(topId)}>
                  <ChevronRight className={`twisty-icon ${open ? 'open' : ''}`} size={12} />
                </button>
                <button className="tree-name top-name" onClick={() => selectTop(top.id)} onDoubleClick={() => toggleExpand(topId)}>
                  <span className="truncate">{top.label}</span>
                </button>
                <div className="tree-actions">
                  {top.isContacts
                    ? <button title="New contact" onClick={(e) => { e.stopPropagation(); addContactAt(null); }}><Plus size={11} /></button>
                    : <button title="New entry" onClick={(e) => { e.stopPropagation(); addEntryAt(top.id, null); }}><Plus size={11} /></button>}
                  <button title="New folder" onClick={(e) => { e.stopPropagation(); addFolderAt(top.id, null); }}><FolderPlus size={11} /></button>
                </div>
              </div>
              {open && renderNodes(top, '__root__')}
            </div>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <button className="footer-btn" onClick={() => dispatch({ type: 'TOGGLE_THEME' })} title="Toggle theme">
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
        </button>
        <button className="footer-btn" onClick={() => dispatch({ type: 'TOGGLE_EXPORT', value: true })} title="Backup / restore">
          <SettingsIcon size={13} />
        </button>
      </div>
    </aside>
  );
}
