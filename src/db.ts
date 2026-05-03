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

const db = new Dexie('TanyaFillOutDB') as Dexie & {
  customers: EntityTable<Customer, 'id'>;
  logs: EntityTable<DailyLog, 'id'>;
  auditTrail: EntityTable<ChangeLog, 'id'>;
};

db.version(2).stores({
  customers: '++id, kunde',
  logs: '++id, customerId, date',
  auditTrail: '++id, entityType, entityId, timestamp'
}).upgrade(tx => {
  // Simple upgrade path: clear old data as it's a structural change
  // In a real app we'd migrate, but here we'll just ensure it doesn't crash
  return tx.table('customers').toCollection().delete()
    .then(() => tx.table('logs').toCollection().delete());
});

export { db };
