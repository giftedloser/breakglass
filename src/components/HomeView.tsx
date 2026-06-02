import { useApp } from '../context/AppContext';
import { topLabel } from '../lib/categories';
import { formatRelativeDate } from '../lib/utils';
import { db, openExternal } from '../lib/invoke';
import { AlertTriangle, AppWindow, CalendarClock, Plus, Star, StickyNote } from 'lucide-react';
import { format, startOfWeek } from 'date-fns';
import toast from 'react-hot-toast';

export function HomeView() {
  const { entries, contacts, apps, recents, dispatch, selectEntry, selectContact, selectApp, selectTop } = useApp();
  const entriesById = new Map(entries.map((e) => [e.id, e]));

  const openItem = (kind: 'entry' | 'contact' | 'app', id: string) => {
    if (kind === 'entry') {
      const e = entriesById.get(id);
      if (e && e.top_category === 'sitelinks' && e.url) { void openExternal(e.url); return; }
      void selectEntry(id);
    } else if (kind === 'app') {
      void selectApp(id);
    } else {
      void selectContact(id);
    }
  };

  const pinned = [
    ...entries.filter((e) => e.is_favorite).map((e) => ({ kind: 'entry' as const, id: e.id, title: e.title, top: e.top_category, updated_at: e.updated_at })),
    ...contacts.filter((c) => c.is_favorite).map((c) => ({ kind: 'contact' as const, id: c.id, title: c.name, top: 'contacts' as const, updated_at: c.updated_at })),
    ...apps.filter((a) => a.is_favorite).map((a) => ({ kind: 'app' as const, id: a.id, title: a.name, top: 'apps' as const, updated_at: a.updated_at })),
  ].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 16);

  const emergencyItems = entries
    .filter((e) => e.top_category === 'emergency')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const weeklyReports = entries
    .filter((e) => e.top_category === 'weekly')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const noteItems = entries.filter((e) => e.top_category === 'notes');

  const newWeeklyReport = async () => {
    const weekOf = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    try {
      const report = await db.saveEntry({
        title: `Weekly report - ${weekOf}`,
        top_category: 'weekly',
        folder_id: null,
        app_id: null,
        kind: 'report',
        properties: JSON.stringify({ week_of: weekOf, sections: '[]' }),
        is_favorite: false,
        content: '',
        url: null,
        tags: ['weekly'],
      });
      dispatch({ type: 'UPSERT_ENTRY', entry: report });
      void selectEntry(report.id);
    } catch (err) {
      toast.error(String(err));
    }
  };

  const statCards = [
    { label: 'Emergency', value: emergencyItems.length, icon: AlertTriangle, action: () => selectTop('emergency') },
    { label: 'Applications', value: apps.length, icon: AppWindow, action: () => selectTop('apps') },
    { label: 'Weekly notes', value: weeklyReports.length, icon: CalendarClock, action: () => selectTop('weekly') },
    { label: 'Notes', value: noteItems.length, icon: StickyNote, action: () => selectTop('notes') },
  ];

  return (
    <div className="content-pane">
      <section className="home-command-strip">
        <div className="home-command-copy">
          <span className="home-kicker">BreakGlass mode</span>
          <strong>Start with what matters under pressure.</strong>
        </div>
        <div className="home-command-actions">
          <button className="primary-btn" onClick={() => selectTop('emergency')}><AlertTriangle size={12} /> Emergency</button>
          <button className="ghost-btn" onClick={newWeeklyReport}><Plus size={12} /> Weekly report</button>
        </div>
      </section>

      <section className="home-stats">
        {statCards.map(({ label, value, icon: Icon, action }) => (
          <button key={label} className="home-stat" onClick={action}>
            <Icon size={14} />
            <span>{label}</span>
            <strong>{value}</strong>
          </button>
        ))}
      </section>

      <section className="panel">
        <h3>Pinned</h3>
        {pinned.length === 0 ? (
          <div className="empty composed-empty">Nothing pinned yet. Star an entry, app, or contact to keep it one click away.</div>
        ) : (
          <ul className="row-list">
            {pinned.map((p) => (
              <li key={`${p.kind}-${p.id}`} className="row" onClick={() => openItem(p.kind, p.id)}>
                <Star size={12} className="star-mark" />
                <span className="row-name">{p.title || '(untitled)'}</span>
                <span className="row-when">{topLabel(p.top)} · {formatRelativeDate(p.updated_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h3>Weekly reports</h3>
        {weeklyReports.length === 0 ? (
          <div className="empty composed-empty">No weekly reports yet. Create one, jot notes all week, then switch to report draft when you are ready.</div>
        ) : (
          <ul className="row-list">
            {weeklyReports.slice(0, 5).map((e) => (
              <li key={e.id} className="row" onClick={() => selectEntry(e.id)}>
                <CalendarClock size={12} />
                <span className="row-name">{e.title || '(untitled)'}</span>
                <span className="row-when">{formatRelativeDate(e.updated_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h3>Recent</h3>
        {recents.length === 0 ? (
          <div className="empty">No recents yet. Open something and it'll show up here.</div>
        ) : (
          <ul className="row-list">
            {recents.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="row" onClick={() => openItem(r.kind, r.id)}>
                <span className="row-name">{r.title || '(untitled)'}</span>
                <span className="row-when">{topLabel(r.top_category)} · {formatRelativeDate(r.viewed_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
