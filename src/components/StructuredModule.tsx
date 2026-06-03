import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Star } from 'lucide-react';
import { format, startOfWeek } from 'date-fns';
import { ModuleFolderChips } from './ModuleFolderChips';
import { ListRowMenu } from './ListRowMenu';
import { bgConfirm, bgPrompt } from '../lib/dialogs';
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
  const [folderFilter, setFolderFilter] = useState<string | null>(initialFolder);
  const [kindFilter, setKindFilter] = useState<string | null>(null);

  const kinds = KINDS[top];
  const showKindFilter = kinds.length > 1;

  const topFolders = useMemo(
    () => folders.filter((f) => f.top_category === top).sort((a, b) => a.name.localeCompare(b.name)),
    [folders, top]
  );

  const filtered = useMemo(() => {
    return entries
      .filter((e) => e.top_category === top)
      .filter((e) => folderFilter === null ? true : folderFilter === '' ? !e.folder_id : e.folder_id === folderFilter)
      .filter((e) => kindFilter === null ? true : (e.kind ?? defaultKind(top)) === kindFilter)
      .sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  }, [entries, top, folderFilter, kindFilter]);

  const selectedId = selection.kind === 'entry' ? selection.entry_id : null;

  const newEntry = async (kind?: string) => {
    const weekOf = top === 'weekly' ? format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd') : '';
    const k = top === 'weekly' ? 'report' : kind ?? kindFilter ?? defaultKind(top);
    const def = kindDef(top, k);
    const title = await bgPrompt({
      title: `New ${def.label}`,
      placeholder: top === 'weekly' ? 'Weekly report title' : 'Name',
      defaultValue: top === 'weekly' ? `Weekly report - ${weekOf}` : undefined,
    });
    if (!title) return;
    try {
      const e = await db.saveEntry({
        title, top_category: top, folder_id: folderFilter || null, app_id: null,
        kind: k, properties: top === 'weekly' ? JSON.stringify({ week_of: weekOf, sections: '[]' }) : '{}',
        is_favorite: false, content: '', url: null, tags: top === 'weekly' ? ['weekly'] : [],
      });
      dispatch({ type: 'UPSERT_ENTRY', entry: e });
      void selectEntry(e.id);
    } catch (err) { toast.error(String(err)); }
  };

  const newFolder = async () => {
    const name = await bgPrompt({ title: `New ${meta.label} folder` });
    if (!name) return;
    try {
      const f = await db.saveFolder({ top_category: top, parent_id: null, name });
      dispatch({ type: 'UPSERT_FOLDER', folder: f });
      setFolderFilter(f.id);
    } catch (err) { toast.error(String(err)); }
  };

  return (
    <div className="module-pane">
      <div className="module-header">
        <h1>{meta.label}</h1>
        <span className="module-count">{filtered.length}{filtered.length !== entries.filter((e) => e.top_category === top).length ? ` of ${entries.filter((e) => e.top_category === top).length}` : ''}</span>
        {showKindFilter && (
          <div className="module-chips-inline">
            <button className={`module-folder-chip ${kindFilter === null ? 'is-selected' : ''}`} onClick={() => setKindFilter(null)}>All kinds</button>
            {kinds.map((k) => (
              <button key={k.id} className={`module-folder-chip ${kindFilter === k.id ? 'is-selected' : ''}`} onClick={() => setKindFilter(k.id)}>
                {k.label}
              </button>
            ))}
          </div>
        )}
        <ModuleFolderChips folders={topFolders} selected={folderFilter} onSelect={setFolderFilter} />
        <div className="module-header-right">
          <button className="ghost-btn" onClick={newFolder}>+ Folder</button>
          <button className="primary-btn" onClick={() => newEntry()}><Plus size={12} /> New</button>
        </div>
      </div>

      <div className="module-body">
        <div className="module-list">
          {filtered.length === 0
            ? <div className="module-empty">{top === 'weekly' ? 'No weekly reports match this view. Start this week, switch folders, or clear the kind filter.' : 'Nothing matches this view yet. Add a record, switch folders, or clear the kind filter.'}</div>
            : filtered.map((e) => {
                const def = kindDef(top, e.kind);
                const props = parseProperties(e.properties);
                const sub = def.fields
                  .map((f) => props[f.key])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join(' · ');
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
                const rename = async () => {
                  const next = await bgPrompt({ title: 'Rename', defaultValue: e.title });
                  if (!next || next === e.title) return;
                  try {
                    const saved = await db.saveEntry({
                      id: e.id, title: next, top_category: e.top_category, folder_id: e.folder_id,
                      app_id: e.app_id, kind: e.kind, properties: e.properties,
                      is_favorite: e.is_favorite, content: e.content, url: e.url, tags: e.tags,
                    });
                    dispatch({ type: 'UPSERT_ENTRY', entry: saved });
                  } catch (err) { toast.error(String(err)); }
                };
                const remove = async () => {
                  const ok = await bgConfirm({ title: `Delete "${e.title}"?`, confirmLabel: 'Delete', danger: true });
                  if (!ok) return;
                  try { await db.deleteEntry(e.id); dispatch({ type: 'REMOVE_ENTRY', id: e.id }); }
                  catch (err) { toast.error(String(err)); }
                };
                return (
                  <ListRowMenu key={e.id}
                    className={`module-list-row ${selectedId === e.id ? 'is-selected' : ''}`}
                    onClick={() => selectEntry(e.id)}
                    items={[
                      { label: e.is_favorite ? 'Unpin' : 'Pin', onClick: togglePin },
                      { label: 'Rename', onClick: rename },
                      { label: 'Delete', onClick: remove, danger: true },
                    ]}>
                    <div className="row-main">
                      <div className="row-title">
                        {e.is_favorite && <Star size={10} className="star-mark filled" style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                        {e.title || '(untitled)'}
                      </div>
                      <div className="row-sub">{def.label}{sub ? ` · ${sub}` : ''}</div>
                    </div>
                  </ListRowMenu>
                );
              })}
        </div>
        <div className="module-detail">
          {selectedId
            ? <EntryView key={selectedId} entryId={selectedId} />
            : <div className="module-empty">{top === 'weekly' ? 'Select a report, or click "New" to start capturing this week.' : 'Select a record from the list, or click "New" to capture one.'}</div>}
        </div>
      </div>
    </div>
  );
}
