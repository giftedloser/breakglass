import { Category } from '../types';

export const CATEGORIES = [
  { id: 'emergency' as Category, label: 'Emergency', icon: 'Siren', color: 'rose', tw: 'border-rose-500', badge: 'category-badge category-badge-emergency' },
  { id: 'runbooks' as Category, label: 'Runbooks', icon: 'BookOpen', color: 'blue', tw: 'border-sky-500', badge: 'category-badge category-badge-runbooks' },
  { id: 'apps' as Category, label: 'Apps', icon: 'AppWindow', color: 'cyan', tw: 'border-cyan-500', badge: 'category-badge category-badge-apps' },
  { id: 'contacts' as Category, label: 'Contacts', icon: 'Phone', color: 'green', tw: 'border-emerald-500', badge: 'category-badge category-badge-contacts' },
  { id: 'network' as Category, label: 'Network', icon: 'Network', color: 'violet', tw: 'border-indigo-500', badge: 'category-badge category-badge-network' },
  { id: 'servers' as Category, label: 'Servers & Services', icon: 'Server', color: 'orange', tw: 'border-amber-500', badge: 'category-badge category-badge-servers' },
  { id: 'security' as Category, label: 'Security', icon: 'ShieldAlert', color: 'red', tw: 'border-red-500', badge: 'category-badge category-badge-security' },
  { id: 'vendors' as Category, label: 'Vendors & Support', icon: 'Headset', color: 'teal', tw: 'border-teal-500', badge: 'category-badge category-badge-vendors' },
  { id: 'notes' as Category, label: 'Notes & How-Tos', icon: 'StickyNote', color: 'yellow', tw: 'border-yellow-500', badge: 'category-badge category-badge-notes' },
] as const;

export const getCategoryMeta = (id: Category) => CATEGORIES.find((c) => c.id === id)!;
