import { useState } from 'react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { db } from '../lib/invoke';
import { Folder } from '../types';
import { bgConfirm, bgPrompt } from '../lib/dialogs';

interface Props {
  folders: Folder[];
  selected: string | null; // null = all, '' = uncategorized, otherwise folder id
  onSelect: (val: string | null) => void;
}

type CtxMenu = { x: number; y: number; folder: Folder } | null;

export function ModuleFolderChips({ folders, selected, onSelect }: Props) {
  const { dispatch } = useApp();
  const [ctx, setCtx] = useState<CtxMenu>(null);

  const onContext = (e: React.MouseEvent, folder: Folder) => {
    e.preventDefault(); e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, folder });
  };

  const closeCtx = () => setCtx(null);

  const rename = async (f: Folder) => {
    const next = await bgPrompt({ title: 'Rename folder', defaultValue: f.name });
    if (!next || next === f.name) return;
    try {
      const updated = await db.renameFolder(f.id, next);
      dispatch({ type: 'UPSERT_FOLDER', folder: updated });
    } catch (err) { toast.error(String(err)); }
  };

  const remove = async (f: Folder) => {
    const ok = await bgConfirm({
      title: `Delete folder "${f.name}"?`,
      message: 'Items inside survive but lose their folder.',
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    try {
      await db.deleteFolder(f.id);
      dispatch({ type: 'REMOVE_FOLDER', id: f.id });
      if (selected === f.id) onSelect(null);
    } catch (err) { toast.error(String(err)); }
  };

  if (folders.length === 0) return null;

  return (
    <div className="module-chips-inline">
      <button className={`module-folder-chip ${selected === null ? 'is-selected' : ''}`} onClick={() => onSelect(null)}>All</button>
      <button className={`module-folder-chip ${selected === '' ? 'is-selected' : ''}`} onClick={() => onSelect('')}>Uncategorized</button>
      {folders.map((f) => (
        <button key={f.id}
                className={`module-folder-chip ${selected === f.id ? 'is-selected' : ''}`}
                onClick={() => onSelect(f.id)}
                onContextMenu={(e) => onContext(e, f)}
                title={`${f.name} (right-click to rename or delete)`}>
          {f.name}
        </button>
      ))}
      {ctx && (
        <>
          <div className="ctx-backdrop" onClick={closeCtx} onContextMenu={(e) => { e.preventDefault(); closeCtx(); }} />
          <div className="ctx-menu" style={{ top: ctx.y, left: ctx.x }}>
            <button className="ctx-item" onClick={() => { rename(ctx.folder); closeCtx(); }}>Rename folder</button>
            <button className="ctx-item danger" onClick={() => { remove(ctx.folder); closeCtx(); }}>Delete folder</button>
          </div>
        </>
      )}
    </div>
  );
}
