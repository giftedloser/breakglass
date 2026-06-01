import { ExternalLink, Folder as FolderIcon, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { TOP_BY_ID, topLabel } from '../lib/categories';
import { formatRelativeDate } from '../lib/utils';
import { db, openExternal } from '../lib/invoke';
import { Folder } from '../types';

function pathOf(folder: Folder, all: Folder[]): Folder[] {
  const path: Folder[] = [folder];
  let cursor: Folder | undefined = folder;
  while (cursor?.parent_id) {
    const parent = all.find((f) => f.id === cursor!.parent_id);
    if (!parent) break;
    path.unshift(parent);
    cursor = parent;
  }
  return path;
}

export function FolderView({ folderId }: { folderId: string }) {
  const { folders, entries, contacts, selectFolder, selectEntry, selectContact, selectTop, dispatch } = useApp();
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) {
    return <div className="content-pane"><div className="empty">Folder not found.</div></div>;
  }
  const top = folder.top_category;
  const meta = TOP_BY_ID[top];
  const path = pathOf(folder, folders);
  const subFolders = folders.filter((f) => f.parent_id === folder.id);
  const dirEntries = entries.filter((e) => e.folder_id === folder.id);
  const dirContacts = top === 'contacts' ? contacts.filter((c) => c.folder_id === folder.id) : [];

  const newEntry = async () => {
    const title = window.prompt('New entry title');
    if (!title?.trim()) return;
    try {
      const e = await db.saveEntry({
        title: title.trim(), top_category: top, folder_id: folder.id,
        is_favorite: false, content: '', url: meta.isLinks ? '' : null, tags: [],
      });
      dispatch({ type: 'UPSERT_ENTRY', entry: e });
      void selectEntry(e.id);
    } catch (err) { toast.error(String(err)); }
  };

  const newContact = async () => {
    const name = window.prompt('New contact name');
    if (!name?.trim()) return;
    try {
      const c = await db.saveContact({
        name: name.trim(), folder_id: folder.id, role: '', company: '', phone: '', email: '', notes: '',
        tags: [], is_favorite: false,
      });
      dispatch({ type: 'UPSERT_CONTACT', contact: c });
      void selectContact(c.id);
    } catch (err) { toast.error(String(err)); }
  };

  const newFolder = async () => {
    const name = window.prompt(`New sub-folder under ${folder.name}`);
    if (!name?.trim()) return;
    try {
      const f = await db.saveFolder({ top_category: top, parent_id: folder.id, name: name.trim() });
      dispatch({ type: 'UPSERT_FOLDER', folder: f });
      dispatch({ type: 'TOGGLE_EXPANDED', id: folder.id, value: true });
    } catch (err) { toast.error(String(err)); }
  };

  return (
    <div className="content-pane">
      <header className="content-header">
        <div className="crumbs">
          <button className="crumb-link" onClick={() => selectTop(top)}>{topLabel(top)}</button>
          {path.map((p) => (
            <span key={p.id}>
              <span className="crumb-sep">/</span>
              {p.id === folder.id
                ? <b>{p.name}</b>
                : <button className="crumb-link" onClick={() => selectFolder(p.id)}>{p.name}</button>}
            </span>
          ))}
        </div>
        <div className="header-actions">
          <button className="ghost-btn" onClick={newFolder}>+ Folder</button>
          {meta.isContacts
            ? <button className="primary-btn" onClick={newContact}><Plus size={12} /> New contact</button>
            : <button className="primary-btn" onClick={newEntry}><Plus size={12} /> New entry</button>}
        </div>
      </header>

      {subFolders.length > 0 && (
        <section className="panel">
          <h3>Sub-folders</h3>
          <ul className="row-list">
            {subFolders.sort((a, b) => a.name.localeCompare(b.name)).map((f) => {
              const kidCount =
                folders.filter((x) => x.parent_id === f.id).length +
                entries.filter((x) => x.folder_id === f.id).length +
                (top === 'contacts' ? contacts.filter((c) => c.folder_id === f.id).length : 0);
              return (
                <li key={f.id} className="row" onClick={() => selectFolder(f.id)}>
                  <FolderIcon size={12} />
                  <span className="row-name">{f.name}</span>
                  <span className="row-when">{kidCount} item{kidCount === 1 ? '' : 's'}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(dirEntries.length > 0 || dirContacts.length > 0) && (
        <section className="panel">
          <h3>Entries</h3>
          <ul className="row-list">
            {dirEntries.sort((a, b) => a.title.localeCompare(b.title)).map((e) => (
              meta.isLinks ? (
                <li key={e.id} className="row" onClick={() => openExternal(e.url)} title={e.url ?? ''}>
                  <ExternalLink size={12} />
                  <span className="row-name">{e.title || '(untitled)'}</span>
                  <button className="row-edit" title="Edit entry" onClick={(ev) => { ev.stopPropagation(); selectEntry(e.id); }}>edit</button>
                </li>
              ) : (
                <li key={e.id} className="row" onClick={() => selectEntry(e.id)}>
                  <span className="row-name">{e.title || '(untitled)'}</span>
                  <span className="row-when">{formatRelativeDate(e.updated_at)}</span>
                </li>
              )
            ))}
            {dirContacts.sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
              <li key={c.id} className="row" onClick={() => selectContact(c.id)}>
                <span className="row-name">{c.name}</span>
                <span className="row-when">{c.company || c.role || formatRelativeDate(c.updated_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {subFolders.length === 0 && dirEntries.length === 0 && dirContacts.length === 0 && (
        <section className="panel empty-panel">
          <div className="empty">Empty folder. Add a sub-folder or {meta.isContacts ? 'contact' : 'entry'} above.</div>
        </section>
      )}
    </div>
  );
}
