import { useEffect } from 'react';
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { Sidebar } from './components/Sidebar';
import { EntryList } from './components/EntryList';
import { DetailPane } from './components/DetailPane';
import { SearchModal } from './components/SearchModal';
import { ExportDialog } from './components/ExportDialog';
import { useApp } from './context/AppContext';

export default function App() {
  const { searchOpen, exportDialogOpen, navCollapsed, listCollapsed, dispatch } = useApp();
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); dispatch({ type: 'TOGGLE_SEARCH', value: true }); }
      if (event.key.toLowerCase() === 's') { event.preventDefault(); window.dispatchEvent(new CustomEvent('breakglass-save')); }
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); window.dispatchEvent(new CustomEvent('breakglass-new')); }
      if (event.key.toLowerCase() === 'e') { event.preventDefault(); dispatch({ type: 'TOGGLE_EXPORT_DIALOG', value: true }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch]);
  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#18181b', color: '#f4f4f5', border: '1px solid #27272a' } }} />
      {searchOpen && <SearchModal />}
      {exportDialogOpen && <ExportDialog />}
      {navCollapsed ? (
        <button type="button" title="Show navigation" onClick={() => dispatch({ type: 'TOGGLE_NAV', value: false })} className="surface-strong flex w-9 shrink-0 items-start justify-center border-r pt-3 text-muted hover:text-strong">
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      ) : <Sidebar />}
      {listCollapsed ? (
        <button type="button" title="Show list" onClick={() => dispatch({ type: 'TOGGLE_LIST', value: false })} className="surface flex w-9 shrink-0 items-start justify-center border-r pt-3 text-muted hover:text-strong">
          <PanelRightOpen className="h-4 w-4" />
        </button>
      ) : <EntryList />}
      <DetailPane />
    </div>
  );
}
