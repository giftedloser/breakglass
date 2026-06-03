import { useApp } from '../context/AppContext';
import { HomeView } from './HomeView';
import { PinnedView } from './PinnedView';
import { TopView } from './TopView';
import { FolderView } from './FolderView';
import { EntryView } from './EntryView';
import { ContactsModule } from './ContactsModule';
import { SiteLinksModule } from './SiteLinksModule';
import { AppsModule } from './AppsModule';
import { StructuredModule } from './StructuredModule';
import { SettingsView } from './SettingsView';
import { TopCategory } from '../types';

const STRUCTURED_TOPS: TopCategory[] = ['servers', 'services', 'dbs', 'network', 'weekly'];

export function ContentRouter() {
  const { selection, folders, entries, apps, contacts } = useApp();
  switch (selection.kind) {
    case 'home':     return <HomeView />;
    case 'pinned':   return <PinnedView />;
    case 'settings': return <SettingsView />;
    case 'top': {
      if (selection.top === 'contacts')  return <ContactsModule initialFolder={null} />;
      if (selection.top === 'sitelinks') return <SiteLinksModule initialFolder={null} />;
      if (selection.top === 'apps')      return <AppsModule initialFolder={null} />;
      if (STRUCTURED_TOPS.includes(selection.top)) return <StructuredModule top={selection.top} initialFolder={null} />;
      return <TopView top={selection.top} />;
    }
    case 'folder': {
      const folder = folders.find((f) => f.id === selection.folder_id);
      if (folder?.top_category === 'contacts')  return <ContactsModule initialFolder={folder.id} />;
      if (folder?.top_category === 'sitelinks') return <SiteLinksModule initialFolder={folder.id} />;
      if (folder?.top_category === 'apps')      return <AppsModule initialFolder={folder.id} />;
      if (folder && STRUCTURED_TOPS.includes(folder.top_category)) return <StructuredModule top={folder.top_category} initialFolder={folder.id} />;
      return <FolderView folderId={selection.folder_id} />;
    }
    case 'entry': {
      const entry = entries.find((e) => e.id === selection.entry_id);
      // Structured entries render inside their module's master-detail.
      if (entry && STRUCTURED_TOPS.includes(entry.top_category)) {
        return <StructuredModule top={entry.top_category} initialFolder={entry.folder_id} />;
      }
      return <EntryView key={selection.entry_id} entryId={selection.entry_id} />;
    }
    case 'contact': {
      const contact = contacts.find((c) => c.id === selection.contact_id);
      return <ContactsModule initialFolder={contact?.folder_id ?? null} />;
    }
    case 'app': {
      const app = apps.find((a) => a.id === selection.app_id);
      return <AppsModule initialFolder={app?.folder_id ?? null} />;
    }
  }
}
