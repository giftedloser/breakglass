import { Contact } from '../types';
import { ContactCard } from './ContactCard';

export function ContactsGrid({
  contacts,
  selectedContactId,
  onSelect,
}: {
  contacts: Contact[];
  selectedContactId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col">
      {contacts.map((contact) => (
        <button
          type="button"
          key={contact.id}
          onClick={() => onSelect(contact.id)}
          className="w-full text-left"
        >
          <ContactCard
            contact={contact}
            isSelected={contact.id === selectedContactId}
          />
        </button>
      ))}
    </div>
  );
}
