import { useCallback, useEffect, useMemo, useState } from 'react';
import { PanelRightClose, Plus, Search, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { CATEGORIES, getCategoryMeta } from '../lib/categories';
import { blankDoc } from '../lib/utils';
import { Category, Entry, EntryStatus } from '../types';
import { useApp } from '../context/AppContext';
import { EntryCard } from './EntryCard';
import { ContactForm } from './ContactForm';
import { db } from '../lib/invoke';
import toast from 'react-hot-toast';
import { ContactsGrid } from './ContactsGrid';

export function EntryList() {
  const { entries, contacts, selectedView, selectedEntryId, selectedContactId, activeTag, dispatch, refresh } = useApp();
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('new');
  const [contactForm, setContactForm] = useState<string | 'new' | null>(null);
  const isContacts = selectedView === 'contacts';
  const title = selectedView === 'all' ? 'All Entries' : selectedView === 'favorites' ? 'Favorites' : selectedView === 'in_progress' ? 'In Progress' : selectedView === 'drafts' ? 'Drafts' : getCategoryMeta(selectedView).label;

  const visible = useMemo(() => {
    let list = entries.filter((entry) => {
      const viewOk = selectedView === 'all' || (selectedView === 'favorites' && entry.is_favorite) || (selectedView === 'in_progress' && entry.status === 'in_progress') || (selectedView === 'drafts' && entry.status === 'draft') || entry.category === selectedView;
      const tagOk = !activeTag || entry.tags.includes(activeTag);
      const textOk = !filter || `${entry.title} ${entry.tags.join(' ')}`.toLowerCase().includes(filter.toLowerCase());
      return viewOk && tagOk && textOk;
    });
    list = [...list].sort((a, b) => sort === 'old' ? a.updated_at.localeCompare(b.updated_at) : sort === 'az' ? a.title.localeCompare(b.title) : sort === 'status' ? a.status.localeCompare(b.status) : b.updated_at.localeCompare(a.updated_at));
    return list;
  }, [entries, selectedView, activeTag, filter, sort]);

  const filteredContacts = contacts.filter((c) => (!filter || `${c.name} ${c.company} ${c.role}`.toLowerCase().includes(filter.toLowerCase())) && (!activeTag || c.tags.includes(activeTag)));

  const createEntry = useCallback(async () => {
    const category: Category = CATEGORIES.some((c) => c.id === selectedView) ? (selectedView as Category) : 'runbooks';
    const entry: Entry = { id: uuidv4(), title: 'Untitled Runbook', category, status: 'draft' as EntryStatus, severity: 'info', is_favorite: false, content: blankDoc, tags: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    try {
      const saved = await db.saveEntry(entry);
      dispatch({ type: 'UPDATE_ENTRY', entry: saved });
      await refresh();
    } catch (error) { toast.error(String(error)); }
  }, [dispatch, refresh, selectedView]);

  useEffect(() => {
    const handler = () => { if (isContacts) setContactForm('new'); else void createEntry(); };
    window.addEventListener('breakglass-new', handler);
    return () => window.removeEventListener('breakglass-new', handler);
  }, [createEntry, isContacts]);

  const deleteContact = async (id: string) => {
    if (!confirm('Delete this contact?')) return;
    try {
      await db.deleteContact(id);
      dispatch({ type: 'REMOVE_CONTACT', id });
      await refresh();
    } catch (error) {
      toast.error(String(error));
    }
  };

  const toggleContact = async (id: string) => {
    const contact = contacts.find((c) => c.id === id);
    if (!contact) return;
    try {
      const next = await db.toggleFavorite(id, 'contact');
      dispatch({ type: 'UPDATE_CONTACT', contact: { ...contact, is_favorite: next } });
    } catch (error) {
      toast.error(String(error));
    }
  };

  return (
    <section className="surface flex h-full w-[280px] shrink-0 flex-col border-r">
      <header className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0"><h2 className="truncate font-medium text-strong">{title}</h2><p className="text-xs text-muted">{isContacts ? filteredContacts.length : visible.length} items</p></div>
          <div className="flex items-center gap-1">
            <button type="button" title="Hide list" onClick={() => dispatch({ type: 'TOGGLE_LIST', value: true })} className="icon-button"><PanelRightClose className="h-4 w-4" /></button>
            <button onClick={isContacts ? () => setContactForm('new') : createEntry} className="icon-button" title="New"><Plus className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div className="field mt-3 flex items-center gap-2 px-2 py-1.5 text-muted"><Search className="h-3.5 w-3.5" /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter entries..." className="min-w-0 flex-1 bg-transparent text-xs text-strong outline-none" /></div>
        <div className="mt-2 flex items-center gap-2"><select value={sort} onChange={(e) => setSort(e.target.value)} className="field min-w-0 flex-1 px-2 py-1 text-[11px] text-strong"><option value="new">Updated</option><option value="old">Oldest</option><option value="az">A-Z</option><option value="status">Status</option></select>{activeTag && <button onClick={() => dispatch({ type: 'SET_TAG_FILTER', tag: null })} className="pill flex items-center gap-1">{activeTag}<X className="h-3 w-3" /></button>}</div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isContacts ? (
          <ContactsGrid
            contacts={filteredContacts}
            selectedContactId={selectedContactId}
            onSelect={(id) => dispatch({ type: 'SELECT_CONTACT', id })}
          />
        ) : visible.length ? visible.map((entry) => <EntryCard key={entry.id} entry={entry} isSelected={entry.id === selectedEntryId} onClick={() => dispatch({ type: 'SELECT_ENTRY', id: entry.id })} />) : (
          <div className="grid h-full place-items-center p-6 text-center text-muted"><div><p>No entries yet</p><button onClick={createEntry} className="secondary-button mt-3">Add entry</button></div></div>
        )}
      </div>
      {contactForm && <ContactForm contact={contactForm === 'new' ? undefined : contacts.find((c) => c.id === contactForm)} onClose={() => setContactForm(null)} />}
    </section>
  );
}
