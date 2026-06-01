import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ExternalLink, Plus, Star, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db, openExternal } from '../lib/invoke';
import { formatRelativeDate } from '../lib/utils';

export function AppDetail({ appId }: { appId: string }) {
  const { apps, entries, dispatch, selectEntry } = useApp();
  const app = apps.find((a) => a.id === appId);

  const [name, setName] = useState(app?.name ?? '');
  const [vendor, setVendor] = useState(app?.vendor ?? '');
  const [url, setUrl] = useState(app?.url ?? '');
  const [loginNotes, setLoginNotes] = useState(app?.login_notes ?? '');
  const [criticality, setCriticality] = useState(app?.criticality ?? '');
  const [tags, setTags] = useState<string[]>(app?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!app) return;
    setName(app.name); setVendor(app.vendor); setUrl(app.url); setLoginNotes(app.login_notes);
    setCriticality(app.criticality); setTags(app.tags);
  }, [appId]);

  const save = async (overrides: Partial<{ name: string; vendor: string; url: string; login_notes: string; criticality: string; tags: string[]; is_favorite: boolean }> = {}) => {
    if (!app) return;
    try {
      const saved = await db.saveApp({
        id: app.id, folder_id: app.folder_id,
        name: overrides.name ?? name, vendor: overrides.vendor ?? vendor, url: overrides.url ?? url,
        login_notes: overrides.login_notes ?? loginNotes, criticality: overrides.criticality ?? criticality,
        tags: overrides.tags ?? tags, is_favorite: overrides.is_favorite ?? app.is_favorite,
      });
      dispatch({ type: 'UPSERT_APP', app: saved });
      setSavedFlash(true); window.setTimeout(() => setSavedFlash(false), 900);
    } catch (err) { toast.error(String(err)); }
  };

  const togglePin = async () => app && save({ is_favorite: !app.is_favorite });

  const remove = async () => {
    if (!app) return;
    const count = entries.filter((e) => e.app_id === app.id).length;
    const msg = count > 0
      ? `Delete app "${app.name}"?\n\nThe app has ${count} entries. Click OK to also delete those entries, or Cancel to keep them (they'll become orphan entries with no app).`
      : `Delete app "${app.name}"?`;
    if (!window.confirm(msg)) return;
    const cascade = count > 0 ? window.confirm(`Also delete the ${count} entries under this app? (Cancel = keep them as orphans)`) : false;
    try {
      await db.deleteApp(app.id, cascade);
      dispatch({ type: 'REMOVE_APP', id: app.id });
    } catch (err) { toast.error(String(err)); }
  };

  const addTag = () => {
    const t = tagDraft.trim().toLowerCase();
    if (!t || tags.includes(t)) { setTagDraft(''); return; }
    const next = [...tags, t];
    setTags(next); setTagDraft('');
    void save({ tags: next });
  };

  const removeTag = (t: string) => {
    const next = tags.filter((x) => x !== t);
    setTags(next); void save({ tags: next });
  };

  const addEntry = async () => {
    if (!app) return;
    const title = window.prompt(`New entry under "${app.name}" (e.g. "license renewal", "install steps")`);
    if (!title?.trim()) return;
    try {
      const e = await db.saveEntry({
        title: title.trim(), top_category: 'apps', folder_id: null, app_id: app.id,
        kind: 'generic', properties: '{}',
        is_favorite: false, content: '', url: null, tags: [],
      });
      dispatch({ type: 'UPSERT_ENTRY', entry: e });
      void selectEntry(e.id);
    } catch (err) { toast.error(String(err)); }
  };

  if (!app) return <div className="module-empty">App not found.</div>;

  const childEntries = entries
    .filter((e) => e.app_id === app.id)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="content-pane">
      <div className="app-detail-header">
        <input className="entry-title-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => save({ name })} />
        <div className="header-actions">
          <button className="icon-btn" onClick={togglePin} title={app.is_favorite ? 'Unpin' : 'Pin'}>
            <Star size={14} className={app.is_favorite ? 'star-mark filled' : ''} />
          </button>
          <button className="icon-btn danger" onClick={remove} title="Delete app"><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="entry-meta">
        <span className="meta-when">Updated {formatRelativeDate(app.updated_at)}
          {savedFlash && <span className="saved-flash"> · saved</span>}
        </span>
        <select className="kind-select" value={criticality} onChange={(e) => { setCriticality(e.target.value); save({ criticality: e.target.value }); }}>
          <option value="">No criticality</option>
          <option value="high">High criticality</option>
          <option value="medium">Medium criticality</option>
          <option value="low">Low criticality</option>
        </select>
        <div className="tag-row">
          {tags.map((t) => (
            <span key={t} className="tag-pill">
              {t}<button className="tag-x" onClick={() => removeTag(t)}><X size={10} /></button>
            </span>
          ))}
          <input className="tag-input" placeholder="+ tag" value={tagDraft}
                 onChange={(e) => setTagDraft(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                 onBlur={() => tagDraft && addTag()} />
        </div>
      </div>

      <section className="panel">
        <h3>App info</h3>
        <div className="field-grid">
          <label>Vendor <input value={vendor} onChange={(e) => setVendor(e.target.value)} onBlur={() => save({ vendor })} /></label>
          <label>URL
            <div className="copy-field">
              <input value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => save({ url })} placeholder="https://..." />
              {url && <button className="copy-btn" onClick={() => openExternal(url)} title="Open"><ExternalLink size={12} /></button>}
            </div>
          </label>
          <label className="wide">Login / access notes
            <textarea className="notes-area" rows={3} value={loginNotes} onChange={(e) => setLoginNotes(e.target.value)} onBlur={() => save({ login_notes: loginNotes })} placeholder="SSO via Okta. Break-glass account in Bitwarden as 'app-admin'." />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="body-head">
          <h3>Entries ({childEntries.length})</h3>
          <button className="primary-btn" onClick={addEntry}><Plus size={12} /> New entry</button>
        </div>
        {childEntries.length === 0
          ? <div className="empty">No entries yet. Add one for each runbook, procedure, or note about this app.</div>
          : (
            <ul className="row-list">
              {childEntries.map((e) => (
                <li key={e.id} className="row" onClick={() => selectEntry(e.id)}>
                  <span className="row-name">{e.is_favorite ? '★ ' : ''}{e.title || '(untitled)'}</span>
                  <span className="row-when">{formatRelativeDate(e.updated_at)}</span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
