import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Folder as FolderIcon, Plus, Search, Star } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../lib/invoke';
import { AppDetail } from './AppDetail';

interface Props { initialFolder: string | null }

export function AppsModule({ initialFolder }: Props) {
  const { apps, folders, selection, selectApp, dispatch } = useApp();
  const [query, setQuery] = useState('');
  const [folderFilter, setFolderFilter] = useState<string | null>(initialFolder);

  const appFolders = useMemo(
    () => folders.filter((f) => f.top_category === 'apps').sort((a, b) => a.name.localeCompare(b.name)),
    [folders]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps
      .filter((a) => folderFilter === null ? true : folderFilter === '' ? !a.folder_id : a.folder_id === folderFilter)
      .filter((a) => {
        if (!q) return true;
        return a.name.toLowerCase().includes(q) || a.vendor.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [apps, query, folderFilter]);

  const selectedId = selection.kind === 'app' ? selection.app_id : null;

  const newApp = async () => {
    const name = window.prompt('New app name (e.g. Adobe, IGT EZPay, Salesforce)');
    if (!name?.trim()) return;
    try {
      const app = await db.saveApp({
        name: name.trim(), folder_id: folderFilter || null, vendor: '', url: '',
        login_notes: '', criticality: '', tags: [], is_favorite: false,
      });
      dispatch({ type: 'UPSERT_APP', app });
      void selectApp(app.id);
    } catch (err) { toast.error(String(err)); }
  };

  const newFolder = async () => {
    const name = window.prompt('New apps folder (e.g. "IGT", "Microsoft")');
    if (!name?.trim()) return;
    try {
      const f = await db.saveFolder({ top_category: 'apps', parent_id: null, name: name.trim() });
      dispatch({ type: 'UPSERT_FOLDER', folder: f });
      setFolderFilter(f.id);
    } catch (err) { toast.error(String(err)); }
  };

  return (
    <div className="module-pane">
      <div className="module-header">
        <h1>Apps</h1>
        <span className="module-count">{filtered.length} of {apps.length}</span>
        <div className="module-search">
          <Search size={13} />
          <input placeholder="Search apps..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button className="ghost-btn" onClick={newFolder}>+ Folder</button>
        <button className="primary-btn" onClick={newApp}><Plus size={12} /> New app</button>
      </div>

      {appFolders.length > 0 && (
        <div className="module-folders">
          <button className={`module-folder-chip ${folderFilter === null ? 'is-selected' : ''}`} onClick={() => setFolderFilter(null)}>All</button>
          <button className={`module-folder-chip ${folderFilter === '' ? 'is-selected' : ''}`} onClick={() => setFolderFilter('')}>Uncategorized</button>
          {appFolders.map((f) => (
            <button key={f.id} className={`module-folder-chip ${folderFilter === f.id ? 'is-selected' : ''}`} onClick={() => setFolderFilter(f.id)}>
              <FolderIcon size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {f.name}
            </button>
          ))}
        </div>
      )}

      <div className="module-body">
        <div className="module-list">
          {filtered.length === 0
            ? <div className="module-empty">No apps yet. Click "New app" to add one.</div>
            : filtered.map((a) => (
                <div key={a.id} className={`module-list-row ${selectedId === a.id ? 'is-selected' : ''}`} onClick={() => selectApp(a.id)}>
                  <div className="row-main">
                    <div className="row-title">
                      {a.is_favorite && <Star size={10} className="star-mark filled" style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                      {a.name}
                    </div>
                    <div className="row-sub">{a.vendor || a.url || '—'}</div>
                  </div>
                </div>
              ))}
        </div>
        <div className="module-detail">
          {selectedId
            ? <AppDetail appId={selectedId} />
            : <div className="module-empty">Select an app from the list, or click "New app" to start.</div>}
        </div>
      </div>
    </div>
  );
}
