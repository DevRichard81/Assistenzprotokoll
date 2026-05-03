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
  anmerkungReflexion: string;
  startTime: string; // hh:mm
  endTime: string;   // hh:mm
  timeWithCustomerMinutes: number;
  anabfhart_from: string;
  anabfhart_too: string;
  traveltime: number;
  km: number;
  customer_anabfhart_from: string;
  customer_anabfhart_too: string;
  coustomer_traveltime: number;
  couistomer_km: number;
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
  zOrder?: number;
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

export interface PDFTemplate {
  id?: number;
  name: string;
  pdfBase64: string; // The base PDF file
  fieldMappings: {
    placeholder: string; // e.g. "{{month}}"
    dataSource: string;  // e.g. "month", "year", "customer.kunde", etc.
  }[];
  detectedFields?: string[]; // Field names found during scan
  tableY: number; // Where to start the daily logs table
  tableSettings?: any;
}

const db = new Dexie('TanyaFillOutDB') as Dexie & {
  customers: EntityTable<Customer, 'id'>;
  logs: EntityTable<DailyLog, 'id'>;
  auditTrail: EntityTable<ChangeLog, 'id'>;
  settings: EntityTable<Setting, 'key'>;
  templates: EntityTable<Template, 'id'>;
  pdfTemplates: EntityTable<PDFTemplate, 'id'>;
};

db.version(11).stores({
  customers: '++id, kunde',
  logs: '++id, customerId, date',
  auditTrail: '++id, entityType, entityId, timestamp',
  settings: 'key',
  templates: '++id, name',
  pdfTemplates: '++id, name'
}).upgrade(tx => {
  // Migration logic if needed
});

function rgbToHex(r: number, g: number, b: number) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export { db };
