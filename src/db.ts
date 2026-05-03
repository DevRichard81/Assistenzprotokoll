import Dexie, { type EntityTable } from 'dexie';

export interface Customer {
  id?: number;
  dienstleistung: string;
  kunde: string;
  assistent: string;
  adresse: string;
  anfahrtFrom: string;
  abfahrtTo: string;
  driveTimeMinutes: number;
  km: number;
}

export interface DailyLog {
  id?: number;
  customerId: number;
  date: string; // ISO format YYYY-MM-DD
  foerderziel: string;
  assistenzinhalt: string;
  startTime: string; // hh:mm
  endTime: string;   // hh:mm
  timeWithCustomerMinutes: number;
}

export interface ChangeLog {
  id?: number;
  entityType: 'customer' | 'log';
  entityId: number;
  action: 'create' | 'update' | 'delete';
  timestamp: number;
  oldValue?: any;
  newValue?: any;
}

export interface Setting {
  key: string;
  value: any;
}

const db = new Dexie('TanyaFillOutDB') as Dexie & {
  customers: EntityTable<Customer, 'id'>;
  logs: EntityTable<DailyLog, 'id'>;
  auditTrail: EntityTable<ChangeLog, 'id'>;
  settings: EntityTable<Setting, 'key'>;
};

db.version(3).stores({
  customers: '++id, kunde',
  logs: '++id, customerId, date',
  auditTrail: '++id, entityType, entityId, timestamp',
  settings: 'key'
}).upgrade(tx => {
  // Version 3 adds settings table. No data migration needed for version 2 -> 3
});

export { db };
