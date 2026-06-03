import { TopCategory } from '../types';

export interface TopMeta {
  id: TopCategory;
  label: string;
  icon: string;
  group: 'infra' | 'ops' | 'workspace';
  isLinks?: boolean;
  isContacts?: boolean;
  isApps?: boolean;
  isWeekly?: boolean;
}

export const TOPS: TopMeta[] = [
  // INFRA
  { id: 'servers',   label: 'Servers',      icon: 'Server',    group: 'infra' },
  { id: 'services',  label: 'Services',     icon: 'Cog',       group: 'infra' },
  { id: 'dbs',       label: 'DBS & SQL',    icon: 'Database',  group: 'infra' },
  { id: 'network',   label: 'Network',      icon: 'Network',   group: 'infra' },
  // OPS
  { id: 'emergency', label: 'Emergency',    icon: 'Siren',     group: 'ops' },
  { id: 'howto',     label: 'How To',       icon: 'BookOpen',  group: 'ops' },
  { id: 'weekly',    label: 'Weekly Reports', icon: 'CalendarClock', group: 'ops', isWeekly: true },
  // WORKSPACE
  { id: 'apps',      label: 'Apps',         icon: 'AppWindow', group: 'workspace', isApps: true },
  { id: 'notes',     label: 'Notes',        icon: 'StickyNote',group: 'workspace' },
  { id: 'sitelinks', label: 'Site Links',   icon: 'Link',      group: 'workspace', isLinks: true },
  { id: 'contacts',  label: 'Contacts',     icon: 'Phone',     group: 'workspace', isContacts: true },
];

export const TOP_BY_ID: Record<TopCategory, TopMeta> = TOPS.reduce((acc, t) => {
  acc[t.id] = t;
  return acc;
}, {} as Record<TopCategory, TopMeta>);

export const topLabel = (id: TopCategory) => TOP_BY_ID[id]?.label ?? id;

export const GROUP_LABELS: Record<'infra' | 'ops' | 'workspace', string> = {
  infra: 'INFRA',
  ops: 'OPS',
  workspace: 'WORKSPACE',
};
