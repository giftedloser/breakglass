import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Folder as FolderIcon, Plus, Search, Star } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../lib/invoke';
import { TOP_BY_ID } from '../lib/categories';
import { defaultKind, KINDS, kindDef, parseProperties } from '../lib/kinds';
import { EntryView } from './EntryView';
import { TopCategory } from '../types';

interface Props { top: TopCategory; initialFolder: string | null }

export function StructuredModule({ top, initialFolder }: Props) {
  const meta = TOP_BY_ID[top];
  const { entries, folders, selection, selectEntry, dispatch } = useApp();
  const [query, setQuery] = useState('');
  const [folderFilter, setFolderFilter] = useState<string | null>(initialFolder);
  const [kindFilter, setKindFilter] = useState<string | null>(null);

  const kinds = KINDS[top];
  const showKindFilter = kinds.length > 1;

  const topFolders = useMemo(
    () => folders.filter((f) => f.top_category === top).sort((a, b) => a.name.localeCompare(b.name)),
    [folders, top]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => e.top_category === top)
      .filter((e) => folderFilter === null ? true : folderFilter === '' ? !e.folder_id : e.folder_id === folderFilter)
      .filter((e) => kindFilter === null ? true : (e.kind ?? defaultKind(top)) === kindFilter)
      .filter((e) => {
        if (!q) return true;
        if (e.title.toLowerCase().includes(q)) return true;
        const props = parseProperties(e.properties);
        return Object.values(props).some((v) => v.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  }, [entries, top, query, folderFilter, kindFilter]);

  const selectedId = selection.kind === 'entry' ? selection.entry_id : null;

  const newEntry = async (kind?: string) => {
    const k = kind ?? kindFilter ?? defaultKind(top);
    const def = kindDef(top, k);
    const title = window.prompt(`New ${def.label} name`);
    if (!title?.trim()) return;
    try {
      const e = await db.saveEntry({
        title: title.trim(), top_category: top, folder_id: folderFilter || null, app_id: null,
        kind: k, properties: '{}',
        is_favorite: false, content: '', url: null, tags: [],
      });
      dispatch({ type: 'UPSERT_ENTRY', entry: e });
      void selectEntry(e.id);
    } catch (err) { toast.error(String(err)); }
  };

  const newFolder = async () => {
    const name = window.prompt(`New ${meta.label} folder`);
    if (!name?.trim()) return;
    try {
      const f = await db.saveFolder({ top_category: top, parent_id: null, name: name.trim() });
      dispatch({ type: 'UPSERT_FOLDER', folder: f });
      setFolderFilter(f.id);
    } catch (err) { toast.error(String(err)); }
  };

  return (
    <div className="module-pane">
      <div className="module-header">
        <h1>{meta.label}</h1>
        <span className="module-count">{filtered.length} of {entries.filter((e) => e.top_category === top).length}</span>
        <div className="module-search">
          <Search size={13} />
          <input placeholder={`Search ${meta.label.toLowerCase()}...`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button className="ghost-btn" onClick={newFolder}>+ Folder</button>
        <button className="primary-btn" onClick={() => newEntry()}><Plus size={12} /> New</button>
      </div>

      {showKindFilter && (
        <div className="module-folders">
          <button className={`module-folder-chip ${kindFilter === null ? 'is-selected' : ''}`} onClick={() => setKindFilter(null)}>All kinds</button>
          {kinds.map((k) => (
            <button key={k.id} className={`module-folder-chip ${kindFilter === k.id ? 'is-selected' : ''}`} onClick={() => setKindFilter(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
      )}

      {topFolders.length > 0 && (
        <div className="module-folders">
          <button className={`module-folder-chip ${folderFilter === null ? 'is-selected' : ''}`} onClick={() => setFolderFilter(null)}>All folders</button>
          <button className={`module-folder-chip ${folderFilter === '' ? 'is-selected' : ''}`} onClick={() => setFolderFilter('')}>Uncategorized</button>
          {topFolders.map((f) => (
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
            ? <div className="module-empty">Nothing here yet.</div>
            : filtered.map((e) => {
                const def = kindDef(top, e.kind);
                const props = parseProperties(e.properties);
                const sub = def.fields
                  .map((f) => props[f.key])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join(' · ');
                return (
                  <div key={e.id} className={`module-list-row ${selectedId === e.id ? 'is-selected' : ''}`} onClick={() => selectEntry(e.id)}>
                    <div className="row-main">
                      <div className="row-title">
                        {e.is_favorite && <Star size={10} className="star-mark filled" style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                        {e.title || '(untitled)'}
                      </div>
                      <div className="row-sub">{def.label}{sub ? ` · ${sub}` : ''}</div>
                    </div>
                  </div>
                );
              })}
        </div>
        <div className="module-detail">
          {selectedId
            ? <EntryView entryId={selectedId} />
            : <div className="module-empty">Select an item from the list, or click "New" to add one.</div>}
        </div>
      </div>
    </div>
  );
}
