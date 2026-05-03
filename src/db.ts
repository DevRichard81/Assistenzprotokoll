import Dexie, { type EntityTable } from 'dexie';

export interface Customer {
  id?: number;
  name: string;
  address: string;
  birthDate: string;
  insuranceNumber: string;
  defaultStartTime: string;
  defaultEndTime: string;
  defaultActivities: string;
}

export interface DailyLog {
  id?: number;
  customerId: number;
  date: string; // ISO format YYYY-MM-DD
  startTime: string;
  endTime: string;
  activities: string;
  kmDriven: number;
  pauseMinutes: number;
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

db.version(1).stores({
  customers: '++id, name',
  logs: '++id, customerId, date',
  auditTrail: '++id, entityType, entityId, timestamp'
});

export { db };
