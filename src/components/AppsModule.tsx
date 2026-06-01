import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Star } from 'lucide-react';
import { ModuleFolderChips } from './ModuleFolderChips';
import { ListRowMenu } from './ListRowMenu';
import { useApp } from '../context/AppContext';
import { db } from '../lib/invoke';
import { AppDetail } from './AppDetail';

interface Props { initialFolder: string | null }

export function AppsModule({ initialFolder }: Props) {
  const { apps, folders, selection, selectApp, dispatch } = useApp();
  const [folderFilter, setFolderFilter] = useState<string | null>(initialFolder);

  const appFolders = useMemo(
    () => folders.filter((f) => f.top_category === 'apps').sort((a, b) => a.name.localeCompare(b.name)),
    [folders]
  );

  const filtered = useMemo(() => {
    return apps
      .filter((a) => folderFilter === null ? true : folderFilter === '' ? !a.folder_id : a.folder_id === folderFilter)
      .sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [apps, folderFilter]);

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
        <span className="module-count">{filtered.length}{filtered.length !== apps.length ? ` of ${apps.length}` : ''}</span>
        <ModuleFolderChips folders={appFolders} selected={folderFilter} onSelect={setFolderFilter} />
        <div className="module-header-right">
          <button className="ghost-btn" onClick={newFolder}>+ Folder</button>
          <button className="primary-btn" onClick={newApp}><Plus size={12} /> New app</button>
        </div>
      </div>

      <div className="module-body">
        <div className="module-list">
          {filtered.length === 0
            ? <div className="module-empty">No apps yet. Click "New app" to add one.</div>
            : filtered.map((a) => {
                const togglePin = async () => {
                  try {
                    const saved = await db.saveApp({
                      id: a.id, folder_id: a.folder_id, name: a.name, vendor: a.vendor, url: a.url,
                      login_notes: a.login_notes, criticality: a.criticality, tags: a.tags, is_favorite: !a.is_favorite,
                    });
                    dispatch({ type: 'UPSERT_APP', app: saved });
                  } catch (err) { toast.error(String(err)); }
                };
                const rename = async () => {
                  const next = window.prompt('Rename app', a.name);
                  if (!next?.trim() || next.trim() === a.name) return;
                  try {
                    const saved = await db.saveApp({
                      id: a.id, folder_id: a.folder_id, name: next.trim(), vendor: a.vendor, url: a.url,
                      login_notes: a.login_notes, criticality: a.criticality, tags: a.tags, is_favorite: a.is_favorite,
                    });
                    dispatch({ type: 'UPSERT_APP', app: saved });
                  } catch (err) { toast.error(String(err)); }
                };
                const remove = async () => {
                  if (!window.confirm(`Delete app "${a.name}"?`)) return;
                  try { await db.deleteApp(a.id, false); dispatch({ type: 'REMOVE_APP', id: a.id }); }
                  catch (err) { toast.error(String(err)); }
                };
                return (
                  <ListRowMenu key={a.id}
                    className={`module-list-row ${selectedId === a.id ? 'is-selected' : ''}`}
                    onClick={() => selectApp(a.id)}
                    items={[
                      { label: a.is_favorite ? 'Unpin' : 'Pin', onClick: togglePin },
                      { label: 'Rename', onClick: rename },
                      { label: 'Delete', onClick: remove, danger: true },
                    ]}>
                    <div className="row-main">
                      <div className="row-title">
                        {a.is_favorite && <Star size={10} className="star-mark filled" style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                        {a.name}
                      </div>
                      <div className="row-sub">{a.vendor || a.url || '—'}</div>
                    </div>
                  </ListRowMenu>
                );
              })}
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
