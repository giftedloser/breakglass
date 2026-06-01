import { Star } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { topLabel } from '../lib/categories';
import { formatRelativeDate } from '../lib/utils';

export function PinnedView() {
  const { entries, contacts, selectEntry, selectContact } = useApp();
  const items = [
    ...entries.filter((e) => e.is_favorite).map((e) => ({ kind: 'entry' as const, id: e.id, title: e.title, top: e.top_category, updated_at: e.updated_at })),
    ...contacts.filter((c) => c.is_favorite).map((c) => ({ kind: 'contact' as const, id: c.id, title: c.name, top: 'contacts' as const, updated_at: c.updated_at })),
  ].sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return (
    <div className="content-pane">
      <header className="content-header">
        <h1 className="content-title">Pinned</h1>
      </header>
      <section className="panel">
        {items.length === 0 ? (
          <div className="empty">Nothing pinned yet. Open an entry or contact and click the star.</div>
        ) : (
          <ul className="row-list">
            {items.map((p) => (
              <li key={`${p.kind}-${p.id}`} className="row" onClick={() => p.kind === 'entry' ? selectEntry(p.id) : selectContact(p.id)}>
                <Star size={12} className="star-mark" />
                <span className="row-name">{p.title || '(untitled)'}</span>
                <span className="row-when">{topLabel(p.top)} · {formatRelativeDate(p.updated_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
