import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ExternalLink, Folder as FolderIcon, Plus, Search, Star } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db, openExternal } from '../lib/invoke';
import { parseProperties } from '../lib/kinds';

interface Props { initialFolder: string | null }

export function SiteLinksModule({ initialFolder }: Props) {
  const { entries, folders, selectEntry, dispatch } = useApp();
  const [query, setQuery] = useState('');
  const [folderFilter, setFolderFilter] = useState<string | null>(initialFolder);

  const linkFolders = useMemo(
    () => folders.filter((f) => f.top_category === 'sitelinks').sort((a, b) => a.name.localeCompare(b.name)),
    [folders]
  );

  const links = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => e.top_category === 'sitelinks')
      .filter((e) => folderFilter === null ? true : folderFilter === '' ? !e.folder_id : e.folder_id === folderFilter)
      .filter((e) => {
        if (!q) return true;
        const desc = parseProperties(e.properties).description ?? '';
        return e.title.toLowerCase().includes(q)
          || (e.url || '').toLowerCase().includes(q)
          || desc.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  }, [entries, query, folderFilter]);

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
        <div className="module-search">
          <Search size={13} />
          <input placeholder="Search links..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button className="ghost-btn" onClick={newFolder}>+ Folder</button>
        <button className="primary-btn" onClick={newLink}><Plus size={12} /> New link</button>
      </div>

      {linkFolders.length > 0 && (
        <div className="module-folders">
          <button className={`module-folder-chip ${folderFilter === null ? 'is-selected' : ''}`} onClick={() => setFolderFilter(null)}>All</button>
          <button className={`module-folder-chip ${folderFilter === '' ? 'is-selected' : ''}`} onClick={() => setFolderFilter('')}>Uncategorized</button>
          {linkFolders.map((f) => (
            <button key={f.id} className={`module-folder-chip ${folderFilter === f.id ? 'is-selected' : ''}`} onClick={() => setFolderFilter(f.id)}>
              <FolderIcon size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {f.name}
            </button>
          ))}
        </div>
      )}

      {links.length === 0
        ? <div className="module-empty">No site links yet. Click "New link" to add one.</div>
        : (
          <div className="sitelinks-grid">
            {links.map((e) => {
              const desc = parseProperties(e.properties).description ?? '';
              return (
                <div key={e.id} className="sitelink-card" onClick={() => openExternal(e.url)} title={e.url ?? ''}>
                  <div className="sl-title">
                    <ExternalLink size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    {e.is_favorite && <Star size={11} className="star-mark filled" style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                    {e.title || '(untitled)'}
                  </div>
                  <div className="sl-url">{e.url || 'no URL'}</div>
                  {desc && <div className="sl-desc">{desc}</div>}
                  <button className="sl-edit" onClick={(ev) => { ev.stopPropagation(); selectEntry(e.id); }}>edit</button>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
