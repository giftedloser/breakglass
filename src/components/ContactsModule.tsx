import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ListRowMenu } from './ListRowMenu';
import { Plus } from 'lucide-react';
import { ModuleFolderChips } from './ModuleFolderChips';
import { bgConfirm, bgPrompt } from '../lib/dialogs';
import { useApp } from '../context/AppContext';
import { db } from '../lib/invoke';
import { ContactView } from './ContactView';

interface Props { initialFolder: string | null }
export function ContactsModule({ initialFolder }: Props) {
  const { contacts, folders, selection, selectContact, dispatch } = useApp();
  const [folderFilter, setFolderFilter] = useState<string | null>(initialFolder);

  const contactFolders = useMemo(
    () => folders.filter((f) => f.top_category === 'contacts').sort((a, b) => a.name.localeCompare(b.name)),
    [folders]
  );

  const filtered = useMemo(() => {
    return contacts
      .filter((c) => {
        if (folderFilter === null) return true;
        if (folderFilter === '') return !c.folder_id;
        return c.folder_id === folderFilter;
      })
      .sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [contacts, folderFilter]);

  const selectedId = selection.kind === 'contact' ? selection.contact_id : null;

  const newContact = async () => {
    const name = await bgPrompt({ title: 'New contact name', placeholder: 'e.g. Sarah Chen' });
    if (!name) return;
    try {
      const c = await db.saveContact({
        name, folder_id: folderFilter || null, role: '', company: '', phone: '', email: '',
        notes: '', tags: [], is_favorite: false,
      });
      dispatch({ type: 'UPSERT_CONTACT', contact: c });
      void selectContact(c.id);
    } catch (err) { toast.error(String(err)); }
  };

  const newFolder = async () => {
    const name = await bgPrompt({ title: 'New contacts folder', placeholder: 'e.g. Vendors' });
    if (!name) return;
    try {
      const f = await db.saveFolder({ top_category: 'contacts', parent_id: null, name });
      dispatch({ type: 'UPSERT_FOLDER', folder: f });
      setFolderFilter(f.id);
    } catch (err) { toast.error(String(err)); }
  };

  return (
    <div className="module-pane">
      <div className="module-header">
        <h1>Contacts</h1>
        <span className="module-count">{filtered.length}{filtered.length !== contacts.length ? ` of ${contacts.length}` : ''}</span>
        <ModuleFolderChips
          folders={contactFolders}
          selected={folderFilter}
          onSelect={setFolderFilter}
        />
        <div className="module-header-right">
          <button className="ghost-btn" onClick={newFolder}>+ Folder</button>
          <button className="primary-btn" onClick={newContact}><Plus size={12} /> New</button>
        </div>
      </div>

      <div className="module-body">
        <div className="module-list">
          {filtered.length === 0 ? (
            <div className="module-empty">No contacts match this folder. Add one here or switch back to All.</div>
          ) : (
            filtered.map((c) => {
              const togglePin = async () => {
                try {
                  const saved = await db.saveContact({
                    id: c.id, folder_id: c.folder_id, name: c.name, role: c.role, company: c.company,
                    phone: c.phone, email: c.email, notes: c.notes, tags: c.tags, is_favorite: !c.is_favorite,
                  });
                  dispatch({ type: 'UPSERT_CONTACT', contact: saved });
                } catch (err) { toast.error(String(err)); }
              };
              const rename = async () => {
                const next = await bgPrompt({ title: 'Rename contact', defaultValue: c.name });
                if (!next || next === c.name) return;
                try {
                  const saved = await db.saveContact({
                    id: c.id, folder_id: c.folder_id, name: next, role: c.role, company: c.company,
                    phone: c.phone, email: c.email, notes: c.notes, tags: c.tags, is_favorite: c.is_favorite,
                  });
                  dispatch({ type: 'UPSERT_CONTACT', contact: saved });
                } catch (err) { toast.error(String(err)); }
              };
              const remove = async () => {
                const ok = await bgConfirm({ title: `Delete "${c.name}"?`, confirmLabel: 'Delete', danger: true });
                if (!ok) return;
                try { await db.deleteContact(c.id); dispatch({ type: 'REMOVE_CONTACT', id: c.id }); }
                catch (err) { toast.error(String(err)); }
              };
              return (
                <ListRowMenu key={c.id}
                  className={`module-list-row ${selectedId === c.id ? 'is-selected' : ''}`}
                  onClick={() => selectContact(c.id)}
                  items={[
                    { label: c.is_favorite ? 'Unpin' : 'Pin', onClick: togglePin },
                    { label: 'Rename', onClick: rename },
                    { label: 'Delete', onClick: remove, danger: true },
                  ]}>
                  <div className="row-main">
                    <div className="row-title">{c.is_favorite ? '★ ' : ''}{c.name}</div>
                    <div className="row-sub">{c.company || c.role || c.email || c.phone || '—'}</div>
                  </div>
                </ListRowMenu>
              );
            })
          )}
        </div>
        <div className="module-detail">
          {selectedId
            ? <ContactView key={selectedId} contactId={selectedId} />
            : <div className="module-empty">Select a contact to view phone, email, notes, and attachments.</div>}
        </div>
      </div>
    </div>
  );
}
