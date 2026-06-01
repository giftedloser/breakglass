import { Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { Entry } from '../types';
import { getCategoryMeta } from '../lib/categories';
import { cn, formatRelativeDate } from '../lib/utils';
import { db } from '../lib/invoke';
import { useApp } from '../context/AppContext';
import { StatusBadge } from './StatusBadge';

export function EntryCard({ entry, isSelected, onClick }: { entry: Entry; isSelected: boolean; onClick: () => void }) {
  const { dispatch } = useApp();
  const meta = getCategoryMeta(entry.category);
  const severity = entry.severity === 'critical' ? 'bg-red-500' : entry.severity === 'warning' ? 'bg-amber-400' : '';
  const toggle = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      const next = await db.toggleFavorite(entry.id, 'entry');
      dispatch({ type: 'UPDATE_ENTRY', entry: { ...entry, is_favorite: next } });
    } catch (error) {
      toast.error(String(error));
    }
  };
  return (
    <button type="button" onClick={onClick} className={cn('entry-card w-full p-3 text-left transition', isSelected && 'entry-card-selected')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {severity && <span className={cn('h-2 w-2 rounded-full', severity)} />}
            <h3 className="truncate text-[12px] font-semibold text-strong">{entry.title || 'Untitled'}</h3>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <StatusBadge status={entry.status} />
            <span className={meta.badge}>{meta.label}</span>
          </div>
        </div>
        <button type="button" onClick={toggle} className="icon-button">
          <Star className={cn('h-4 w-4', entry.is_favorite && 'fill-yellow-300 text-yellow-300')} />
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {entry.tags.slice(0, 3).map((tag) => (
          <span key={tag} onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_TAG_FILTER', tag }); }} className="pill cursor-pointer">{tag}</span>
        ))}
        {entry.tags.length > 3 && <span className="text-[10px] text-muted">+{entry.tags.length - 3} more</span>}
      </div>
      <div className="mt-2 text-right text-[10px] text-muted">{formatRelativeDate(entry.updated_at)}</div>
    </button>
  );
}
