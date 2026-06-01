import { Contact } from '../types';
import { cn } from '../lib/utils';

export function ContactCard({
  contact,
  isSelected,
}: {
  contact: Contact;
  isSelected: boolean;
}) {
  return (
    <div className={cn('entry-card w-full p-3 text-left', isSelected && 'entry-card-selected')}>
      <h3 className="truncate text-[12px] font-semibold text-strong">{contact.name}</h3>
    </div>
  );
}
