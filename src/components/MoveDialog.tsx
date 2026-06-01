import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, FolderClosed, FolderOpen, Home as HomeIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../lib/invoke';
import { TOP_BY_ID, TOPS, topLabel } from '../lib/categories';
import { Folder, TopCategory } from '../types';

interface Props {
  kind: 'entry' | 'contact';
  id: string;
  currentTop: TopCategory;
  currentFolderId: string | null;
  onClose: () => void;
}

export function MoveDialog({ kind, id, currentTop, currentFolderId, onClose }: Props) {
  const { folders, dispatch } = useApp();
  const [top, setTop] = useState<TopCategory>(currentTop);
  const [folderId, setFolderId] = useState<string | null>(currentFolderId);

  // Contacts can only live under Contacts.
  const eligibleTops = kind === 'contact' ? [TOP_BY_ID['contacts']] : TOPS;

  const tree = useMemo(() => {
    const byParent: Record<string, Folder[]> = {};
    for (const f of folders.filter((f) => f.top_category === top)) {
      const key = f.parent_id ?? '__root__';
      (byParent[key] ||= []).push(f);
    }
    for (const k of Object.keys(byParent)) byParent[k].sort((a, b) => a.name.localeCompare(b.name));
    return byParent;
  }, [folders, top]);

  const renderBranch = (parentKey: string, depth: number): JSX.Element[] => {
    const kids = tree[parentKey] || [];
    return kids.flatMap((f) => [
      <button key={f.id} className={`move-row ${folderId === f.id ? 'is-selected' : ''}`}
              style={{ paddingLeft: 12 + depth * 16 }}
              onClick={() => setFolderId(f.id)}>
        {folderId === f.id ? <FolderOpen size={13} /> : <FolderClosed size={13} />}
        <span>{f.name}</span>
        {folderId === f.id && <Check size={12} className="move-check" />}
      </button>,
      ...renderBranch(f.id, depth + 1),
    ]);
  };

  const apply = async () => {
    try {
      if (kind === 'entry') {
        const moved = await db.moveEntry(id, top, folderId);
        dispatch({ type: 'UPSERT_ENTRY', entry: moved });
      } else {
        const moved = await db.moveContact(id, folderId);
        dispatch({ type: 'UPSERT_CONTACT', contact: moved });
      }
      toast.success('Moved');
      onClose();
    } catch (err) { toast.error(String(err)); }
  };

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="export-panel" onClick={(e) => e.stopPropagation()}>
        <div className="export-header">
          <h2>Move to...</h2>
          <button className="search-esc" onClick={onClose}>close</button>
        </div>

        {kind === 'entry' && (
          <div className="move-tops">
            {eligibleTops.map((t) => (
              <button key={t.id} className={`move-top-btn ${top === t.id ? 'is-selected' : ''}`}
                      onClick={() => { setTop(t.id); setFolderId(null); }}>
                {topLabel(t.id)}
              </button>
            ))}
          </div>
        )}

        <div className="move-list">
          <button className={`move-row ${folderId === null ? 'is-selected' : ''}`} onClick={() => setFolderId(null)} style={{ paddingLeft: 12 }}>
            <HomeIcon size={13} />
            <span>(top of {topLabel(top)})</span>
            {folderId === null && <Check size={12} className="move-check" />}
          </button>
          {renderBranch('__root__', 0)}
        </div>

        <div className="move-actions">
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={apply}>Move</button>
        </div>
      </div>
    </div>
  );
}
