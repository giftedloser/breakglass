import { useApp } from '../context/AppContext';
import { HomeView } from './HomeView';
import { PinnedView } from './PinnedView';
import { TopView } from './TopView';
import { FolderView } from './FolderView';
import { EntryView } from './EntryView';
import { ContactsModule } from './ContactsModule';
import { SiteLinksModule } from './SiteLinksModule';

export function ContentRouter() {
  const { selection, folders } = useApp();
  switch (selection.kind) {
    case 'home':    return <HomeView />;
    case 'pinned':  return <PinnedView />;
    case 'top':
      if (selection.top === 'contacts') return <ContactsModule initialFolder={null} />;
      if (selection.top === 'sitelinks') return <SiteLinksModule initialFolder={null} />;
      return <TopView top={selection.top} />;
    case 'folder': {
      const folder = folders.find((f) => f.id === selection.folder_id);
      if (folder?.top_category === 'contacts') return <ContactsModule initialFolder={folder.id} />;
      if (folder?.top_category === 'sitelinks') return <SiteLinksModule initialFolder={folder.id} />;
      return <FolderView folderId={selection.folder_id} />;
    }
    case 'entry':   return <EntryView entryId={selection.entry_id} />;
    case 'contact': return <ContactsModule initialFolder={null} />;
  }
}
