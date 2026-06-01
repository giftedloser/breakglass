import { open } from '@tauri-apps/plugin-dialog';
import toast from 'react-hot-toast';
import { db } from '../lib/invoke';
import { useApp } from '../context/AppContext';

export function ExportDialog() {
  const { dispatch, refresh } = useApp();
  const close = () => dispatch({ type: 'TOGGLE_EXPORT', value: false });

  const exportJson = async () => {
    try {
      const path = await db.exportJson();
      toast.success(`Saved ${path}`);
    } catch (error) { toast.error(String(error)); }
  };

  const importJson = async () => {
    const path = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (typeof path !== 'string') return;
    try {
      const result = await db.importJson(path);
      await refresh();
      toast.success(`Imported ${result.folders_imported} folders, ${result.entries_imported} entries, ${result.contacts_imported} contacts`);
      close();
    } catch (error) { toast.error(String(error)); }
  };

  return (
    <div className="search-overlay" onClick={close}>
      <div className="export-panel" onClick={(e) => e.stopPropagation()}>
        <div className="export-header">
          <h2>Backup &amp; Restore</h2>
          <button className="search-esc" onClick={close}>close</button>
        </div>
        <section className="export-section">
          <h3>Backup</h3>
          <p>Saves a full JSON snapshot of every folder, entry, and contact.</p>
          <button className="primary-btn" onClick={exportJson}>Export to JSON</button>
        </section>
        <section className="export-section">
          <h3>Restore</h3>
          <p>Imports a previously-saved JSON. Items with matching IDs get updated; new ones are added. Nothing is deleted.</p>
          <button className="ghost-btn" onClick={importJson}>Import from JSON</button>
        </section>
      </div>
    </div>
  );
}
