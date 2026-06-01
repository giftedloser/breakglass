import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Maximize2, Minimize2, Minus, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function TitleBar() {
  const { dispatch } = useApp();
  const [maximized, setMaximized] = useState(false);
  const win = getCurrentWindow();

  useEffect(() => {
    let mounted = true;
    const sync = async () => {
      try { const m = await win.isMaximized(); if (mounted) setMaximized(m); } catch {/*ignore*/}
    };
    void sync();
    const unlisten = win.onResized(() => sync());
    return () => { mounted = false; void unlisten.then((u) => u()); };
  }, []);

  return (
    <div className="title-bar" data-tauri-drag-region>
      <div className="title-bar-brand" data-tauri-drag-region>
        <div className="brand-mark" />
        <span className="title-bar-name">BreakGlass</span>
      </div>
      <button className="title-bar-search" onClick={() => dispatch({ type: 'TOGGLE_SEARCH', value: true })}>
        <Search size={13} />
        <span>Search anything...</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div data-tauri-drag-region className="title-bar-spacer" />
      <div className="title-bar-controls">
        <button className="tb-btn" title="Minimize" onClick={() => win.minimize()}><Minus size={14} /></button>
        <button className="tb-btn" title={maximized ? 'Restore' : 'Maximize'} onClick={() => win.toggleMaximize()}>
          {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
        <button className="tb-btn tb-close" title="Close" onClick={() => win.close()}><X size={14} /></button>
      </div>
    </div>
  );
}
