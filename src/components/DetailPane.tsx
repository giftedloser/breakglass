import { useEffect, useMemo, useState } from 'react';
import { Copy, FileText, MoreVertical, PenLine, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../lib/invoke';
import { CATEGORIES, getCategoryMeta } from '../lib/categories';
import { blankDoc, copyToClipboard, formatRelativeDate } from '../lib/utils';
import { Category, EntryInput, EntryStatus, Severity } from '../types';
import { useApp } from '../context/AppContext';
import { StatusBadge } from './StatusBadge';
import { Editor } from './Editor';

export function DetailPane() {
  const { entries, contacts, selectedEntryId, selectedContactId, dispatch, refresh } = useApp();
  const entry = entries.find((e) => e.id === selectedEntryId) ?? null;
  const contact = contacts.find((c) => c.id === selectedContactId) ?? null;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EntryInput | null>(null);
  const [tagText, setTagText] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (entry) setForm({ ...entry });
    setEditing(false);
  }, [entry?.id]);

  useEffect(() => {
    const handler = () => { if (editing) void save(); };
    window.addEventListener('breakglass-save', handler);
    return () => window.removeEventListener('breakglass-save', handler);
  });

  const dirty = useMemo(() => entry && form ? JSON.stringify({ ...entry, created_at: undefined, updated_at: undefined }) !== JSON.stringify({ ...form, created_at: undefined, updated_at: undefined }) : false, [entry, form]);

  const save = async () => {
    if (!form) return;
    try {
      const saved = await db.saveEntry({ ...form, title: form.title.trim() || 'Untitled', content: form.content || blankDoc });
      dispatch({ type: 'UPDATE_ENTRY', entry: saved });
      await refresh();
      setEditing(false);
      toast.success('Saved');
    } catch (error) { toast.error(String(error)); }
  };

  if (contact) {
    return (
      <main className="workspace flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-semibold text-strong">{contact.name}</h1>
          <p className="mt-1 text-muted">{contact.role} {contact.company && `at ${contact.company}`}</p>
          <div className="surface mt-6 grid gap-3 rounded-lg border p-5">
            <button onClick={() => void copyToClipboard(contact.phone).then(() => toast.success('Copied!'))} className="flex justify-between text-strong"><span>{contact.phone || 'No phone'}</span><Copy className="h-4 w-4" /></button>
            <button onClick={() => void copyToClipboard(contact.email).then(() => toast.success('Copied!'))} className="flex justify-between text-strong"><span>{contact.email || 'No email'}</span><Copy className="h-4 w-4" /></button>
            <pre className="workspace mt-3 whitespace-pre-wrap rounded p-4 text-sm text-strong">{contact.notes}</pre>
          </div>
        </div>
      </main>
    );
  }

  if (!entry || !form) {
    return <main className="workspace grid flex-1 place-items-center"><div className="text-center text-muted"><FileText className="mx-auto mb-3 h-8 w-8" /><p>Select an entry to view it</p></div></main>;
  }

  const meta = getCategoryMeta(entry.category);
  const addTag = () => {
    const value = tagText.trim();
    if (value && !form.tags.includes(value)) setForm({ ...form, tags: [...form.tags, value] });
    setTagText('');
  };
  const cycle = async () => {
    try {
      const status = await db.cycleStatus(entry.id) as EntryStatus;
      dispatch({ type: 'UPDATE_ENTRY', entry: { ...entry, status } });
      await refresh();
    } catch (error) { toast.error(String(error)); }
  };
  const remove = async () => {
    if (!confirm('Delete this entry?')) return;
    try {
      await db.deleteEntry(entry.id);
      dispatch({ type: 'REMOVE_ENTRY', id: entry.id });
      await refresh();
    } catch (error) { toast.error(String(error)); }
  };
  const duplicate = async () => {
    try {
      const saved = await db.saveEntry({ ...entry, id: undefined, title: `${entry.title} copy` });
      dispatch({ type: 'UPDATE_ENTRY', entry: saved });
      await refresh();
      setMoreOpen(false);
      toast.success('Entry duplicated');
    } catch (error) { toast.error(String(error)); }
  };
  const changeSeverity = async (severity: Severity) => {
    try {
      const saved = await db.saveEntry({ ...entry, severity });
      dispatch({ type: 'UPDATE_ENTRY', entry: saved });
      await refresh();
      setMoreOpen(false);
      toast.success('Severity updated');
    } catch (error) { toast.error(String(error)); }
  };

  return (
    <main className="workspace flex-1 overflow-y-auto">
      <div className="flex min-h-full flex-col px-8 py-6">
        <header className="mb-4">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              {editing ? <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border-b bg-transparent pb-2 text-2xl font-semibold text-strong outline-none" /> : <h1 className="truncate text-2xl font-semibold text-strong">{entry.title}</h1>}
              <p className="mt-2 text-[11px] text-muted">Updated {formatRelativeDate(entry.updated_at)} / Created {formatRelativeDate(entry.created_at)}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              {editing ? <><button onClick={() => { setForm({ ...entry }); setEditing(false); }} className="secondary-button">Cancel</button><button onClick={() => void save()} className="primary-button">Save</button></> : <><button onClick={() => setEditing(true)} className="secondary-button relative"><PenLine className="inline h-4 w-4" /> {dirty && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-sky-400" />}</button><button onClick={() => void remove()} className="danger-button"><Trash2 className="h-4 w-4" /></button><div className="relative"><button onClick={() => setMoreOpen((value) => !value)} className="secondary-button"><MoreVertical className="h-4 w-4" /></button>{moreOpen && <div className="surface-strong absolute right-0 z-10 mt-2 w-44 rounded-md border p-1 shadow-xl"><button onClick={() => void duplicate()} className="menu-item">Duplicate entry</button><div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase text-muted">Change severity</div>{(['info', 'warning', 'critical'] as Severity[]).map((severity) => <button key={severity} onClick={() => void changeSeverity(severity)} className="menu-item capitalize">{severity}</button>)}</div>}</div></>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {editing ? (
              <>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EntryStatus })} className="field px-2 py-1 text-sm text-strong">{['draft', 'in_progress', 'active'].map((s) => <option key={s}>{s}</option>)}</select>
                <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })} className="field px-2 py-1 text-sm text-strong">{['info', 'warning', 'critical'].map((s) => <option key={s}>{s}</option>)}</select>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })} className="field px-2 py-1 text-sm text-strong">{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
              </>
            ) : (
              <><StatusBadge status={entry.status} clickable onClick={() => void cycle()} /><span className="pill uppercase">{entry.severity}</span><span className={meta.badge}>{meta.label}</span></>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {form.tags.map((tag) => <button key={tag} disabled={!editing} onClick={() => setForm({ ...form, tags: form.tags.filter((t) => t !== tag) })} className="pill">{tag}{editing && ' x'}</button>)}
            {editing && <input value={tagText} onChange={(e) => setTagText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }} placeholder="+ Add tag" className="w-24 bg-transparent text-sm text-strong outline-none" />}
          </div>
        </header>
        <Editor content={form.content} onChange={(content) => setForm({ ...form, content })} editable={editing} />
      </div>
    </main>
  );
}
