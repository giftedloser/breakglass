import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, ExternalLink, FolderInput, Pencil, Star, Trash2, X } from 'lucide-react';
import { MoveDialog } from './MoveDialog';
import { useApp } from '../context/AppContext';
import { db, openExternal } from '../lib/invoke';
import { TOP_BY_ID, topLabel } from '../lib/categories';
import { defaultKind, KINDS, kindDef, parseProperties, stringifyProperties } from '../lib/kinds';
import { formatRelativeDate } from '../lib/utils';
import { Folder } from '../types';
import { Editor } from './Editor';
import { CodeBlock } from './CodeBlock';
import { Attachments } from './Attachments';
import { ReportSection, WeeklySections } from './WeeklySections';

// Reads sections out of an entry's raw properties JSON. Sections can be
// stored either as a nested JSON array under `sections` or as a stringified
// array (we accept both for forward compatibility).
function parseSections(raw: string | null | undefined): ReportSection[] {
  if (!raw) return [];
  try {
    const obj = JSON.parse(raw) as { sections?: unknown };
    const arr = typeof obj.sections === 'string'
      ? JSON.parse(obj.sections)
      : obj.sections;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s: unknown): s is { id?: unknown; title?: unknown; content?: unknown } => !!s && typeof s === 'object')
      .map((s) => ({
        id: typeof s.id === 'string' && s.id ? s.id : Math.random().toString(36).slice(2, 10),
        title: String(s.title ?? ''),
        content: String(s.content ?? ''),
      }));
  } catch { return []; }
}

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
  const [sections, setSectionsState] = useState<ReportSection[]>(parseSections(entry?.properties));
  const [editing, setEditing] = useState(false);
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
    const initProps = parseProperties(entry.properties);
    setProps(initProps);
    setSectionsState(parseSections(entry.properties));
    // Auto-open edit only when this entry has literally no content yet
    // (fresh from "+ New entry"). Otherwise default to read mode.
    const fieldList = kindDef(entry.top_category, entry.kind).fields;
    const noBody = !entry.content || entry.content === '{}' || entry.content === '';
    const noFields = fieldList.length === 0 || fieldList.every((f) => !initProps[f.key]?.trim());
    const noUrl = !entry.url || entry.url === '';
    const wholly_empty = noBody && noFields && (isLinks ? noUrl : true);
    setEditing(wholly_empty);
    dirtyRef.current = false;
  }, [entryId]);

  const save = async (overrides: Partial<{
    title: string; tags: string[]; url: string | null; content: string;
    is_favorite: boolean; kind: string; properties: Record<string, string>;
    sections: ReportSection[];
  }> = {}) => {
    if (!entry) return;
    const propsToSave = { ...(overrides.properties ?? props) };
    const sectionsToSave = overrides.sections ?? sections;
    // Embed sections array (as a string) inside the properties JSON so it
    // round-trips through parseProperties without being coerced.
    if (entry.top_category === 'weekly') {
      propsToSave.sections = JSON.stringify(sectionsToSave);
    }
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

  // Flush pending edits when this entry is being swapped out or left mid-edit.
  useEffect(() => {
    return () => {
      if (dirtyRef.current && entry) {
        void db.saveEntry({
          id: entry.id, title: entry.title, top_category: entry.top_category,
          folder_id: entry.folder_id, app_id: entry.app_id,
          kind: entry.kind, properties: entry.properties,
          is_favorite: entry.is_favorite,
          content, url: entry.url, tags: entry.tags,
        }).catch((err) => toast.error(`Couldn't save: ${err}`));
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

  const finishEditing = async () => {
    await save();
    setEditing(false);
  };

  const path = useMemo(() => folderPath(entry?.folder_id ?? null, folders), [entry?.folder_id, folders]);
  const parentApp = useMemo(() => entry?.app_id ? apps.find((a) => a.id === entry.app_id) : null, [entry?.app_id, apps]);

  if (!entry) {
    return <div className="content-pane"><div className="empty">Entry not found.</div></div>;
  }

  const kinds = KINDS[entry.top_category];
  const showKindPicker = kinds.length > 1;
  const fields = kindDef(entry.top_category, kind).fields;
  const hideBody = kindDef(entry.top_category, kind).hideBody;
  const updateField = (key: string, value: string) => setProps((p) => ({ ...p, [key]: value }));
  const isWeekly = entry.top_category === 'weekly';
  const setSections = (next: ReportSection[]) => {
    setSectionsState(next);
    dirtyRef.current = true;
    void save({ sections: next });
  };

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
          {editing
            ? <button className="icon-btn is-accent" onClick={finishEditing} title="Done editing"><Check size={14} /></button>
            : <button className="icon-btn" onClick={() => setEditing(true)} title="Edit entry"><Pencil size={14} /></button>}
          <button className="icon-btn" onClick={() => setMoveOpen(true)} title="Move to..."><FolderInput size={14} /></button>
          <button className="icon-btn danger" onClick={remove} title="Delete entry"><Trash2 size={14} /></button>
        </div>
      </header>
      {moveOpen && (
        <MoveDialog kind="entry" id={entry.id} currentTop={entry.top_category}
                    currentFolderId={entry.folder_id} onClose={() => setMoveOpen(false)} />
      )}

      {editing ? (
        <div className="entry-title-row">
          <input className="entry-title-input" value={title} onChange={(e) => setTitle(e.target.value)}
                 onBlur={() => save({ title })} autoFocus
                 onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        </div>
      ) : (
        <h1 className="read-title">{title || '(untitled)'}</h1>
      )}

      <div className="entry-meta">
        <span className="meta-when">
          Updated {formatRelativeDate(entry.updated_at)}
          {savedFlash && <span className="saved-flash"> · saved</span>}
        </span>
        {showKindPicker && editing && (
          <select className="kind-select" value={kind} onChange={(e) => { setKind(e.target.value); save({ kind: e.target.value }); }}>
            {kinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        )}
        {!editing && showKindPicker && (
          <span className="meta-pill">{kindDef(entry.top_category, kind).label}</span>
        )}
        {(tags.length > 0 || editing) && (
          <div className="tag-row">
            {tags.map((t) => (
              <span key={t} className="tag-pill">
                {t}
                {editing && <button className="tag-x" onClick={() => removeTag(t)}><X size={10} /></button>}
              </span>
            ))}
            {editing && (
              <input className="tag-input" placeholder="+ tag" value={tagDraft}
                     onChange={(e) => setTagDraft(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                     onBlur={() => tagDraft && addTag()} />
            )}
          </div>
        )}
      </div>

      {isLinks && (
        <section className="panel">
          <h3>URL</h3>
          {editing ? (
            <div className="url-row">
              <input className="url-input" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => save({ url })} placeholder="https://..." />
              {url && <button className="primary-btn" onClick={() => openExternal(url)}>
                <ExternalLink size={12} /> Open
              </button>}
            </div>
          ) : (
            url
              ? <a className="link big-link" onClick={() => openExternal(url)}><ExternalLink size={12} /> {url}</a>
              : <div className="empty">No URL set.</div>
          )}
        </section>
      )}

      {fields.length > 0 && (
        <section className="panel">
          <h3>Fields</h3>
          {editing ? (
            <div className="field-grid">
              {fields.map((f) => (
                <label key={f.key} className={f.wide ? 'wide' : ''}>
                  {f.label}
                  {f.type === 'textarea' || f.type === 'code' ? (
                    <textarea
                      className={f.type === 'code' ? 'code-input' : 'notes-area'}
                      rows={f.type === 'code' ? 10 : 4}
                      value={props[f.key] ?? ''} placeholder={f.placeholder}
                      onChange={(e) => { updateField(f.key, e.target.value); dirtyRef.current = true; }}
                      onBlur={() => save({ properties: props })}
                      spellCheck={f.type === 'code' ? false : undefined}
                    />
                  ) : (
                    <input value={props[f.key] ?? ''} placeholder={f.placeholder}
                           onChange={(e) => { updateField(f.key, e.target.value); dirtyRef.current = true; }}
                           onBlur={() => save({ properties: props })} />
                  )}
                </label>
              ))}
            </div>
          ) : (
            (() => {
              const hasAny = fields.some((f) => props[f.key]?.trim());
              if (!hasAny) return <div className="empty">No fields filled in.</div>;
              return (
                <div className="kv-rich">
                  {fields.map((f) => {
                    const val = props[f.key]?.trim();
                    if (!val) return null;
                    if (f.type === 'code') {
                      return (
                        <Fragment key={f.key}>
                          <div className="kv-section-label">{f.label}</div>
                          <CodeBlock code={val} language={f.language ?? 'sql'} />
                        </Fragment>
                      );
                    }
                    if (f.type === 'textarea') {
                      return (
                        <Fragment key={f.key}>
                          <div className="kv-section-label">{f.label}</div>
                          <div className="kv-prose-block">{val}</div>
                        </Fragment>
                      );
                    }
                    return (
                      <div className="kv-inline" key={f.key}>
                        <span className="kv-key">{f.label}</span>
                        <span className="kv-val">{val}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </section>
      )}

      {isWeekly && (
        <section className="panel weekly-panel">
          <WeeklySections sections={sections} editing={editing} onChange={setSections} />
        </section>
      )}

      {!isLinks && !hideBody && !isWeekly && (
        <section className={`panel body-panel ${editing ? 'is-editing-body' : 'is-reading-body'}`}>
          <h3>Body</h3>
          <Editor content={content || ''} onChange={(json) => { setContent(json); dirtyRef.current = true; }} editable={editing} placeholder="Empty. Click the pen above to add content." />
        </section>
      )}

      <Attachments parentKind="entry" parentId={entry.id} />
    </div>
  );
}
