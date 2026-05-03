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

export interface TemplateField {
  id: string;
  label: string;
  x: number;
  y: number;
  visible: boolean;
  type?: 'data' | 'static' | 'image';
  content?: string; // For static text or base64 image
  color?: string; // Hex color "#RRGGBB"
  fontSize?: number;
  fontStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic';
  width?: number;
  height?: number;
}

export interface Template {
  id?: number;
  name: string;
  title: string;
  fields: TemplateField[];
  primaryColor: string; // Hex color "#RRGGBB"
  fontSize: number;
  tableY: number;
}

const db = new Dexie('TanyaFillOutDB') as Dexie & {
  customers: EntityTable<Customer, 'id'>;
  logs: EntityTable<DailyLog, 'id'>;
  auditTrail: EntityTable<ChangeLog, 'id'>;
  settings: EntityTable<Setting, 'key'>;
  templates: EntityTable<Template, 'id'>;
};

db.version(7).stores({
  customers: '++id, kunde',
  logs: '++id, customerId, date',
  auditTrail: '++id, entityType, entityId, timestamp',
  settings: 'key',
  templates: '++id, name'
}).upgrade(tx => {
  // Version 7: Convert number[] colors to string hex
  tx.table('templates').toCollection().modify(template => {
    if (Array.isArray(template.primaryColor)) {
      template.primaryColor = rgbToHex(template.primaryColor[0], template.primaryColor[1], template.primaryColor[2]);
    }
    if (template.fields) {
      template.fields.forEach((f: any) => {
        if (Array.isArray(f.color)) {
          f.color = rgbToHex(f.color[0], f.color[1], f.color[2]);
        }
      });
    }
  });
});

function rgbToHex(r: number, g: number, b: number) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export { db };
