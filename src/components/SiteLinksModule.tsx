import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ExternalLink, Pencil, Plus, Star } from 'lucide-react';
import { ModuleFolderChips } from './ModuleFolderChips';
import { ListRowMenu } from './ListRowMenu';
import { useApp } from '../context/AppContext';
import { db, openExternal } from '../lib/invoke';
import { parseProperties } from '../lib/kinds';

interface Props { initialFolder: string | null }

export function SiteLinksModule({ initialFolder }: Props) {
  const { entries, folders, selectEntry, dispatch } = useApp();
  const [folderFilter, setFolderFilter] = useState<string | null>(initialFolder);

  const linkFolders = useMemo(
    () => folders.filter((f) => f.top_category === 'sitelinks').sort((a, b) => a.name.localeCompare(b.name)),
    [folders]
  );

  const links = useMemo(() => {
    return entries
      .filter((e) => e.top_category === 'sitelinks')
      .filter((e) => folderFilter === null ? true : folderFilter === '' ? !e.folder_id : e.folder_id === folderFilter)
      .sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  }, [entries, folderFilter]);

  const newLink = async () => {
    const title = window.prompt('Title for new link');
    if (!title?.trim()) return;
    const url = window.prompt('URL');
    if (!url?.trim()) return;
    const description = window.prompt('Description (optional)') ?? '';
    try {
      const e = await db.saveEntry({
        title: title.trim(), top_category: 'sitelinks', folder_id: folderFilter || null, app_id: null,
        kind: 'generic', properties: JSON.stringify({ description: description.trim() }),
        is_favorite: false, content: '', url: url.trim(), tags: [],
      });
      dispatch({ type: 'UPSERT_ENTRY', entry: e });
    } catch (err) { toast.error(String(err)); }
  };

  const newFolder = async () => {
    const name = window.prompt('New site-links folder');
    if (!name?.trim()) return;
    try {
      const f = await db.saveFolder({ top_category: 'sitelinks', parent_id: null, name: name.trim() });
      dispatch({ type: 'UPSERT_FOLDER', folder: f });
      setFolderFilter(f.id);
    } catch (err) { toast.error(String(err)); }
  };

  return (
    <div className="module-pane">
      <div className="module-header">
        <h1>Site Links</h1>
        <span className="module-count">{links.length}</span>
        <ModuleFolderChips folders={linkFolders} selected={folderFilter} onSelect={setFolderFilter} />
        <div className="module-header-right">
          <button className="ghost-btn" onClick={newFolder}>+ Folder</button>
          <button className="primary-btn" onClick={newLink}><Plus size={12} /> New</button>
        </div>
      </div>

      {links.length === 0
        ? <div className="module-empty">No site links yet. Click "New link" to add one.</div>
        : (
          <div className="sitelinks-grid">
            {links.map((e) => {
              const desc = parseProperties(e.properties).description ?? '';
              const togglePin = async () => {
                try {
                  const saved = await db.saveEntry({
                    id: e.id, title: e.title, top_category: e.top_category, folder_id: e.folder_id,
                    app_id: e.app_id, kind: e.kind, properties: e.properties,
                    is_favorite: !e.is_favorite, content: e.content, url: e.url, tags: e.tags,
                  });
                  dispatch({ type: 'UPSERT_ENTRY', entry: saved });
                } catch (err) { toast.error(String(err)); }
              };
              const remove = async () => {
                if (!window.confirm(`Delete link "${e.title}"?`)) return;
                try { await db.deleteEntry(e.id); dispatch({ type: 'REMOVE_ENTRY', id: e.id }); }
                catch (err) { toast.error(String(err)); }
              };
              return (
                <ListRowMenu key={e.id}
                  className="sitelink-card"
                  onClick={() => openExternal(e.url)}
                  items={[
                    { label: 'Open URL', onClick: () => openExternal(e.url) },
                    { label: 'Edit', onClick: () => selectEntry(e.id) },
                    { label: e.is_favorite ? 'Unpin' : 'Pin', onClick: togglePin },
                    { label: 'Delete', onClick: remove, danger: true },
                  ]}>
                  <div className="sl-title">
                    <ExternalLink size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    {e.is_favorite && <Star size={11} className="star-mark filled" style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                    {e.title || '(untitled)'}
                  </div>
                  <div className="sl-url">{e.url || 'no URL'}</div>
                  {desc && <div className="sl-desc">{desc}</div>}
                  <button className="sl-edit" onClick={(ev) => { ev.stopPropagation(); selectEntry(e.id); }} title="Edit"><Pencil size={11} /></button>
                </ListRowMenu>
              );
            })}
          </div>
        )}
    </div>
  );
}
