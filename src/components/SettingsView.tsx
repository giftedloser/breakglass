import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { open as openFile } from '@tauri-apps/plugin-dialog';
import { Download, Moon, Sun, Upload, Wand2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../lib/invoke';
import { TOPS } from '../lib/categories';

export function SettingsView() {
  const { theme, dispatch, refresh } = useApp();
  const [counts, setCounts] = useState<Record<string, number>>({});

  const reloadCounts = async () => {
    try { setCounts(await db.categoryCounts()); }
    catch (err) { toast.error(String(err)); }
  };

  useEffect(() => { void reloadCounts(); }, []);

  const exportCat = async (category: string, label: string) => {
    try {
      const path = await db.exportCategory(category);
      toast.success(`Exported ${label} → ${path}`);
    } catch (err) {
      const msg = String(err);
      if (msg.includes('cancelled')) return;
      toast.error(msg);
    }
  };

  const importCat = async (category: string, label: string) => {
    try {
      const path = await openFile({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (typeof path !== 'string') return;
      const res = await db.importCategory(category, path);
      await refresh();
      await reloadCounts();
      const parts = [
        res.folders > 0 ? `${res.folders} folder${res.folders === 1 ? '' : 's'}` : null,
        res.entries > 0 ? `${res.entries} entries` : null,
        res.contacts > 0 ? `${res.contacts} contacts` : null,
        res.apps > 0 ? `${res.apps} apps` : null,
        res.attachments > 0 ? `${res.attachments} attachments` : null,
      ].filter(Boolean).join(', ');
      toast.success(`Imported into ${label}: ${parts || 'nothing'}`);
    } catch (err) { toast.error(String(err)); }
  };

  const exportAll = async () => {
    try {
      const path = await db.exportJson();
      toast.success(`Saved ${path}`);
    } catch (err) {
      const msg = String(err);
      if (msg.includes('cancelled')) return;
      toast.error(msg);
    }
  };

  const importAll = async () => {
    try {
      const path = await openFile({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (typeof path !== 'string') return;
      const res = await db.importJson(path);
      await refresh();
      await reloadCounts();
      toast.success(`Imported ${res.folders_imported} folders, ${res.apps_imported} apps, ${res.entries_imported} entries, ${res.contacts_imported} contacts`);
    } catch (err) { toast.error(String(err)); }
  };

  const loadDemo = async () => {
    try { await db.seedDemoData(); await refresh(); await reloadCounts(); toast.success('Demo data loaded'); }
    catch (err) { toast.error(String(err)); }
  };

  return (
    <div className="content-pane settings-pane">
      <h1 className="read-title">Settings</h1>
      <div className="content-sub">Theme, backup / restore, and demo data.</div>

      <section className="panel">
        <h3>Appearance</h3>
        <div className="settings-row">
          <div className="settings-row-main">
            <div className="settings-label">Theme</div>
            <div className="settings-desc">Switch between dark and light. Persisted across launches.</div>
          </div>
          <button className="ghost-btn" onClick={() => dispatch({ type: 'TOGGLE_THEME' })}>
            {theme === 'dark' ? <><Sun size={12} /> Switch to light</> : <><Moon size={12} /> Switch to dark</>}
          </button>
        </div>
      </section>

      <section className="panel">
        <h3>Export / Import — per category</h3>
        <p className="settings-help">Each category exports to its own JSON. Importing only touches the matching category — nothing else.</p>
        <table className="settings-table">
          <thead>
            <tr><th>Category</th><th>Records</th><th></th></tr>
          </thead>
          <tbody>
            {TOPS.map((t) => (
              <tr key={t.id}>
                <td>{t.label}</td>
                <td className="settings-count">{counts[t.id] ?? 0}</td>
                <td className="settings-actions">
                  <button className="ghost-btn" onClick={() => exportCat(t.id, t.label)}>
                    <Download size={11} /> Export
                  </button>
                  <button className="ghost-btn" onClick={() => importCat(t.id, t.label)}>
                    <Upload size={11} /> Import
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>Full backup</h3>
        <div className="settings-row">
          <div className="settings-row-main">
            <div className="settings-label">All data in one file</div>
            <div className="settings-desc">Folders, apps, entries, contacts. Attachments are NOT included in the full backup — use per-category export above to keep attachments.</div>
          </div>
          <div className="settings-actions">
            <button className="ghost-btn" onClick={exportAll}><Download size={11} /> Export all</button>
            <button className="ghost-btn" onClick={importAll}><Upload size={11} /> Import all</button>
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>Demo data</h3>
        <div className="settings-row">
          <div className="settings-row-main">
            <div className="settings-label">Load realistic sample content</div>
            <div className="settings-desc">Adds folders, entries, apps, and a weekly report alongside your existing data. Nothing is deleted.</div>
          </div>
          <button className="ghost-btn" onClick={loadDemo}><Wand2 size={11} /> Load demo data</button>
        </div>
      </section>

      <section className="panel">
        <h3>About</h3>
        <dl className="kv-list">
          <dt>App</dt><dd>BreakGlass — personal IT reference</dd>
          <dt>Storage</dt><dd>SQLite at %APPDATA%/com.breakglass.app/breakglass.db</dd>
        </dl>
      </section>
    </div>
  );
}
