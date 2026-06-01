import { PanelLeftClose } from 'lucide-react';
import { CATEGORIES } from '../lib/categories';
import { cn } from '../lib/utils';
import { useApp } from '../context/AppContext';
import { SidebarView } from '../types';

export function Sidebar() {
  const { entries, categoryCounts, selectedView, theme, dispatch } = useApp();
  const count = (id: string) => categoryCounts.find((c) => c.category === id)?.count ?? 0;
  const inProgress = categoryCounts.reduce((sum, c) => sum + c.in_progress_count, 0);
  const drafts = categoryCounts.reduce((sum, c) => sum + c.draft_count, 0);
  const item = (view: SidebarView, label: string, badge: number, accent = 'border-slate-400') => (
    <button onClick={() => dispatch({ type: 'SET_VIEW', view })} className={cn('nav-item', selectedView === view && `nav-item-active ${accent}`)}>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span><span className="tabular-nums">{badge}</span>
    </button>
  );
  return (
    <aside className="surface-strong flex w-[176px] shrink-0 flex-col border-r">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <span className="min-w-0 truncate text-[13px] font-semibold uppercase tracking-[0.16em]">BreakGlass</span>
        <button type="button" title="Hide navigation" onClick={() => dispatch({ type: 'TOGGLE_NAV', value: true })} className="icon-button">
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      <nav className="space-y-0.5 py-2">
        {item('all', 'All Entries', entries.length)}
        {item('favorites', 'Favorites', entries.filter((e) => e.is_favorite).length)}
        {item('in_progress', 'In Progress', inProgress)}
        {item('drafts', 'Drafts', drafts)}
      </nav>
      <div className="my-2 h-px bg-[var(--border-soft)]" />
      <div className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Categories</div>
      <nav className="space-y-0.5">
        {CATEGORIES.map((cat) => {
          return item(cat.id, cat.label, count(cat.id), cat.tw);
        })}
      </nav>
      <div className="mt-auto p-3">
        <button onClick={() => dispatch({ type: 'TOGGLE_THEME' })} className="secondary-button w-full justify-center">
          {theme === 'dark' ? 'Dark' : 'Light'}
        </button>
      </div>
    </aside>
  );
}
