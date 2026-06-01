import { RefreshCw } from 'lucide-react';
import { EntryStatus } from '../types';
import { cn } from '../lib/utils';

export function StatusBadge({ status, clickable, onClick }: { status: EntryStatus; clickable?: boolean; onClick?: () => void }) {
  const labels: Record<EntryStatus, string> = { active: 'Active', in_progress: 'In Progress', draft: 'Draft' };
  const colors: Record<EntryStatus, string> = {
    active: 'status-active',
    in_progress: 'status-progress',
    draft: 'status-draft',
  };
  return (
    <button type="button" onClick={onClick} disabled={!clickable} className={cn('group inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase', colors[status], clickable && 'cursor-pointer hover:ring-1 hover:ring-zinc-600')}>
      {labels[status]}
      {clickable && <RefreshCw className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />}
    </button>
  );
}
