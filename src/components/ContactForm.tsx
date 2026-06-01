import { useState } from 'react';
import toast from 'react-hot-toast';
import { Contact, ContactInput } from '../types';
import { db } from '../lib/invoke';
import { useApp } from '../context/AppContext';

const empty: ContactInput = { name: '', role: '', company: '', phone: '', email: '', notes: '', tags: [], is_favorite: false };

export function ContactForm({ contact, onClose }: { contact?: Contact; onClose: () => void }) {
  const { dispatch, refresh } = useApp();
  const [form, setForm] = useState<ContactInput>(contact ? { ...contact } : empty);
  const [tag, setTag] = useState('');
  const set = (field: keyof ContactInput, value: string | boolean | string[]) => setForm((prev) => ({ ...prev, [field]: value }));
  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    try {
      const saved = await db.saveContact(form);
      dispatch({ type: 'UPDATE_CONTACT', contact: saved });
      await refresh();
      toast.success('Contact saved');
      onClose();
    } catch (error) {
      toast.error(String(error));
    }
  };
  const addTag = () => {
    const value = tag.trim();
    if (value && !form.tags.includes(value)) set('tags', [...form.tags, value]);
    setTag('');
  };
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/45 p-6 backdrop-blur-sm">
      <div className="surface-strong w-full max-w-lg rounded-xl border p-5 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-strong">{contact ? 'Edit Contact' : 'New Contact'}</h2>
        <div className="grid gap-3">
          {(['name', 'role', 'company', 'phone', 'email'] as const).map((field) => (
            <input key={field} value={String(form[field])} onChange={(e) => set(field, e.target.value)} placeholder={field[0].toUpperCase() + field.slice(1)} className="field px-3 py-2 text-strong outline-none" />
          ))}
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Notes" rows={5} className="field px-3 py-2 text-strong outline-none" />
          <div className="flex flex-wrap gap-2">
            {form.tags.map((item) => <button key={item} onClick={() => set('tags', form.tags.filter((t) => t !== item))} className="pill">{item} x</button>)}
            <input value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }} placeholder="+ tag" className="w-24 bg-transparent text-sm text-strong outline-none" />
          </div>
          <label className="flex items-center gap-2 text-sm text-strong"><input type="checkbox" checked={form.is_favorite} onChange={(e) => set('is_favorite', e.target.checked)} /> Favorite</label>
        </div>
        <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="secondary-button">Cancel</button><button onClick={save} className="primary-button">Save</button></div>
      </div>
    </div>
  );
}
