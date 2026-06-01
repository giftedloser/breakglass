import { formatDistanceToNow, format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const age = Date.now() - date.getTime();
  if (age < 60_000) return 'just now';
  if (age < 7 * 24 * 60 * 60 * 1000) return `${formatDistanceToNow(date)} ago`;
  return format(date, 'MMM d');
}

export function extractPlainText(tiptapJson: string): string {
  try {
    const root: unknown = JSON.parse(tiptapJson);
    const parts: string[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const item = node as { text?: unknown; content?: unknown };
      if (typeof item.text === 'string') parts.push(item.text);
      if (Array.isArray(item.content)) item.content.forEach(walk);
    };
    walk(root);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s;
}

export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export const blankDoc = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
