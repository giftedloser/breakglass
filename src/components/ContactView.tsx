import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, FolderInput, Pencil, Save, Star, Trash2, X } from 'lucide-react';
import { MoveDialog } from './MoveDialog';
import { useApp } from '../context/AppContext';
import { db } from '../lib/invoke';
import { topLabel } from '../lib/categories';
import { copyToClipboard, formatRelativeDate } from '../lib/utils';
import { Folder } from '../types';
import { Attachments } from './Attachments';

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

export function ContactView({ contactId }: { contactId: string }) {
  const { contacts, folders, dispatch, selectFolder, selectTop, goHome } = useApp();
  const contact = contacts.find((c) => c.id === contactId);

  const [name, setName] = useState(contact?.name ?? '');
  const [role, setRole] = useState(contact?.role ?? '');
  const [company, setCompany] = useState(contact?.company ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [tags, setTags] = useState<string[]>(contact?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const noDetails = !(contact?.role || contact?.company || contact?.phone || contact?.email);
  const [editingDetails, setEditingDetails] = useState(noDetails);
  const [editingNotes, setEditingNotes] = useState(false);

  useEffect(() => {
    if (!contact) return;
    setName(contact.name);
    setRole(contact.role);
    setCompany(contact.company);
    setPhone(contact.phone);
    setEmail(contact.email);
    setNotes(contact.notes);
    setTags(contact.tags);
    setEditingDetails(!(contact.role || contact.company || contact.phone || contact.email));
    setEditingNotes(false);
  }, [contactId]);

  const save = async (overrides: Partial<{ name: string; role: string; company: string; phone: string; email: string; notes: string; tags: string[]; is_favorite: boolean }> = {}) => {
    if (!contact) return;
    try {
      const saved = await db.saveContact({
        id: contact.id, folder_id: contact.folder_id,
        name: overrides.name ?? name, role: overrides.role ?? role, company: overrides.company ?? company,
        phone: overrides.phone ?? phone, email: overrides.email ?? email, notes: overrides.notes ?? notes,
        tags: overrides.tags ?? tags, is_favorite: overrides.is_favorite ?? contact.is_favorite,
      });
      dispatch({ type: 'UPSERT_CONTACT', contact: saved });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 900);
    } catch (err) { toast.error(String(err)); }
  };

  const togglePin = async () => contact && save({ is_favorite: !contact.is_favorite });

  const remove = async () => {
    if (!contact) return;
    if (!window.confirm(`Delete contact "${contact.name}"?`)) return;
    try {
      await db.deleteContact(contact.id);
      dispatch({ type: 'REMOVE_CONTACT', id: contact.id });
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

  const path = useMemo(() => folderPath(contact?.folder_id ?? null, folders), [contact?.folder_id, folders]);

  if (!contact) return <div className="content-pane"><div className="empty">Contact not found.</div></div>;

  const doCopy = async (val: string, label: string) => {
    if (!val) return;
    await copyToClipboard(val);
    toast.success(`${label} copied`);
  };

  return (
    <div className="content-pane">
      <header className="content-header">
        <div className="crumbs">
          <button className="crumb-link" onClick={goHome}>Home</button>
          <span className="crumb-sep">/</span>
          <button className="crumb-link" onClick={() => selectTop('contacts')}>{topLabel('contacts')}</button>
          {path.map((p) => (
            <span key={p.id}>
              <span className="crumb-sep">/</span>
              <button className="crumb-link" onClick={() => selectFolder(p.id)}>{p.name}</button>
            </span>
          ))}
          <span className="crumb-sep">/</span>
          <b>{contact.name || '(unnamed)'}</b>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={togglePin} title={contact.is_favorite ? 'Unpin' : 'Pin'}>
            <Star size={14} className={contact.is_favorite ? 'star-mark filled' : ''} />
          </button>
          <button className="icon-btn" onClick={() => setMoveOpen(true)} title="Move to..."><FolderInput size={14} /></button>
          <button className="icon-btn danger" onClick={remove} title="Delete contact"><Trash2 size={14} /></button>
        </div>
      </header>
      {moveOpen && (
        <MoveDialog kind="contact" id={contact.id} currentTop="contacts"
                    currentFolderId={contact.folder_id} onClose={() => setMoveOpen(false)} />
      )}

      <div className="entry-title-row">
        <input className="entry-title-input plain-on-blur" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => save({ name })} />
      </div>

      <div className="entry-meta">
        <span className="meta-when">
          Updated {formatRelativeDate(contact.updated_at)}
          {savedFlash && <span className="saved-flash"> · saved</span>}
        </span>
        <div className="tag-row">
          {tags.map((t) => (
            <span key={t} className="tag-pill">
              {t}{editingDetails && <button className="tag-x" onClick={() => removeTag(t)}><X size={10} /></button>}
            </span>
          ))}
          {editingDetails && (
            <input className="tag-input" placeholder="+ tag" value={tagDraft}
                   onChange={(e) => setTagDraft(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                   onBlur={() => tagDraft && addTag()} />
          )}
        </div>
      </div>

      <section className={`panel meta-panel ${editingDetails ? 'is-editing' : 'is-collapsed'}`}>
        <div className="body-head">
          <h3>Details</h3>
          {editingDetails
            ? <button className="primary-btn" onClick={async () => { await save(); setEditingDetails(false); }}>
                <Save size={12} /> Done
              </button>
            : <button className="ghost-btn" onClick={() => setEditingDetails(true)}>
                <Pencil size={12} /> Edit
              </button>}
        </div>
        {editingDetails ? (
          <div className="field-grid">
            <label>Role <input value={role} onChange={(e) => setRole(e.target.value)} onBlur={() => save({ role })} /></label>
            <label>Company <input value={company} onChange={(e) => setCompany(e.target.value)} onBlur={() => save({ company })} /></label>
            <label>Phone
              <div className="copy-field">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => save({ phone })} />
                <button className="copy-btn" onClick={() => doCopy(phone, 'Phone')}><Copy size={12} /></button>
              </div>
            </label>
            <label>Email
              <div className="copy-field">
                <input value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => save({ email })} />
                <button className="copy-btn" onClick={() => doCopy(email, 'Email')}><Copy size={12} /></button>
              </div>
            </label>
          </div>
        ) : (
          (role || company || phone || email) ? (
            <dl className="kv-list">
              {role && <><dt>Role</dt><dd>{role}</dd></>}
              {company && <><dt>Company</dt><dd>{company}</dd></>}
              {phone && <><dt>Phone</dt><dd>
                {phone}
                <button className="inline-copy" onClick={() => doCopy(phone, 'Phone')} title="Copy"><Copy size={11} /></button>
              </dd></>}
              {email && <><dt>Email</dt><dd>
                <a className="link" onClick={() => doCopy(email, 'Email')}>{email}</a>
                <button className="inline-copy" onClick={() => doCopy(email, 'Email')} title="Copy"><Copy size={11} /></button>
              </dd></>}
            </dl>
          ) : <div className="empty">No contact details yet. Click "Edit" to add phone, email, role, company.</div>
        )}
      </section>

      <section className={`panel meta-panel ${editingNotes ? 'is-editing' : 'is-collapsed'}`}>
        <div className="body-head">
          <h3>Notes</h3>
          {editingNotes
            ? <button className="primary-btn" onClick={async () => { await save({ notes }); setEditingNotes(false); }}>
                <Save size={12} /> Done
              </button>
            : <button className="ghost-btn" onClick={() => setEditingNotes(true)}>
                <Pencil size={12} /> Edit
              </button>}
        </div>
        {editingNotes
          ? <textarea className="notes-area" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => save({ notes })} placeholder="Any extra notes..." />
          : notes
            ? <div className="notes-readonly">{notes}</div>
            : <div className="empty">No notes.</div>
        }
      </section>

      <Attachments parentKind="contact" parentId={contact.id} />
    </div>
  );
}
