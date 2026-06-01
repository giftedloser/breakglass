import { TopCategory } from '../types';

export interface TopMeta {
  id: TopCategory;
  label: string;
  icon: string;        // lucide name
  isLinks?: boolean;   // sitelinks: entries are title + URL only
  isContacts?: boolean;
}

export const TOPS: TopMeta[] = [
  { id: 'emergency', label: 'Emergency',         icon: 'Siren' },
  { id: 'servers',   label: 'Servers & Services', icon: 'Server' },
  { id: 'dbs',       label: 'DBs',                icon: 'Database' },
  { id: 'network',   label: 'Network',            icon: 'Network' },
  { id: 'apps',      label: 'Apps',               icon: 'AppWindow' },
  { id: 'contacts',  label: 'Contacts',           icon: 'Phone', isContacts: true },
  { id: 'notes',     label: 'Notes',              icon: 'StickyNote' },
  { id: 'howto',     label: 'How To',             icon: 'BookOpen' },
  { id: 'sitelinks', label: 'Site Links',         icon: 'Link', isLinks: true },
];

export const TOP_BY_ID: Record<TopCategory, TopMeta> = TOPS.reduce((acc, t) => {
  acc[t.id] = t;
  return acc;
}, {} as Record<TopCategory, TopMeta>);

export const topLabel = (id: TopCategory) => TOP_BY_ID[id]?.label ?? id;
