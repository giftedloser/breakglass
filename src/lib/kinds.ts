import { TopCategory } from '../types';

export interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  wide?: boolean;
  type?: 'text' | 'textarea' | 'code';
  language?: string;       // when type='code', e.g. 'sql'
  monospaceRead?: boolean; // in read mode, render as <pre> (good for code/multi-line)
}

export interface KindDef {
  id: string;
  label: string;
  hideBody?: boolean;   // hide the rich TipTap body for this kind
  fields: FieldDef[];
}

export const KINDS: Record<TopCategory, KindDef[]> = {
  emergency: [
    { id: 'runbook', label: 'Runbook', fields: [] },
  ],
  servers: [
    { id: 'server', label: 'Server', fields: [
      { key: 'name', label: 'Name' },
      { key: 'ip', label: 'IP address' },
      { key: 'role', label: 'Role / Use' },
    ]},
    { id: 'generic', label: 'Other', fields: [] },
  ],
  dbs: [
    { id: 'database', label: 'Database', fields: [
      { key: 'name', label: 'Name' },
      { key: 'host', label: 'Host' },
    ]},
    { id: 'snippet', label: 'SQL snippet', hideBody: true, fields: [
      { key: 'engine', label: 'Engine', placeholder: 'PostgreSQL, MSSQL, MySQL, ...' },
      { key: 'sql', label: 'SQL', wide: true, type: 'code', language: 'sql' },
    ]},
    { id: 'generic', label: 'Other', fields: [] },
  ],
  network: [
    { id: 'vlan', label: 'VLAN', fields: [
      { key: 'vlan_id', label: 'VLAN ID' },
      { key: 'subnet', label: 'Subnet' },
      { key: 'gateway', label: 'Gateway' },
      { key: 'purpose', label: 'Purpose', wide: true },
    ]},
    { id: 'subnet', label: 'Subnet', fields: [
      { key: 'cidr', label: 'CIDR' },
      { key: 'gateway', label: 'Gateway' },
      { key: 'dhcp_range', label: 'DHCP range', wide: true },
    ]},
    { id: 'ip', label: 'IP / Host', fields: [
      { key: 'ip', label: 'IP address' },
      { key: 'hostname', label: 'Hostname' },
      { key: 'mac', label: 'MAC' },
      { key: 'assigned_to', label: 'Assigned to' },
    ]},
    { id: 'switch', label: 'Switch / Device', fields: [
      { key: 'hostname', label: 'Hostname' },
      { key: 'ip', label: 'Mgmt IP' },
      { key: 'model', label: 'Model' },
      { key: 'location', label: 'Location' },
    ]},
    { id: 'generic', label: 'Other', fields: [] },
  ],
  apps: [{ id: 'generic', label: 'Entry', fields: [] }],
  contacts: [{ id: 'generic', label: 'Contact', fields: [] }],
  notes: [{ id: 'generic', label: 'Note', fields: [] }],
  howto: [{ id: 'generic', label: 'How-To', fields: [] }],
  sitelinks: [{ id: 'generic', label: 'Site Link', fields: [
    { key: 'description', label: 'Description', wide: true },
  ]}],
  weekly: [{ id: 'report', label: 'Weekly Report', hideBody: true, fields: [
    { key: 'week_of', label: 'Week of (YYYY-MM-DD)' },
    { key: 'summary', label: 'Summary', wide: true, type: 'textarea' },
    { key: 'accomplishments', label: 'Accomplishments', wide: true, type: 'textarea' },
    { key: 'blockers', label: 'Blockers', wide: true, type: 'textarea' },
    { key: 'next_steps', label: 'Next steps', wide: true, type: 'textarea' },
  ]}],
};

export const defaultKind = (top: TopCategory) => KINDS[top][0]?.id ?? 'generic';
export const kindDef = (top: TopCategory, id: string | null): KindDef => {
  const list = KINDS[top];
  return list.find((k) => k.id === id) ?? list[0];
};

export const parseProperties = (raw: string | null | undefined): Record<string, string> => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) out[k] = String(v ?? '');
    return out;
  } catch { return {}; }
};

export const stringifyProperties = (props: Record<string, string>) => JSON.stringify(props);
