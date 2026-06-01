import { useApp } from '../context/AppContext';
import { HomeView } from './HomeView';
import { PinnedView } from './PinnedView';
import { TopView } from './TopView';
import { FolderView } from './FolderView';
import { EntryView } from './EntryView';
import { ContactView } from './ContactView';

export function ContentRouter() {
  const { selection } = useApp();
  switch (selection.kind) {
    case 'home':    return <HomeView />;
    case 'pinned':  return <PinnedView />;
    case 'top':     return <TopView top={selection.top} />;
    case 'folder':  return <FolderView folderId={selection.folder_id} />;
    case 'entry':   return <EntryView entryId={selection.entry_id} />;
    case 'contact': return <ContactView contactId={selection.contact_id} />;
  }
}
