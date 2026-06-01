import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ExternalLink, FolderInput, Pencil, Save, Star, Trash2, X } from 'lucide-react';
import { MoveDialog } from './MoveDialog';
import { useApp } from '../context/AppContext';
import { db, openExternal } from '../lib/invoke';
import { TOP_BY_ID, topLabel } from '../lib/categories';
import { defaultKind, KINDS, kindDef, parseProperties, stringifyProperties } from '../lib/kinds';
import { formatRelativeDate } from '../lib/utils';
import { Folder } from '../types';
import { Editor } from './Editor';

function folderPath(folderId: string | null, folders: Folder[]): Folder[] {
  if (!folderId) return [];
  const map = new Map(folders.map((f) => [f.id, f]));
  const path: Folder[] = [];
  let cur = map.get(folderId);
  while (cur) {
    path.unshift(cur);
    cur = cur.parent_id ? map.get(cur.parent_id) : undefined;
  }
  return path;
}

export function EntryView({ entryId }: { entryId: string }) {
  const { entries, folders, apps, dispatch, selectFolder, selectTop, selectApp, goHome } = useApp();
  const entry = entries.find((e) => e.id === entryId);

  const [title, setTitle] = useState(entry?.title ?? '');
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [url, setUrl] = useState(entry?.url ?? '');
  const [content, setContent] = useState(entry?.content ?? '');
  const [kind, setKind] = useState<string>(entry?.kind ?? defaultKind(entry?.top_category ?? 'notes'));
  const [props, setProps] = useState<Record<string, string>>(parseProperties(entry?.properties));
  const [editingBody, setEditingBody] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const isLinks = entry ? TOP_BY_ID[entry.top_category].isLinks : false;
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!entry) return;
    setTitle(entry.title);
    setTags(entry.tags);
    setUrl(entry.url ?? '');
    setContent(entry.content);
    setKind(entry.kind ?? defaultKind(entry.top_category));
    setProps(parseProperties(entry.properties));
    setEditingBody(false);
    dirtyRef.current = false;
  }, [entryId]);

  const save = async (overrides: Partial<{
    title: string; tags: string[]; url: string | null; content: string;
    is_favorite: boolean; kind: string; properties: Record<string, string>;
  }> = {}) => {
    if (!entry) return;
    const propsToSave = overrides.properties ?? props;
    try {
      const saved = await db.saveEntry({
        id: entry.id,
        title: (overrides.title ?? title).trim() || '(untitled)',
        top_category: entry.top_category,
        folder_id: entry.folder_id,
        app_id: entry.app_id,
        kind: overrides.kind ?? kind,
        properties: stringifyProperties(propsToSave),
        is_favorite: overrides.is_favorite ?? entry.is_favorite,
        content: overrides.content ?? content,
        url: overrides.url !== undefined ? overrides.url : (isLinks ? (url || '') : entry.url),
        tags: overrides.tags ?? tags,
      });
      dispatch({ type: 'UPSERT_ENTRY', entry: saved });
      dirtyRef.current = false;
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 900);
    } catch (err) { toast.error(String(err)); }
  };

  useEffect(() => {
    const onSave = () => { void save({ content }); };
    window.addEventListener('bg-save', onSave);
    return () => window.removeEventListener('bg-save', onSave);
  }, [content, title, tags, url, kind, props, entry]);

  useEffect(() => {
    return () => {
      if (dirtyRef.current && entry) {
        void db.saveEntry({
          id: entry.id, title: entry.title, top_category: entry.top_category,
          folder_id: entry.folder_id, app_id: entry.app_id,
          kind: entry.kind, properties: entry.properties,
          is_favorite: entry.is_favorite,
          content, url: entry.url, tags: entry.tags,
        }).catch((err) => toast.error(`Couldn't save body edit: ${err}`));
      }
    };
  }, [entryId]);

  const togglePin = async () => {
    if (!entry) return;
    try {
      const saved = await db.saveEntry({
        id: entry.id, title: entry.title, top_category: entry.top_category, folder_id: entry.folder_id,
        app_id: entry.app_id, kind: entry.kind, properties: entry.properties,
        is_favorite: !entry.is_favorite, content: entry.content, url: entry.url, tags: entry.tags,
      });
      dispatch({ type: 'UPSERT_ENTRY', entry: saved });
    } catch (err) { toast.error(String(err)); }
  };

  const remove = async () => {
    if (!entry) return;
    if (!window.confirm(`Delete "${entry.title}"?`)) return;
    try {
      await db.deleteEntry(entry.id);
      dispatch({ type: 'REMOVE_ENTRY', id: entry.id });
      toast.success('Deleted');
    } catch (err) { toast.error(String(err)); }
  };

  const addTag = () => {
    const t = tagDraft.trim().toLowerCase();
    if (!t || tags.includes(t)) { setTagDraft(''); return; }
    const next = [...tags, t];
    setTags(next);
    setTagDraft('');
    void save({ tags: next });
  };

  const removeTag = (t: string) => {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    void save({ tags: next });
  };

  const path = useMemo(() => folderPath(entry?.folder_id ?? null, folders), [entry?.folder_id, folders]);
  const parentApp = useMemo(() => entry?.app_id ? apps.find((a) => a.id === entry.app_id) : null, [entry?.app_id, apps]);

  if (!entry) {
    return <div className="content-pane"><div className="empty">Entry not found.</div></div>;
  }

  const kinds = KINDS[entry.top_category];
  const showKindPicker = kinds.length > 1;
  const fields = kindDef(entry.top_category, kind).fields;
  const updateField = (key: string, value: string) => setProps((p) => ({ ...p, [key]: value }));
  const saveFields = () => save({ properties: props });

  return (
    <div className="content-pane">
      <header className="content-header">
        <div className="crumbs">
          <button className="crumb-link" onClick={goHome}>Home</button>
          <span className="crumb-sep">/</span>
          <button className="crumb-link" onClick={() => selectTop(entry.top_category)}>{topLabel(entry.top_category)}</button>
          {parentApp && (
            <span>
              <span className="crumb-sep">/</span>
              <button className="crumb-link" onClick={() => selectApp(parentApp.id)}>{parentApp.name}</button>
            </span>
          )}
          {path.map((p) => (
            <span key={p.id}>
              <span className="crumb-sep">/</span>
              <button className="crumb-link" onClick={() => selectFolder(p.id)}>{p.name}</button>
            </span>
          ))}
          <span className="crumb-sep">/</span>
          <b>{entry.title || '(untitled)'}</b>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={togglePin} title={entry.is_favorite ? 'Unpin' : 'Pin'}>
            <Star size={14} className={entry.is_favorite ? 'star-mark filled' : ''} />
          </button>
          <button className="icon-btn" onClick={() => setMoveOpen(true)} title="Move to..."><FolderInput size={14} /></button>
          <button className="icon-btn danger" onClick={remove} title="Delete entry"><Trash2 size={14} /></button>
        </div>
      </header>
      {moveOpen && (
        <MoveDialog kind="entry" id={entry.id} currentTop={entry.top_category}
                    currentFolderId={entry.folder_id} onClose={() => setMoveOpen(false)} />
      )}

      <div className="entry-title-row">
        <input className="entry-title-input" value={title} onChange={(e) => setTitle(e.target.value)}
               onBlur={() => save({ title })}
               onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      </div>

      <div className="entry-meta">
        <span className="meta-when">
          Updated {formatRelativeDate(entry.updated_at)}
          {savedFlash && <span className="saved-flash"> · saved</span>}
        </span>
        {showKindPicker && (
          <select className="kind-select" value={kind} onChange={(e) => { setKind(e.target.value); save({ kind: e.target.value }); }}>
            {kinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        )}
        <div className="tag-row">
          {tags.map((t) => (
            <span key={t} className="tag-pill">
              {t}
              <button className="tag-x" onClick={() => removeTag(t)}><X size={10} /></button>
            </span>
          ))}
          <input className="tag-input" placeholder="+ tag" value={tagDraft}
                 onChange={(e) => setTagDraft(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                 onBlur={() => tagDraft && addTag()} />
        </div>
      </div>

      {isLinks && (
        <section className="panel">
          <h3>URL</h3>
          <div className="url-row">
            <input className="url-input" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => save({ url })} placeholder="https://..." />
            {url && <button className="primary-btn" onClick={() => openExternal(url)}>
              <ExternalLink size={12} /> Open
            </button>}
          </div>
        </section>
      )}

      {fields.length > 0 && (
        <section className="panel">
          <h3>Fields</h3>
          <div className="field-grid">
            {fields.map((f) => (
              <label key={f.key} className={f.wide ? 'wide' : ''}>
                {f.label}
                <input value={props[f.key] ?? ''} placeholder={f.placeholder}
                       onChange={(e) => updateField(f.key, e.target.value)}
                       onBlur={saveFields} />
              </label>
            ))}
          </div>
        </section>
      )}

      {!isLinks && (
        <section className="panel body-panel">
          <div className="body-head">
            <h3>Body</h3>
            {editingBody
              ? <button className="primary-btn" onClick={async () => { await save({ content }); setEditingBody(false); }}>
                  <Save size={12} /> Done
                </button>
              : <button className="ghost-btn" onClick={() => setEditingBody(true)}>
                  <Pencil size={12} /> Edit
                </button>}
          </div>
          <Editor content={content || ''} onChange={(json) => { setContent(json); dirtyRef.current = true; }} editable={editingBody} placeholder="Empty. Click Edit to add content." />
        </section>
      )}
    </div>
  );
}
