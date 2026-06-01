import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Folder as FolderIcon, Plus, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../lib/invoke';
import { ContactView } from './ContactView';

interface Props { initialFolder: string | null }
export function ContactsModule({ initialFolder }: Props) {
  const { contacts, folders, selection, selectContact, dispatch } = useApp();
  const [query, setQuery] = useState('');
  const [folderFilter, setFolderFilter] = useState<string | null>(initialFolder); // null = all, '' = uncategorized

  const contactFolders = useMemo(
    () => folders.filter((f) => f.top_category === 'contacts').sort((a, b) => a.name.localeCompare(b.name)),
    [folders]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts
      .filter((c) => {
        if (folderFilter === null) return true;
        if (folderFilter === '') return !c.folder_id;
        return c.folder_id === folderFilter;
      })
      .filter((c) => {
        if (!q) return true;
        return c.name.toLowerCase().includes(q)
          || c.company.toLowerCase().includes(q)
          || c.role.toLowerCase().includes(q)
          || c.email.toLowerCase().includes(q)
          || c.phone.includes(q);
      })
      .sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [contacts, query, folderFilter]);

  const selectedId = selection.kind === 'contact' ? selection.contact_id : null;

  const newContact = async () => {
    const name = window.prompt('New contact name');
    if (!name?.trim()) return;
    try {
      const c = await db.saveContact({
        name: name.trim(), folder_id: folderFilter || null, role: '', company: '', phone: '', email: '',
        notes: '', tags: [], is_favorite: false,
      });
      dispatch({ type: 'UPSERT_CONTACT', contact: c });
      void selectContact(c.id);
    } catch (err) { toast.error(String(err)); }
  };

  const newFolder = async () => {
    const name = window.prompt('New contacts folder');
    if (!name?.trim()) return;
    try {
      const f = await db.saveFolder({ top_category: 'contacts', parent_id: null, name: name.trim() });
      dispatch({ type: 'UPSERT_FOLDER', folder: f });
      setFolderFilter(f.id);
    } catch (err) { toast.error(String(err)); }
  };

  return (
    <div className="module-pane">
      <div className="module-header">
        <h1>Contacts</h1>
        <span className="module-count">{filtered.length} of {contacts.length}</span>
        <div className="module-search">
          <Search size={13} />
          <input placeholder="Search name, company, phone, email..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button className="ghost-btn" onClick={newFolder}>+ Folder</button>
        <button className="primary-btn" onClick={newContact}><Plus size={12} /> New contact</button>
      </div>

      {contactFolders.length > 0 && (
        <div className="module-folders">
          <button className={`module-folder-chip ${folderFilter === null ? 'is-selected' : ''}`} onClick={() => setFolderFilter(null)}>All</button>
          <button className={`module-folder-chip ${folderFilter === '' ? 'is-selected' : ''}`} onClick={() => setFolderFilter('')}>Uncategorized</button>
          {contactFolders.map((f) => (
            <button key={f.id} className={`module-folder-chip ${folderFilter === f.id ? 'is-selected' : ''}`} onClick={() => setFolderFilter(f.id)}>
              <FolderIcon size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {f.name}
            </button>
          ))}
        </div>
      )}

      <div className="module-body">
        <div className="module-list">
          {filtered.length === 0 ? (
            <div className="module-empty">No contacts match.</div>
          ) : (
            filtered.map((c) => (
              <div key={c.id} className={`module-list-row ${selectedId === c.id ? 'is-selected' : ''}`} onClick={() => selectContact(c.id)}>
                <div className="row-main">
                  <div className="row-title">{c.is_favorite ? '★ ' : ''}{c.name}</div>
                  <div className="row-sub">{c.company || c.role || c.email || c.phone || '—'}</div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="module-detail">
          {selectedId
            ? <ContactView contactId={selectedId} />
            : <div className="module-empty">Select a contact from the list.</div>}
        </div>
      </div>
    </div>
  );
}
