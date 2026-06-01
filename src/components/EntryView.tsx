import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ExternalLink, Pencil, Save, Star, Trash2, X } from 'lucide-react';
import { open as openShell } from '@tauri-apps/plugin-shell';
import { useApp } from '../context/AppContext';
import { db } from '../lib/invoke';
import { TOP_BY_ID, topLabel } from '../lib/categories';
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
  const { entries, folders, dispatch, selectFolder, selectTop, goHome } = useApp();
  const entry = entries.find((e) => e.id === entryId);

  const [title, setTitle] = useState(entry?.title ?? '');
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [url, setUrl] = useState(entry?.url ?? '');
  const [content, setContent] = useState(entry?.content ?? '');
  const [editingBody, setEditingBody] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const isLinks = entry ? TOP_BY_ID[entry.top_category].isLinks : false;
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!entry) return;
    setTitle(entry.title);
    setTags(entry.tags);
    setUrl(entry.url ?? '');
    setContent(entry.content);
    setEditingBody(false);
    dirtyRef.current = false;
  }, [entryId]);

  const save = async (overrides: Partial<{ title: string; tags: string[]; url: string | null; content: string; is_favorite: boolean }> = {}) => {
    if (!entry) return;
    const payload = {
      id: entry.id,
      title: (overrides.title ?? title).trim() || '(untitled)',
      top_category: entry.top_category,
      folder_id: entry.folder_id,
      is_favorite: overrides.is_favorite ?? entry.is_favorite,
      content: overrides.content ?? content,
      url: isLinks ? ((overrides.url ?? url) || '') : null,
      tags: overrides.tags ?? tags,
    };
    try {
      const saved = await db.saveEntry(payload);
      dispatch({ type: 'UPSERT_ENTRY', entry: saved });
      dirtyRef.current = false;
    } catch (err) { toast.error(String(err)); }
  };

  useEffect(() => {
    const onSave = () => { void save({ content }); };
    window.addEventListener('bg-save', onSave);
    return () => window.removeEventListener('bg-save', onSave);
  }, [content, title, tags, url, entry]);

  const togglePin = async () => {
    if (!entry) return;
    try {
      const next = !entry.is_favorite;
      const saved = await db.saveEntry({
        id: entry.id, title: entry.title, top_category: entry.top_category, folder_id: entry.folder_id,
        is_favorite: next, content: entry.content, url: entry.url, tags: entry.tags,
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

  if (!entry) {
    return <div className="content-pane"><div className="empty">Entry not found.</div></div>;
  }

  return (
    <div className="content-pane">
      <header className="content-header">
        <div className="crumbs">
          <button className="crumb-link" onClick={goHome}>Home</button>
          <span className="crumb-sep">/</span>
          <button className="crumb-link" onClick={() => selectTop(entry.top_category)}>{topLabel(entry.top_category)}</button>
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
          <button className="icon-btn danger" onClick={remove} title="Delete entry"><Trash2 size={14} /></button>
        </div>
      </header>

      <div className="entry-title-row">
        <input className="entry-title-input" value={title} onChange={(e) => setTitle(e.target.value)}
               onBlur={() => save({ title })}
               onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      </div>

      <div className="entry-meta">
        <span className="meta-when">Updated {formatRelativeDate(entry.updated_at)}</span>
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
            {url && <button className="primary-btn" onClick={() => openShell(url).catch((e) => toast.error(String(e)))}>
              <ExternalLink size={12} /> Open
            </button>}
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
