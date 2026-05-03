import React, { useState, useEffect } from 'react';
import { PDFDocument, PDFDict, PDFName, PDFString, PDFHexString } from 'pdf-lib';
import { db, type Customer, type DailyLog, type Template, type TemplateField, type PDFTemplate } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { Plus, Trash2, Save, FileText, BarChart, History, User, Calendar, Settings, Palette, Move, Download, Search, RefreshCw } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- Types ---
type View = 'customers' | 'logs' | 'stats' | 'history' | 'settings' | 'templates' | 'pdfTemplates';

// --- Helper for Audit Logging ---
async function logChange(entityType: 'customer' | 'log', entityId: number, action: 'create' | 'update' | 'delete', oldValue?: any, newValue?: any) {
  await db.auditTrail.add({
    entityType,
    entityId,
    action,
    timestamp: Date.now(),
    oldValue: oldValue ? JSON.parse(JSON.stringify(oldValue)) : undefined,
    newValue: newValue ? JSON.parse(JSON.stringify(newValue)) : undefined,
  });
}

function MonthPicker({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const [year, month] = value.split('-').map(Number);
  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="flex gap-2">
      <select 
        className="border rounded px-3 py-2 bg-white text-gray-900"
        value={month}
        onChange={(e) => onChange(`${year}-${String(e.target.value).padStart(2, '0')}`)}
      >
        {months.map((m, i) => (
          <option key={m} value={i + 1}>{m}</option>
        ))}
      </select>
      <select 
        className="border rounded px-3 py-2 bg-white text-gray-900"
        value={year}
        onChange={(e) => onChange(`${e.target.value}-${String(month).padStart(2, '0')}`)}
      >
        {years.map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}

export default function App() {
  const [activeView, setActiveView] = useState<View>('logs');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));

  useEffect(() => {
    // Seed default templates if they don't exist
    const seedTemplates = async () => {
      try {
          const count = await db.templates.count();
          
          const defaultFields: TemplateField[] = [
            { id: 'title', label: 'Protokoll Titel', x: 105, y: 20, visible: true, type: 'static', content: 'ASSISTENZPROTOKOLL', fontSize: 18, fontStyle: 'bold' },
            { id: 'dienstleistung', label: 'Dienstleistung', x: 14, y: 30, visible: true, type: 'data' },
            { id: 'kunde', label: 'Kunde', x: 14, y: 35, visible: true, type: 'data' },
            { id: 'assistent', label: 'Assistent', x: 14, y: 40, visible: true, type: 'data' },
            { id: 'adresse', label: 'Adresse', x: 14, y: 45, visible: true, type: 'data' },
            { id: 'anfahrtFrom', label: 'Anfahrt von', x: 14, y: 50, visible: false, type: 'data' },
            { id: 'abfahrtTo', label: 'Abfahrt zu', x: 14, y: 55, visible: false, type: 'data' },
            { id: 'driveTimeMinutes', label: 'Fahrtzeit', x: 14, y: 60, visible: false, type: 'data' },
            { id: 'km', label: 'Kilometer', x: 14, y: 65, visible: false, type: 'data' },
            { id: 'month', label: 'Monat', x: 14, y: 70, visible: true, type: 'data' },
          ];

          const lebenshilfeFields: TemplateField[] = [
            // Top Section
            { id: 'lh_logo_box', label: 'Logo', x: 14, y: 10, visible: true, type: 'static', content: 'lebenshilfe', fontSize: 14, fontStyle: 'bold', color: '#10b981', width: 40, height: 15 },
            { id: 'lh_region', label: 'Region', x: 14, y: 25, visible: true, type: 'static', content: 'Region Knittelfeld', fontSize: 10, fontStyle: 'bold', color: '#7c2d12' },
            { id: 'lh_wohnassistenz', label: 'Wohnassistenz', x: 105, y: 15, visible: true, type: 'static', content: 'Wohnassistenz (ASS-W)', fontSize: 12, fontStyle: 'bold', color: '#10b981' },
            { id: 'title', label: 'Protokoll Titel', x: 105, y: 35, visible: true, type: 'static', content: 'Assistenzprotokoll/UB', fontSize: 14, fontStyle: 'bold' },
            { id: 'lh_mobile', label: 'Mobile Dienste', x: 14, y: 45, visible: true, type: 'static', content: 'MOBILE DIENSTE', fontSize: 11 },
            
            // Header Table (Right Aligned Boxes)
            { id: 'kunde', label: 'Kunde/in: ', x: 110, y: 15, visible: true, type: 'data', fontSize: 10 },
            { id: 'adresse', label: 'Adresse: ', x: 110, y: 25, visible: true, type: 'data', fontSize: 10 },
            { id: 'assistent', label: 'Betreuer/in: ', x: 110, y: 35, visible: true, type: 'data', fontSize: 10 },
            { id: 'month', label: 'Monat: ', x: 110, y: 45, visible: true, type: 'data', fontSize: 10 },
            { id: 'year', label: 'Jahr: ', x: 170, y: 45, visible: true, type: 'data', fontSize: 10 },
            
            // Middle Lines
            { id: 'lh_line1', label: 'Line 1', x: 14, y: 55, visible: true, type: 'static', content: '________________________________________________________________________________________________________________', fontSize: 8 },
            { id: 'lh_foerderziel', label: 'Förderziel:', x: 14, y: 62, visible: true, type: 'static', content: 'Förderziel:', fontSize: 10 },
            { id: 'lh_line2', label: 'Line 2', x: 14, y: 72, visible: true, type: 'static', content: '________________________________________________________________________________________________________________', fontSize: 8 },
            { id: 'lh_assistenzinhalt', label: 'Assistenzinhalt:', x: 14, y: 79, visible: true, type: 'static', content: 'Assistenzinhalt:', fontSize: 10 },
            { id: 'lh_line3', label: 'Line 3', x: 14, y: 125, visible: true, type: 'static', content: '________________________________________________________________________________________________________________', fontSize: 8 },
            
            // Footer Info (Fixed at bottom)
            { id: 'lh_footer_sig1', label: 'Unterschrift Kunde/in:', x: 14, y: 260, visible: true, type: 'static', content: 'Unterschrift Kunde/in: _________________________________', fontSize: 9 },
            { id: 'lh_footer_sig2', label: 'Unterschrift Betreuer/in:', x: 110, y: 260, visible: true, type: 'static', content: 'Unterschrift Betreuer/in: _________________________________', fontSize: 9 },
            { id: 'lh_footer_info1', label: 'Legal 1', x: 105, y: 275, visible: true, type: 'static', content: 'Lebenshilfe Region Knittelfeld gem. GmbH / FN 535534a – LG Leoben / UID-Nr: ATU 75895514', fontSize: 7, fontStyle: 'normal' },
            { id: 'lh_footer_info2', label: 'Legal 2', x: 105, y: 280, visible: true, type: 'static', content: 'Tel.: +43/(0)3512 74184; Fax: +43/(0)3512 74184-9; E-Mail: office@lebenshilfe-knittelfeld.at', fontSize: 7 },
            { id: 'lh_footer_info3', label: 'Legal 3', x: 105, y: 285, visible: true, type: 'static', content: 'Raiba Aichfeld, IBAN: AT84 3834 6000 0020 6334, BIC: RZSTAT2G346', fontSize: 7 },
          ];

          if (count === 0) {
            await db.templates.bulkAdd([
              {
                name: 'Lebenshilfe Protocol',
                title: 'Assistenzprotokoll/UB',
                fields: lebenshilfeFields,
                primaryColor: '#10b981',
                fontSize: 9,
                tableY: 135
              },
              {
                name: 'Standard Protocol',
                title: 'ASSISTENZPROTOKOLL',
                fields: defaultFields,
                primaryColor: '#c8c8c8',
                fontSize: 8,
                tableY: 80
              },
              {
                name: 'Compact Travel Info',
                title: 'FAHRTEN-PROTOKOLL',
                fields: defaultFields.map(f => {
                  if (['anfahrtFrom', 'abfahrtTo', 'driveTimeMinutes', 'km'].includes(f.id)) return { ...f, visible: true };
                  if (['dienstleistung', 'assistent', 'adresse'].includes(f.id)) return { ...f, visible: false };
                  return f;
                }),
                primaryColor: '#c8dcff',
                fontSize: 7,
                tableY: 80
              }
            ]);
            // Set default template setting
            const activeTemplate = await db.settings.get('activeTemplateId');
            if (!activeTemplate) {
              const first = await db.templates.filter(t => t.name === 'Lebenshilfe Protocol').first();
              if (first) {
                await db.settings.put({ key: 'activeTemplateId', value: first.id });
              }
            }
          }
      } catch (error) {
        console.error("Failed to seed templates:", error);
      }
    };
    seedTemplates();
  }, []);

  const customers = useLiveQuery(() => db.customers.toArray());
  const selectedCustomer = customers?.find(c => c.id === selectedCustomerId);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold text-blue-600">Assistenz Manager</h1>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <NavItem icon={<Calendar />} label="Daily Logs" active={activeView === 'logs'} onClick={() => setActiveView('logs')} />
          <NavItem icon={<User />} label="Customers" active={activeView === 'customers'} onClick={() => setActiveView('customers')} />
          <NavItem icon={<Palette />} label="Templates" active={activeView === 'templates'} onClick={() => setActiveView('templates')} />
          <NavItem icon={<FileText />} label="PDF Templates" active={activeView === 'pdfTemplates'} onClick={() => setActiveView('pdfTemplates')} />
          <NavItem icon={<BarChart />} label="Statistics" active={activeView === 'stats'} onClick={() => setActiveView('stats')} />
          <NavItem icon={<History />} label="Change Log" active={activeView === 'history'} onClick={() => setActiveView('history')} />
          <NavItem icon={<Settings />} label="Settings" active={activeView === 'settings'} onClick={() => setActiveView('settings')} />
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-8">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 capitalize">{activeView.replace('-', ' ')}</h2>
            <p className="text-gray-500">Manage your assistance protocols and customer data.</p>
          </div>
          <div className="flex gap-4">
             {activeView === 'logs' && (
                <select 
                  className="border rounded px-3 py-2 bg-white text-gray-900" 
                  value={selectedCustomerId || ''} 
                  onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
                >
                  <option value="">Select Customer</option>
                  {customers?.map(c => <option key={c.id} value={c.id}>{c.kunde}</option>)}
                </select>
             )}
             {(activeView === 'logs' || activeView === 'stats') && (
               <MonthPicker 
                 value={selectedMonth}
                 onChange={setSelectedMonth}
               />
             )}
          </div>
        </header>

        {activeView === 'customers' && <CustomerView />}
        {activeView === 'logs' && <LogsView customerId={selectedCustomerId} month={selectedMonth} />}
        {activeView === 'stats' && <StatsView month={selectedMonth} />}
        {activeView === 'history' && <HistoryView />}
        {activeView === 'settings' && <SettingsView />}
        {activeView === 'templates' && <TemplatesView />}
        {activeView === 'pdfTemplates' && <PDFTemplatesView />}
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
        active ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {React.cloneElement(icon, { size: 20 })}
      <span className="font-medium">{label}</span>
    </button>
  );
}

// --- Sub-Views ---

function CustomerView() {
  const customers = useLiveQuery(() => db.customers.toArray());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<Customer>>({});

  const handleSave = async () => {
    if (!formData.kunde) return;
    const data: Customer = {
      dienstleistung: formData.dienstleistung || '',
      kunde: formData.kunde || '',
      assistent: formData.assistent || '',
      adresse: formData.adresse || '',
      anfahrtFrom: formData.anfahrtFrom || '',
      abfahrtTo: formData.abfahrtTo || '',
      driveTimeMinutes: Number(formData.driveTimeMinutes) || 0,
      km: Number(formData.km) || 0,
    };

    if (editingId) {
      const old = await db.customers.get(editingId);
      await db.customers.update(editingId, data);
      await logChange('customer', editingId, 'update', old, data);
    } else {
      const id = await db.customers.add(data);
      await logChange('customer', id as number, 'create', undefined, data);
    }
    setEditingId(null);
    setFormData({});
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure?')) return;
    const old = await db.customers.get(id);
    await db.customers.delete(id);
    await logChange('customer', id, 'delete', old);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border shadow-sm">
        <h3 className="text-lg font-bold mb-4 text-gray-900">{editingId ? 'Edit Customer' : 'Add New Customer'}</h3>
        <div className="grid grid-cols-2 gap-4">
          <input className="border rounded p-2 bg-white text-gray-900" placeholder="Dienstleistung" value={formData.dienstleistung || ''} onChange={e => setFormData({...formData, dienstleistung: e.target.value})} />
          <input className="border rounded p-2 bg-white text-gray-900" placeholder="Kunde" value={formData.kunde || ''} onChange={e => setFormData({...formData, kunde: e.target.value})} />
          <input className="border rounded p-2 bg-white text-gray-900" placeholder="Assistent" value={formData.assistent || ''} onChange={e => setFormData({...formData, assistent: e.target.value})} />
          <input className="border rounded p-2 bg-white text-gray-900" placeholder="Adresse" value={formData.adresse || ''} onChange={e => setFormData({...formData, adresse: e.target.value})} />
          <input className="border rounded p-2 bg-white text-gray-900" placeholder="Anfahrt from" value={formData.anfahrtFrom || ''} onChange={e => setFormData({...formData, anfahrtFrom: e.target.value})} />
          <input className="border rounded p-2 bg-white text-gray-900" placeholder="Abfahrt to" value={formData.abfahrtTo || ''} onChange={e => setFormData({...formData, abfahrtTo: e.target.value})} />
          <input className="border rounded p-2 bg-white text-gray-900" type="number" placeholder="Drive time (min)" value={formData.driveTimeMinutes || ''} onChange={e => setFormData({...formData, driveTimeMinutes: Number(e.target.value)})} />
          <input className="border rounded p-2 bg-white text-gray-900" type="number" placeholder="KM" value={formData.km || ''} onChange={e => setFormData({...formData, km: Number(e.target.value)})} />
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-blue-700">
            <Save size={18} /> Save Customer
          </button>
          {editingId && <button onClick={() => {setEditingId(null); setFormData({});}} className="bg-gray-200 px-4 py-2 rounded">Cancel</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {customers?.map(c => (
          <div key={c.id} className="bg-white p-4 rounded-xl border shadow-sm flex justify-between items-start">
            <div>
              <h4 className="font-bold text-gray-900">{c.kunde}</h4>
              <p className="text-sm text-gray-700">{c.dienstleistung}</p>
              <p className="text-xs text-gray-500">{c.adresse}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => {setEditingId(c.id!); setFormData(c);}} className="p-2 text-blue-600 hover:bg-blue-50 rounded"><Plus size={18} /></button>
              <button onClick={() => handleDelete(c.id!)} className="p-2 text-red-600 hover:bg-red-50 rounded"><Trash2 size={18} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogsView({ customerId, month }: { customerId: number | null, month: string }) {
  const [yearStr, monthStr] = month.split('-');
  const startDate = startOfMonth(new Date(Number(yearStr), Number(monthStr) - 1));
  const endDate = endOfMonth(startDate);
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const [selectedDayStrings, setSelectedDayStrings] = useState<string[]>([]);

  const logs = useLiveQuery(
    () => (customerId ? db.logs.where('customerId').equals(customerId).filter(l => l.date.startsWith(month)).toArray() : Promise.resolve([])) as Promise<DailyLog[]>,
    [customerId, month]
  );

  useEffect(() => {
    if (logs) {
      setSelectedDayStrings(logs.map(l => l.date));
    }
  }, [logs]);

  const customer = useLiveQuery(() => (customerId ? db.customers.get(customerId) : Promise.resolve(undefined)) as Promise<Customer | undefined>, [customerId]);

  const toggleDaySelection = (dateStr: string) => {
    setSelectedDayStrings(prev => 
      prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]
    );
  };

  const handleSaveLog = async (date: string, data: Partial<DailyLog>) => {
    if (!customerId) return;
    const existing = logs?.find(l => l.date === date);
    const logData = {
      customerId,
      date,
      foerderziel: data.foerderziel || '',
      assistenzinhalt: data.assistenzinhalt || '',
      anmerkungReflexion: data.anmerkungReflexion || '',
      startTime: data.startTime || '',
      endTime: data.endTime || '',
      timeWithCustomerMinutes: Number(data.timeWithCustomerMinutes) || 0,
      anabfhart_from: data.anabfhart_from || '',
      anabfhart_too: data.anabfhart_too || '',
      traveltime: Number(data.traveltime) || 0,
      km: Number(data.km) || 0,
      customer_anabfhart_from: data.customer_anabfhart_from || '',
      customer_anabfhart_too: data.customer_anabfhart_too || '',
      coustomer_traveltime: Number(data.coustomer_traveltime) || 0,
      couistomer_km: Number(data.couistomer_km) || 0,
    };

    if (existing) {
      await db.logs.update(existing.id!, logData);
      await logChange('log', existing.id!, 'update', existing, logData);
    } else {
      const id = await db.logs.add(logData as DailyLog);
      await logChange('log', id as number, 'create', undefined, logData);
    }
  };

  const generatePDF = async () => {
    if (!customer || !logs) return;

    // Get active template settings
    const activeTemplateSetting = await db.settings.get('activeTemplateId');
    const activePdfTemplateSetting = await db.settings.get('activePdfTemplateId');

    const pdfTemplateId = activePdfTemplateSetting?.value;
    const templateId = activeTemplateSetting?.value;

    const pdfTemplate = pdfTemplateId ? await db.pdfTemplates.get(pdfTemplateId) : null;
    const template = templateId ? await db.templates.get(templateId) : null;

    const targetDays = days.filter(d => selectedDayStrings.includes(format(d, 'yyyy-MM-dd')));
    if (targetDays.length === 0) {
      alert("Please select at least one day to export.");
      return;
    }

    const [yearStr, monthStr] = month.split('-');
    const totalKm = targetDays.length * customer.km;
    const totalWorkMinutes = targetDays.reduce((acc, day) => {
      const log = logs.find(l => l.date === format(day, 'yyyy-MM-dd'));
      return acc + (log?.timeWithCustomerMinutes || 0);
    }, 0);

    const totalDriveMinutes = targetDays.length * customer.driveTimeMinutes;
    const gasSettings = await db.settings.get('gasoline');
    const fuelPrice = gasSettings?.value?.price || 0;
    const fuelConsumption = gasSettings?.value?.consumption || 0;
    const totalGasCost = (totalKm / 100) * fuelConsumption * fuelPrice;

    const dataMap: Record<string, string> = {
      kunde: customer.kunde,
      dienstleistung: customer.dienstleistung,
      assistent: customer.assistent,
      adresse: customer.adresse,
      anfahrtFrom: customer.anfahrtFrom,
      abfahrtTo: customer.abfahrtTo,
      driveTimeMinutes: `${customer.driveTimeMinutes} min`,
      km: `${customer.km} km`,
      month: monthStr,
      month_name: format(new Date(Number(yearStr), Number(monthStr) - 1), 'MMMM'),
      year: yearStr,
      total_km: `${totalKm} km`,
      total_work: `${totalWorkMinutes} min`,
      total_drive: `${totalDriveMinutes} min`,
      total_gas_cost: `${totalGasCost.toFixed(2)} €`,
    };

    // Add daily log mappings for pdf-lib templates
    targetDays.forEach((day, index) => {
      const log = logs.find(l => l.date === format(day, 'yyyy-MM-dd'));
      if (log) {
        const i = index + 1;
        dataMap[`date_${i}`] = format(day, 'dd.MM.yyyy');
        dataMap[`foerderziel_${i}`] = log.foerderziel;
        dataMap[`assistenzinhalt_${i}`] = log.assistenzinhalt;
        dataMap[`anmerkungreflexion_${i}`] = log.anmerkungReflexion;
        dataMap[`startTime_${i}`] = log.startTime;
        dataMap[`endTime_${i}`] = log.endTime;
        dataMap[`zeitvb_${i}`] = `${log.startTime} - ${log.endTime}`;
        dataMap[`zeitinmin_${i}`] = String(log.timeWithCustomerMinutes);
        dataMap[`anabfhart_von_${i}`] = log.anabfhart_from;
        dataMap[`anabfhart_bis_${i}`] = log.anabfhart_too;
        dataMap[`anabfhart_from_${i}`] = log.anabfhart_from;
        dataMap[`anabfhart_too_${i}`] = log.anabfhart_too;
        dataMap[`traveltime_${i}`] = String(log.traveltime);
        dataMap[`km_${i}`] = String(log.km);
        dataMap[`anab_zeit_${i}`] = String(log.traveltime);
        dataMap[`anab_km_${i}`] = String(log.km);
        
        dataMap[`customer_anabfhart_from_${i}`] = log.customer_anabfhart_from;
        dataMap[`customer_anabfhart_too_${i}`] = log.customer_anabfhart_too;
        dataMap[`coustomer_traveltime_${i}`] = String(log.coustomer_traveltime);
        dataMap[`couistomer_km_${i}`] = String(log.couistomer_km);
        
        dataMap[`kdanabfhart_von_${i}`] = log.customer_anabfhart_from;
        dataMap[`kdanabfhart_bis_${i}`] = log.customer_anabfhart_too;
        dataMap[`kdanab_zeit_${i}`] = String(log.coustomer_traveltime);
        dataMap[`kdanab_km_${i}`] = String(log.couistomer_km);
      }
    });

    if (pdfTemplate) {
      // PDF-LIB implementation
      try {
        const existingPdfBytes = await fetch(pdfTemplate.pdfBase64).then(res => res.arrayBuffer());
        const pdfDoc = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });
        const form = pdfDoc.getForm();

        // Support for appearance updates if fields aren't showing up after fill
        try {
           // @ts-ignore
           if (typeof form.updateFieldAppearances === 'function') {
             // @ts-ignore
             form.updateFieldAppearances();
           }
        } catch(e) {}
        
        pdfTemplate.fieldMappings.forEach(m => {
          const value = dataMap[m.dataSource] || '';
          const fieldName = m.placeholder.replace('{{', '').replace('}}', '');
          try {
            // Check if it's a form field first
            const field = form.getTextField(fieldName);
            field.setText(value);
          } catch (e) {
             // Fallback for non-standard fields (like annotations we found)
             const pages = pdfDoc.getPages();
             let handled = false;
             pages.forEach(page => {
               const annots = page.node.Annots();
               if (annots) {
                 annots.asArray().forEach(ref => {
                   const annot = pdfDoc.context.lookup(ref);
                   if (annot instanceof PDFDict) {
                     const title = annot.get(PDFName.of('T'));
                     const contents = annot.get(PDFName.of('Contents'));
                     let name = '';
                     if (title instanceof PDFString || title instanceof PDFHexString) name = title.decodeText();
                     if ((!name || name === 'ramboo') && (contents instanceof PDFString || contents instanceof PDFHexString)) name = contents.decodeText();

                     // Clean name for comparison (remove {{}} if user mapped it that way)
                     const cleanName = name.replace('{{', '').replace('}}', '');
                     if (name === fieldName || cleanName === fieldName) {
                       annot.set(PDFName.of('Contents'), PDFString.of(value));
                       handled = true;
                     }
                   }
                 });
               }
             });

             if (!handled) {
                try {
                  const allFields = form.getFields();
                  const match = allFields.find(f => f.getName().toLowerCase().includes(fieldName.toLowerCase()));
                  if (match && 'setText' in match) {
                    (match as any).setText(value);
                  }
                } catch (inner) {}
             }
          }
        });

        // Add support for data rows if user named fields like "date_1", "activity_1", etc.
        targetDays.forEach((day, idx) => {
          const rowIdx = idx + 1;
          const dateStr = format(day, 'yyyy-MM-dd');
          const log = logs.find(l => l.date === dateStr);
          if (!log) return;

          const rowData: Record<string, string> = {
            [`date_${rowIdx}`]: format(day, 'dd.MM.yyyy'),
            [`goal_${rowIdx}`]: log.foerderziel,
            [`content_${rowIdx}`]: log.assistenzinhalt,
            [`start_${rowIdx}`]: log.startTime,
            [`end_${rowIdx}`]: log.endTime,
            [`duration_${rowIdx}`]: String(log.timeWithCustomerMinutes),
          };

          Object.entries(rowData).forEach(([fieldName, val]) => {
            try {
              const field = form.getTextField(fieldName);
              field.setText(val);
            } catch (e) {}
          });
        });

        // Flatten form so it's not editable
        form.flatten();

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${customer.kunde}_${month}.pdf`;
        link.click();
        return; // Skip jsPDF logic for now if PDF Template is used
      } catch (err) {
        console.error("PDF-LIB error:", err);
        alert("Failed to generate PDF from base template. Falling back to standard template.");
      }
    }

    // Standard jsPDF logic (existing)
    const doc = new jsPDF();
    const primaryColor = template?.primaryColor || '#c8c8c8';
    const defaultFontSize = template?.fontSize || 8;

    if (template?.fields) {
      const sortedFields = [...template.fields]
        .filter(f => f.visible)
        .sort((a, b) => (a.zOrder || 0) - (b.zOrder || 0));

      sortedFields.forEach(field => {
        const fieldFontSize = field.fontSize || defaultFontSize;
        const fieldFontStyle = field.fontStyle || 'normal';
        const fieldColor = field.color || '#000000';

        doc.setFontSize(fieldFontSize);
        doc.setFont('helvetica', fieldFontStyle);
        doc.setTextColor(fieldColor);

        if (field.type === 'image' && field.content) {
          try {
            const w = field.width || 30;
            const h = field.height || 30;
            doc.addImage(field.content, 'PNG', field.x, field.y, w, h);
          } catch (e) {
            console.error("Failed to add image to PDF", e);
          }
        } else {
          let value = '';
          if (field.type === 'static') {
            value = field.content || '';
          } else {
            // Data fields
            const [yearStr, monthStr] = month.split('-');
            switch(field.id) {
              case 'dienstleistung': value = customer.dienstleistung; break;
              case 'kunde': value = customer.kunde; break;
              case 'assistent': value = customer.assistent; break;
              case 'adresse': value = customer.adresse; break;
              case 'anfahrtFrom': value = customer.anfahrtFrom; break;
              case 'abfahrtTo': value = customer.abfahrtTo; break;
              case 'driveTimeMinutes': value = `${customer.driveTimeMinutes} min`; break;
              case 'km': value = `${customer.km} km`; break;
              case 'month': value = monthStr; break;
              case 'year': value = yearStr; break;
              case 'title': value = field.content || template.title || 'ASSISTENZPROTOKOLL'; break;
              default: value = '';
            }
          }
          
          if (field.id === 'title') {
             doc.text(value, field.x, field.y, { align: 'center' });
          } else {
             const label = field.label ? field.label : '';
             doc.text(field.type === 'static' ? value : `${label}${value}`, field.x, field.y);
          }
        }
      });
    } else {
      // Fallback to legacy
      doc.setFontSize(18);
      doc.text(template?.title || 'ASSISTENZPROTOKOLL', 105, 20, { align: 'center' });
      doc.setFontSize(10);
      let y = 30;
      doc.text(`Dienstleistung: ${customer.dienstleistung}`, 14, y); y += 5;
      doc.text(`Kunde: ${customer.kunde}`, 14, y); y += 5;
      doc.text(`Assistent: ${customer.assistent}`, 14, y); y += 5;
      doc.text(`Adresse: ${customer.adresse}`, 14, y); y += 5;
      doc.text(`Monat: ${month}`, 14, y); y += 10;
    }

    // Reset styles for table
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    const startY = template?.tableY || 80;

    const exportDays = days.filter(d => selectedDayStrings.includes(format(d, 'yyyy-MM-dd')));

    if (exportDays.length === 0) {
      alert("Please select at least one day to export.");
      return;
    }

    const tableData = exportDays.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const log = logs.find(l => l.date === dateStr);
      return [
        format(day, 'dd.MM.yyyy'),
        log?.foerderziel || '-',
        log?.assistenzinhalt || '-',
        log?.startTime || '-',
        log?.endTime || '-',
        log?.timeWithCustomerMinutes || '0'
      ];
    });

    autoTable(doc, {
      startY: startY,
      head: [['Datum', 'Förderziel', 'Assistenzinhalt', 'Beginn', 'Ende', 'Zeit (min)']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: primaryColor as any, textColor: 0, halign: 'center' },
      styles: { fontSize: defaultFontSize, cellPadding: 1 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 40 },
        2: { cellWidth: 80 },
        3: { cellWidth: 15 },
        4: { cellWidth: 15 },
        5: { cellWidth: 15 },
      }
    });

    doc.save(`${template?.title || 'ASSISTENZPROTOKOLL'}_${customer.kunde}_${month}.pdf`);
  };

  if (!customerId) return <div className="text-center p-12 bg-white rounded-xl border">Please select a customer to view logs.</div>;

  return (
    <div className="space-y-6">
      {customer && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Dienstleistung</p>
              <p className="text-gray-900 font-medium">{customer.dienstleistung}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Kunde</p>
              <p className="text-gray-900 font-medium">{customer.kunde}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Assistent</p>
              <p className="text-gray-900 font-medium">{customer.assistent}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Adresse</p>
              <p className="text-gray-900 font-medium">{customer.adresse}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Anfahrt von</p>
              <p className="text-gray-900 font-medium">{customer.anfahrtFrom}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Abfahrt zu</p>
              <p className="text-gray-900 font-medium">{customer.abfahrtTo}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Fahrtzeit (Soll)</p>
              <p className="text-gray-900 font-medium">{customer.driveTimeMinutes} min</p>
            </div>
            <div>
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Kilometer (Soll)</p>
              <p className="text-gray-900 font-medium">{customer.km} km</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
           <h3 className="font-bold">Protocol for {customer?.kunde} ({month})</h3>
           <div className="flex gap-2">
             <button 
               onClick={() => setSelectedDayStrings(days.map(d => format(d, 'yyyy-MM-dd')))}
               className="text-xs text-blue-600 hover:underline"
             >
               Select All
             </button>
             <button 
               onClick={() => setSelectedDayStrings([])}
               className="text-xs text-gray-500 hover:underline"
             >
               Clear
             </button>
             <button onClick={generatePDF} className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-green-700 ml-2">
               <FileText size={18} /> Export PDF ({selectedDayStrings.length})
             </button>
           </div>
        </div>
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 text-sm uppercase text-gray-500">
            <tr>
              <th className="p-3 border-b w-10"></th>
              <th className="p-3 border-b">Date</th>
              <th className="p-3 border-b">Förderziel / Reflexion</th>
              <th className="p-3 border-b">Assistenzinhalt</th>
              <th className="p-3 border-b">Zeit / Dauer</th>
              <th className="p-3 border-b">An/Abfahrt (Assistent)</th>
              <th className="p-3 border-b">An/Abfahrt (Kunde)</th>
              <th className="p-3 border-b text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {days.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const log = logs?.find(l => l.date === dateStr);
              const isSelected = selectedDayStrings.includes(dateStr);
              return (
                <LogRow 
                  key={dateStr} 
                  day={day} 
                  log={log} 
                  isSelected={isSelected}
                  onToggle={() => toggleDaySelection(dateStr)}
                  onSave={(d) => handleSaveLog(dateStr, d)} 
                  defaults={customer} 
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LogRow({ day, log, isSelected, onToggle, onSave, defaults }: { day: Date, log?: DailyLog, isSelected: boolean, onToggle: () => void, onSave: (d: Partial<DailyLog>) => void, defaults?: Customer }) {
  const [isEditing, setIsEditing] = useState(false);
  const [data, setData] = useState<Partial<DailyLog>>(log || {});

  useEffect(() => { setData(log || {}); }, [log]);

  const calculateDuration = (start: string, end: string) => {
    if (!start || !end) return;
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;
    let diff = endTotal - startTotal;
    if (diff < 0) diff += 24 * 60; // Handle overnight if applicable, though unlikely here
    setData(prev => ({ ...prev, timeWithCustomerMinutes: diff }));
  };

  const handleApplyDefaults = () => {
    const defaultStart = '08:00';
    const defaultEnd = '16:00';
    setData({
      ...data,
      startTime: defaultStart,
      endTime: defaultEnd,
      foerderziel: '',
      assistenzinhalt: '',
      anmerkungReflexion: '',
      anabfhart_from: defaults?.anfahrtFrom || '',
      anabfhart_too: defaults?.abfahrtTo || '',
      traveltime: defaults?.driveTimeMinutes || 0,
      km: defaults?.km || 0,
      customer_anabfhart_from: '',
      customer_anabfhart_too: '',
      coustomer_traveltime: 0,
      couistomer_km: 0,
    });
    calculateDuration(defaultStart, defaultEnd);
    setIsEditing(true);
  };

  return (
    <tr className={`border-b hover:bg-gray-50 ${!log ? 'text-gray-400' : 'text-gray-900'}`}>
      <td className="p-3 border-b text-center">
        <input 
          type="checkbox" 
          checked={isSelected} 
          onChange={onToggle}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      </td>
      <td className="p-3 font-medium text-gray-900">{format(day, 'dd.MM (EEE)')}</td>
      {isEditing ? (
        <>
          <td className="p-1 space-y-1">
            <input type="text" placeholder="Förderziel" className="border rounded p-1 w-full bg-white text-gray-900" value={data.foerderziel || ''} onChange={e => setData({...data, foerderziel: e.target.value})} />
            <input type="text" placeholder="Anmerkung/Reflexion" className="border rounded p-1 w-full bg-white text-gray-900" value={data.anmerkungReflexion || ''} onChange={e => setData({...data, anmerkungReflexion: e.target.value})} />
          </td>
          <td className="p-1"><textarea placeholder="Assistenzinhalt" className="border rounded p-1 w-full bg-white text-gray-900" rows={2} value={data.assistenzinhalt || ''} onChange={e => setData({...data, assistenzinhalt: e.target.value})} /></td>
          <td className="p-1 space-y-1">
            <input 
              type="time" 
              className="border rounded p-1 w-full bg-white text-gray-900" 
              value={data.startTime || ''} 
              onChange={e => {
                const newStart = e.target.value;
                setData({...data, startTime: newStart});
                if (data.endTime) calculateDuration(newStart, data.endTime);
              }} 
            />
            <input 
              type="time" 
              className="border rounded p-1 w-full bg-white text-gray-900" 
              value={data.endTime || ''} 
              onChange={e => {
                const newEnd = e.target.value;
                setData({...data, endTime: newEnd});
                if (data.startTime) calculateDuration(data.startTime, newEnd);
              }} 
            />
            <input type="number" placeholder="min" className="border rounded p-1 w-full bg-white text-gray-900" value={data.timeWithCustomerMinutes || 0} onChange={e => setData({...data, timeWithCustomerMinutes: Number(e.target.value)})} />
          </td>
          <td className="p-1 space-y-1">
            <input type="text" placeholder="Von" className="border rounded p-1 w-full text-xs bg-white text-gray-900" value={data.anabfhart_from || ''} onChange={e => setData({...data, anabfhart_from: e.target.value})} />
            <input type="text" placeholder="Zu" className="border rounded p-1 w-full text-xs bg-white text-gray-900" value={data.anabfhart_too || ''} onChange={e => setData({...data, anabfhart_too: e.target.value})} />
            <div className="flex gap-1">
              <input type="number" placeholder="min" className="border rounded p-1 w-1/2 text-xs bg-white text-gray-900" value={data.traveltime || 0} onChange={e => setData({...data, traveltime: Number(e.target.value)})} />
              <input type="number" placeholder="km" className="border rounded p-1 w-1/2 text-xs bg-white text-gray-900" value={data.km || 0} onChange={e => setData({...data, km: Number(e.target.value)})} />
            </div>
          </td>
          <td className="p-1 space-y-1">
            <input type="text" placeholder="Kd Von" className="border rounded p-1 w-full text-xs bg-white text-gray-900" value={data.customer_anabfhart_from || ''} onChange={e => setData({...data, customer_anabfhart_from: e.target.value})} />
            <input type="text" placeholder="Kd Zu" className="border rounded p-1 w-full text-xs bg-white text-gray-900" value={data.customer_anabfhart_too || ''} onChange={e => setData({...data, customer_anabfhart_too: e.target.value})} />
            <div className="flex gap-1">
              <input type="number" placeholder="min" className="border rounded p-1 w-1/2 text-xs bg-white text-gray-900" value={data.coustomer_traveltime || 0} onChange={e => setData({...data, coustomer_traveltime: Number(e.target.value)})} />
              <input type="number" placeholder="km" className="border rounded p-1 w-1/2 text-xs bg-white text-gray-900" value={data.couistomer_km || 0} onChange={e => setData({...data, couistomer_km: Number(e.target.value)})} />
            </div>
          </td>
          <td className="p-3 text-right flex justify-end gap-1">
            <button onClick={() => { onSave(data); setIsEditing(false); }} className="text-green-600 p-1"><Save size={18} /></button>
            <button onClick={() => setIsEditing(false)} className="text-gray-400 p-1">X</button>
          </td>
        </>
      ) : (
        <>
          <td className="p-3 text-gray-900 text-xs">
            <div className="font-bold">{log?.foerderziel || '-'}</div>
            <div className="text-gray-500 italic">{log?.anmerkungReflexion || '-'}</div>
          </td>
          <td className="p-3 text-gray-900 text-xs whitespace-pre-wrap">{log?.assistenzinhalt || '-'}</td>
          <td className="p-3 text-gray-900 text-xs">
            <div>{log ? `${log.startTime} - ${log.endTime}` : '-'}</div>
            <div className="font-bold">{log?.timeWithCustomerMinutes || 0}m</div>
          </td>
          <td className="p-3 text-gray-900 text-xs">
            <div>{log?.anabfhart_from} → {log?.anabfhart_too}</div>
            <div>{log?.traveltime || 0}m / {log?.km || 0}km</div>
          </td>
          <td className="p-3 text-gray-900 text-xs">
            <div>{log?.customer_anabfhart_from} → {log?.customer_anabfhart_too}</div>
            <div>{log?.coustomer_traveltime || 0}m / {log?.couistomer_km || 0}km</div>
          </td>
          <td className="p-3 text-right">
             <button onClick={() => setIsEditing(true)} className="text-blue-600 text-sm hover:underline mr-2">Edit</button>
             {!log && <button onClick={handleApplyDefaults} className="text-gray-500 text-sm hover:underline">Use Defaults</button>}
          </td>
        </>
      )}
    </tr>
  );
}

function StatsView({ month }: { month: string }) {
  const allLogs = useLiveQuery(
    () => db.logs.filter(l => l.date.startsWith(month)).toArray(),
    [month]
  );
  const customers = useLiveQuery(() => db.customers.toArray());
  const fuelConsumption = useLiveQuery(() => db.settings.get('fuelConsumption'));
  const fuelPrice = useLiveQuery(() => db.settings.get('fuelPrice'));

  if (!customers || !allLogs) return <div className="p-12 text-center text-gray-500">Loading statistics...</div>;

  const consumption = Number(fuelConsumption?.value) || 0;
  const price = Number(fuelPrice?.value) || 0;

  const statsPerCustomer = customers.map(c => {
    const customerLogs = allLogs.filter(l => l.customerId === c.id);
    const totalMinutes = customerLogs.reduce((sum, l) => sum + (l.timeWithCustomerMinutes || 0), 0);
    const totalKm = (c.km || 0) * customerLogs.length;
    const totalDriveTime = (c.driveTimeMinutes || 0) * customerLogs.length;
    
    // Gasoline Cost = (km / 100) * consumption * price
    const gasolineCost = (totalKm / 100) * consumption * price;

    return {
      customer: c,
      totalMinutes,
      totalKm,
      totalDriveTime,
      gasolineCost,
      count: customerLogs.length
    };
  }).filter(s => s.count > 0);

  const grandTotalMinutes = statsPerCustomer.reduce((sum, s) => sum + s.totalMinutes, 0);
  const grandTotalKm = statsPerCustomer.reduce((sum, s) => sum + s.totalKm, 0);
  const grandTotalDriveTime = statsPerCustomer.reduce((sum, s) => sum + s.totalDriveTime, 0);
  const grandTotalGasCost = statsPerCustomer.reduce((sum, s) => sum + s.gasolineCost, 0);

  const formatTime = (totalMinutes: number) => {
    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);
    return `${h}h ${m}m`;
  };

  const generateStatsPDF = (scope: 'month' | 'year') => {
    if (!customers || !allLogs) return;
    const doc = new jsPDF();
    const title = scope === 'month' ? `STATISTIK - MONAT ${month}` : `STATISTIK - JAHR ${month.split('-')[0]}`;
    
    doc.setFontSize(18);
    doc.text(title, 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text(`Erstellt am: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`, 14, 30);
    if (consumption > 0) {
      doc.text(`Kraftstoff: ${consumption} l/100km @ ${price} €/l`, 14, 35);
    }

    const tableData = statsPerCustomer.map(s => [
      s.customer.kunde,
      s.count.toString(),
      formatTime(s.totalMinutes),
      formatTime(s.totalDriveTime),
      `${s.totalKm} km`,
      `${s.gasolineCost.toFixed(2)} €`
    ]);

    tableData.push([
      'GESAMT',
      statsPerCustomer.reduce((sum, s) => sum + s.count, 0).toString(),
      formatTime(grandTotalMinutes),
      formatTime(grandTotalDriveTime),
      `${grandTotalKm} km`,
      `${grandTotalGasCost.toFixed(2)} €`
    ]);

    autoTable(doc, {
      startY: 45,
      head: [['Kunde', 'Tage', 'Arbeitszeit', 'Fahrtzeit', 'Distanz', 'Benzinkosten']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [200, 200, 200], textColor: 0 },
      styles: { fontSize: 8 },
      didParseCell: (data) => {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      }
    });

    doc.save(`Statistik_${scope}_${month}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <button 
          onClick={() => generateStatsPDF('month')}
          className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-blue-700"
        >
          <FileText size={18} /> Export Month PDF
        </button>
        <button 
          onClick={() => {
            // For year export, we need to fetch all logs for the year
            const year = month.split('-')[0];
            db.logs.filter(l => l.date.startsWith(year)).toArray().then(yearLogs => {
              const yearStats = customers.map(c => {
                const customerLogs = yearLogs.filter(l => l.customerId === c.id);
                const totalMinutes = customerLogs.reduce((sum, l) => sum + (l.timeWithCustomerMinutes || 0), 0);
                const totalKm = (c.km || 0) * customerLogs.length;
                const totalDriveTime = (c.driveTimeMinutes || 0) * customerLogs.length;
                const gasolineCost = (totalKm / 100) * consumption * price;
                return { customer: c, totalMinutes, totalKm, totalDriveTime, gasolineCost, count: customerLogs.length };
              }).filter(s => s.count > 0);

              const yTotalMinutes = yearStats.reduce((sum, s) => sum + s.totalMinutes, 0);
              const yTotalKm = yearStats.reduce((sum, s) => sum + s.totalKm, 0);
              const yTotalDriveTime = yearStats.reduce((sum, s) => sum + s.totalDriveTime, 0);
              const yTotalGasCost = yearStats.reduce((sum, s) => sum + s.gasolineCost, 0);

              const doc = new jsPDF();
              doc.setFontSize(18);
              doc.text(`STATISTIK - JAHR ${year}`, 105, 20, { align: 'center' });
              doc.setFontSize(10);
              doc.text(`Erstellt am: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`, 14, 30);
              if (consumption > 0) doc.text(`Kraftstoff: ${consumption} l/100km @ ${price} €/l`, 14, 35);

              const yTableData = yearStats.map(s => [
                s.customer.kunde,
                s.count.toString(),
                formatTime(s.totalMinutes),
                formatTime(s.totalDriveTime),
                `${s.totalKm} km`,
                `${s.gasolineCost.toFixed(2)} €`
              ]);

              yTableData.push([
                'GESAMT',
                yearStats.reduce((sum, s) => sum + s.count, 0).toString(),
                formatTime(yTotalMinutes),
                formatTime(yTotalDriveTime),
                `${yTotalKm} km`,
                `${yTotalGasCost.toFixed(2)} €`
              ]);

              autoTable(doc, {
                startY: 45,
                head: [['Kunde', 'Tage', 'Arbeitszeit', 'Fahrtzeit', 'Distanz', 'Benzinkosten']],
                body: yTableData,
                theme: 'grid',
                headStyles: { fillColor: [200, 200, 200], textColor: 0 },
                styles: { fontSize: 8 },
                didParseCell: (data) => {
                  if (data.row.index === yTableData.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [240, 240, 240];
                  }
                }
              });
              doc.save(`Statistik_Jahr_${year}.pdf`);
            });
          }}
          className="bg-purple-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-purple-700"
        >
          <FileText size={18} /> Export Year PDF
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-gray-500 text-sm font-bold uppercase mb-2">Total Distance (Month)</h3>
          <p className="text-4xl font-black text-blue-600">{grandTotalKm} <span className="text-lg">km</span></p>
        </div>
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-gray-500 text-sm font-bold uppercase mb-2">Gasoline Cost</h3>
          <p className="text-4xl font-black text-red-600">{grandTotalGasCost.toFixed(2)} <span className="text-lg">€</span></p>
          <p className="text-xs text-gray-400 mt-2">{consumption} l/100km @ {price} €/l</p>
        </div>
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-gray-500 text-sm font-bold uppercase mb-2">Total Time with Customer</h3>
          <p className="text-4xl font-black text-green-600">{formatTime(grandTotalMinutes)}</p>
          <p className="text-xs text-gray-400 mt-2">{grandTotalMinutes} min total</p>
        </div>
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-gray-500 text-sm font-bold uppercase mb-2">Total Drive Time</h3>
          <p className="text-4xl font-black text-orange-600">{formatTime(grandTotalDriveTime)}</p>
          <p className="text-xs text-gray-400 mt-2">{grandTotalDriveTime} min total</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-bold text-gray-800">Customer Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-bold">
              <tr>
                <th className="p-4 border-b w-[25%]">Customer / Service</th>
                <th className="p-4 border-b text-center w-[10%]">Days</th>
                <th className="p-4 border-b text-right w-[15%]">Work Time</th>
                <th className="p-4 border-b text-right w-[15%]">Drive Time</th>
                <th className="p-4 border-b text-right w-[15%]">Distance</th>
                <th className="p-4 border-b text-right text-red-600 w-[20%]">Gasoline</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {statsPerCustomer.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">No logs found for this month.</td>
                </tr>
              ) : (
                statsPerCustomer.map(s => (
                  <tr key={s.customer.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                      <p className="font-bold text-gray-900">{s.customer.kunde}</p>
                      <p className="text-xs text-gray-500">{s.customer.dienstleistung}</p>
                    </td>
                    <td className="p-4 text-center text-gray-600 font-medium">
                      {s.count}
                    </td>
                    <td className="p-4 text-right">
                      <p className="font-bold text-gray-900">{s.totalMinutes} m</p>
                      <p className="text-xs text-gray-500">{formatTime(s.totalMinutes)}</p>
                    </td>
                    <td className="p-4 text-right">
                      <p className="font-bold text-orange-600">{s.totalDriveTime} m</p>
                      <p className="text-xs text-gray-500">{formatTime(s.totalDriveTime)}</p>
                    </td>
                    <td className="p-4 text-right">
                      <p className="font-bold text-blue-600">{s.totalKm} km</p>
                    </td>
                    <td className="p-4 text-right">
                      <p className="font-bold text-red-600">{s.gasolineCost.toFixed(2)} €</p>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
        {statsPerCustomer.length > 0 && (
          <div className="bg-gray-100 border-t">
            <table className="w-full text-left border-collapse table-fixed">
              <tbody className="text-sm">
                <tr className="bg-gray-100 font-black text-gray-900">
                  <td className="p-4 w-[25%]">Month Total</td>
                  <td className="p-4 text-center w-[10%]">
                    {statsPerCustomer.reduce((sum, s) => sum + s.count, 0)}
                  </td>
                  <td className="p-4 text-right w-[15%]">
                    <p className="text-green-600">{grandTotalMinutes} m</p>
                    <p className="text-xs text-gray-500 font-bold">{formatTime(grandTotalMinutes)}</p>
                  </td>
                  <td className="p-4 text-right w-[15%]">
                    <p className="text-orange-600">{grandTotalDriveTime} m</p>
                    <p className="text-xs text-gray-500 font-bold">{formatTime(grandTotalDriveTime)}</p>
                  </td>
                  <td className="p-4 text-right w-[15%]">
                    <p className="text-blue-600">{grandTotalKm} km</p>
                  </td>
                  <td className="p-4 text-right w-[20%]">
                    <p className="text-red-600">{grandTotalGasCost.toFixed(2)} €</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsView() {
  const fuelConsumption = useLiveQuery(() => db.settings.get('fuelConsumption'));
  const fuelPrice = useLiveQuery(() => db.settings.get('fuelPrice'));
  const activeTemplateId = useLiveQuery(() => db.settings.get('activeTemplateId'));
  const activePdfTemplateId = useLiveQuery(() => db.settings.get('activePdfTemplateId'));
  const templates = useLiveQuery(() => db.templates.toArray()) || [];
  const pdfTemplates = useLiveQuery(() => db.pdfTemplates.toArray()) || [];

  const [consumption, setConsumption] = useState('');
  const [price, setPrice] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | undefined>(undefined);
  const [selectedPdfTemplateId, setSelectedPdfTemplateId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (fuelConsumption) setConsumption(String(fuelConsumption.value));
    if (fuelPrice) setPrice(String(fuelPrice.value));
    if (activeTemplateId) setSelectedTemplateId(activeTemplateId.value);
    if (activePdfTemplateId) setSelectedPdfTemplateId(activePdfTemplateId.value);
  }, [fuelConsumption, fuelPrice, activeTemplateId, activePdfTemplateId]);

  const handleSave = async () => {
    await db.settings.put({ key: 'fuelConsumption', value: Number(consumption) });
    await db.settings.put({ key: 'fuelPrice', value: Number(price) });
    if (selectedTemplateId) {
      await db.settings.put({ key: 'activeTemplateId', value: Number(selectedTemplateId) });
    }
    if (selectedPdfTemplateId) {
      await db.settings.put({ key: 'activePdfTemplateId', value: Number(selectedPdfTemplateId) });
    } else {
      await db.settings.delete('activePdfTemplateId');
    }
    alert('Settings saved!');
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="bg-white p-8 rounded-xl border shadow-sm">
        <h3 className="text-xl font-bold mb-6 text-gray-900 flex items-center gap-2">
          <Settings size={24} className="text-gray-400" />
          General Configuration
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Active Print Template</label>
            <select 
              className="w-full border rounded p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
              value={selectedTemplateId || ''}
              onChange={e => setSelectedTemplateId(Number(e.target.value))}
            >
              <option value="">Select Template</option>
              {templates?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Consumption (Liters / 100km)</label>
            <input 
              type="number" 
              step="0.1"
              className="w-full border rounded p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" 
              value={consumption} 
              onChange={e => setConsumption(e.target.value)} 
              placeholder="e.g. 6.5"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Price (Price per Liter)</label>
            <input 
              type="number" 
              step="0.01"
              className="w-full border rounded p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" 
              value={price} 
              onChange={e => setPrice(e.target.value)} 
              placeholder="e.g. 1.75"
            />
          </div>
          <div className="space-y-4 pt-4 border-t">
            <h4 className="font-semibold text-gray-900">PDF Generation</h4>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Standard Template</label>
              <select 
                className="w-full border rounded p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                value={selectedTemplateId || ''}
                onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">Select a template...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base PDF Template (Overrides Standard)</label>
              <select 
                className="w-full border rounded p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                value={selectedPdfTemplateId || ''}
                onChange={(e) => setSelectedPdfTemplateId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">None (Use Standard Template)</option>
                {pdfTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button 
            onClick={handleSave} 
            className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors mt-4"
          >
            <Save size={20} /> Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Components ---

// --- Components ---

function PDFTemplatesView() {
  const templates = useLiveQuery(() => db.pdfTemplates.toArray()) || [];
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, id?: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      if (id) {
        await db.pdfTemplates.update(id, { pdfBase64: base64 });
      } else {
        const newId = await db.pdfTemplates.add({
          name: file.name,
          pdfBase64: base64,
          fieldMappings: [],
          tableY: 100
        });
        setEditingId(newId as number);
      }
    };
    reader.readAsDataURL(file);
  };

  const addMapping = async (id: number) => {
    const t = await db.pdfTemplates.get(id);
    if (!t) return;
    const newMappings = [...t.fieldMappings, { placeholder: '{{new}}', dataSource: 'kunde' }];
    await db.pdfTemplates.update(id, { fieldMappings: newMappings });
  };

  const updateMapping = async (id: number, index: number, field: string, value: string) => {
    const t = await db.pdfTemplates.get(id);
    if (!t) return;
    const newMappings = [...t.fieldMappings];
    newMappings[index] = { ...newMappings[index], [field]: value };
    await db.pdfTemplates.update(id, { fieldMappings: newMappings });
  };

  const deleteMapping = async (id: number, index: number) => {
    const t = await db.pdfTemplates.get(id);
    if (!t) return;
    const newMappings = t.fieldMappings.filter((_, i) => i !== index);
    await db.pdfTemplates.update(id, { fieldMappings: newMappings });
  };

  const testFillPdf = async (id: number) => {
    const t = await db.pdfTemplates.get(id);
    if (!t) return;
    try {
      const bytes = await fetch(t.pdfBase64).then(res => res.arrayBuffer());
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const form = pdfDoc.getForm();
      
      // Support for appearance updates if fields aren't showing up after fill
      try {
         // @ts-ignore
         if (typeof form.updateFieldAppearances === 'function') {
           // @ts-ignore
           form.updateFieldAppearances();
         }
      } catch(e) {}
      
      const sampleData: Record<string, string> = {
        kunde: "Sample Customer Name",
        dienstleistung: "Sample Service",
        assistent: "Sample Assistant",
        adresse: "Sample Address 123, 8010 Graz",
        anfahrtFrom: "Office",
        abfahrtTo: "Home",
        month: "05",
        month_name: "May",
        year: "2026",
        total_km: "100 km",
        total_work: "480 min",
        total_drive: "150 min",
        total_gas_cost: "12.50 €",
      };

      t.fieldMappings.forEach(m => {
        try {
          const fieldName = m.placeholder.replace('{{', '').replace('}}', '');
          try {
            const field = form.getTextField(fieldName);
            field.setText(sampleData[m.dataSource] || `[${m.dataSource}]`);
          } catch (e) {
            // Fallback for non-standard fields (like annotations we found)
            const pages = pdfDoc.getPages();
            pages.forEach(page => {
              const annots = page.node.Annots();
              if (annots) {
                annots.asArray().forEach(ref => {
                  const annot = pdfDoc.context.lookup(ref);
                  if (annot instanceof PDFDict) {
                    const st = annot.get(PDFName.of('Subtype'));
                    const title = annot.get(PDFName.of('T'));
                    const contents = annot.get(PDFName.of('Contents'));
                    
                    let name = '';
                    if (title instanceof PDFString || title instanceof PDFHexString) name = title.decodeText();
                    if ((!name || name === 'ramboo') && (contents instanceof PDFString || contents instanceof PDFHexString)) name = contents.decodeText();
                    
                    const cleanName = name.replace('{{', '').replace('}}', '');
                    if (name === fieldName || cleanName === fieldName) {
                      // Attempt to set text on annotation (Contents is common for FreeText)
                      annot.set(PDFName.of('Contents'), PDFString.of(sampleData[m.dataSource] || `[${m.dataSource}]`));
                    }
                  }
                });
              }
            });
          }
        } catch (e) {
          console.warn(`Could not fill field: ${m.placeholder}`, e);
        }
      });

      // Fill a few rows for testing
      for (let i = 1; i <= 3; i++) {
          const testData: Record<string, string> = {
            [`date_${i}`]: `0${i}.05.2026`,
            [`foerderziel_${i}`]: `Sample Goal ${i}`,
            [`assistenzinhalt_${i}`]: `Sample Content for day ${i}`,
            [`anmerkungreflexion_${i}`]: `Sample Reflection ${i}`,
            [`startTime_${i}`]: "08:00",
            [`endTime_${i}`]: "10:00",
            [`zeitvb_${i}`]: "08:00 - 10:00",
            [`zeitinmin_${i}`]: "120",
            [`anabfhart_von_${i}`]: "Office",
            [`anabfhart_bis_${i}`]: "Customer",
            [`anabfhart_from_${i}`]: "Office",
            [`anabfhart_too_${i}`]: "Customer",
            [`traveltime_${i}`]: "15",
            [`km_${i}`]: "10",
            [`anab_zeit_${i}`]: "15",
            [`anab_km_${i}`]: "10",
            [`customer_anabfhart_from_${i}`]: "Customer",
            [`customer_anabfhart_too_${i}`]: "Park",
            [`coustomer_traveltime_${i}`]: "5",
            [`couistomer_km_${i}`]: "2",
            [`kdanabfhart_von_${i}`]: "Customer",
            [`kdanabfhart_bis_${i}`]: "Park",
            [`kdanab_zeit_${i}`]: "5",
            [`kdanab_km_${i}`]: "2",
          };

        Object.entries(testData).forEach(([key, val]) => {
          try { 
            const field = form.getTextField(key);
            field.setText(val);
          } catch(e) {
             // Fallback for annotation-based fields in test
             const pages = pdfDoc.getPages();
             pages.forEach(page => {
               const annots = page.node.Annots();
               if (annots) {
                 annots.asArray().forEach(ref => {
                   const annot = pdfDoc.context.lookup(ref);
                   if (annot instanceof PDFDict) {
                     const title = annot.get(PDFName.of('T'));
                     const contents = annot.get(PDFName.of('Contents'));
                     let name = '';
                     if (title instanceof PDFString || title instanceof PDFHexString) name = title.decodeText();
                     if ((!name || name === 'ramboo') && (contents instanceof PDFString || contents instanceof PDFHexString)) name = contents.decodeText();
                     const cleanName = name.replace('{{', '').replace('}}', '');
                     if (name === key || cleanName === key) {
                       annot.set(PDFName.of('Contents'), PDFString.of(val));
                     }
                   }
                 });
               }
             });
          }
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `TEST_${t.name}.pdf`;
      link.click();
    } catch (err) {
      console.error(err);
      alert("Failed to generate test PDF.");
    }
  };

  const [debugInfo, setDebugInfo] = useState<Record<number, any>>({});

  const debugScanFields = async (id: number) => {
    const t = await db.pdfTemplates.get(id);
    if (!t) return;
    try {
      const bytes = await fetch(t.pdfBase64).then(res => res.arrayBuffer());
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = pdfDoc.getPages();
      
      const structure: any[] = [];

      pages.forEach((page, index) => {
        const pageInfo: any = {
          page: index + 1,
          elements: []
        };

        // Check annotations (Widgets, Links, etc.)
        const annots = page.node.Annots();
        if (annots) {
          annots.asArray().forEach((annotRef, i) => {
            const annot = pdfDoc.context.lookup(annotRef);
            if (annot instanceof PDFDict) {
              const type = annot.get(PDFName.of('Type'))?.toString() || 'Unknown';
              const subtype = annot.get(PDFName.of('Subtype'))?.toString() || 'Unknown';
              const name = annot.get(PDFName.of('T'))?.toString() || '(No Name)';
              const contents = annot.get(PDFName.of('Contents'))?.toString() || '';
              const rect = annot.get(PDFName.of('Rect'))?.toString() || '[]';
              
              pageInfo.elements.push({
                kind: 'Annotation',
                type,
                subtype,
                name,
                contents,
                rect,
                rawKeys: annot.keys().map(k => k.toString())
              });
            }
          });
        }

        // Check for fields via getForm if they exist
        try {
          const form = pdfDoc.getForm();
          const fields = form.getFields();
          fields.forEach(f => {
            pageInfo.elements.push({
              kind: 'FormField',
              name: f.getName(),
              type: f.constructor.name
            });
          });
        } catch (e) {}

        structure.push(pageInfo);
      });

      setDebugInfo(prev => ({ ...prev, [id]: structure }));
      console.log(`Debug Structure for ${t.name}:`, structure);
      alert("Debug scan complete. Scroll down to see the PDF structure below the template config.");
    } catch (err) {
      console.error(err);
      alert(`Debug scan failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const scanFields = async (id: number) => {
    const t = await db.pdfTemplates.get(id);
    if (!t) return;
    try {
      const bytes = await fetch(t.pdfBase64).then(res => res.arrayBuffer());
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      
      // 1. Scan for Form Fields
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      
      console.log("PDF Form Fields:", fields.map(f => `${f.getName()} [${f.constructor.name}]`));

      const annotationNames = new Set<string>();
      
      // Always scan annotations for potential fields (especially if getForm() missed them or they are pseudo-fields)
      const pages = pdfDoc.getPages();
      pages.forEach(page => {
        const annotations = page.node.Annots();
        if (annotations) {
          annotations.asArray().forEach(annotRef => {
            const annot = pdfDoc.context.lookup(annotRef);
            if (annot instanceof PDFDict) {
              const subtype = annot.get(PDFName.of('Subtype'));
              if (subtype === PDFName.of('Widget') || subtype === PDFName.of('FreeText')) {
                // Try 'T' (Name), then 'Contents' (for FreeText/Sticky notes), then 'TU' (ToolTip), then 'TM' (Alt name)
                let fieldName = '';
                const tKey = annot.get(PDFName.of('T'));
                const contents = annot.get(PDFName.of('Contents'));
                const tu = annot.get(PDFName.of('TU'));
                const tm = annot.get(PDFName.of('TM'));

                if (tKey instanceof PDFString || tKey instanceof PDFHexString) {
                  fieldName = tKey.decodeText();
                } 
                
                // If name is generic or missing, and we have contents, use contents
                // The user specifically wants to use 'Contents' if available
                if ((!fieldName || fieldName === 'ramboo') && (contents instanceof PDFString || contents instanceof PDFHexString)) {
                  fieldName = contents.decodeText();
                }

                if (!fieldName && (tu instanceof PDFString || tu instanceof PDFHexString)) {
                  fieldName = tu.decodeText();
                } else if (!fieldName && (tm instanceof PDFString || tm instanceof PDFHexString)) {
                  fieldName = tm.decodeText();
                }

                if (fieldName) {
                  // Clean field name if it contains {{}}
                  const cleanedName = fieldName.replace('{{', '').replace('}}', '');
                  annotationNames.add(cleanedName);
                } else {
                  // If no name found, maybe it's linked via /Parent?
                  const parent = annot.get(PDFName.of('Parent'));
                  if (parent instanceof PDFDict) {
                    const pt = parent.get(PDFName.of('T'));
                    if (pt instanceof PDFString || pt instanceof PDFHexString) {
                      annotationNames.add(pt.decodeText().replace('{{', '').replace('}}', ''));
                    }
                  }
                }
              }
            }
          });
        }
      });

      let fieldNames = fields.map(f => f.getName());
      
      // Merge with names found from annotations
      annotationNames.forEach(name => {
        if (!fieldNames.includes(name)) {
          fieldNames.push(name);
        }
      });

      const formMappings = fieldNames.map(name => {
        return {
          placeholder: `{{${name}}}`,
          dataSource: 'kunde' as const
        };
      });

      // 2. Inform user if no fields found and suggest alternatives
      if (formMappings.length === 0) {
        alert("No interactive PDF form fields found. \n\nIf your PDF has text placeholders like '{{forderziel}}', please note that these are NOT automatic form fields. \n\nTo fix this: \n1. Open your ODS/Word file. \n2. Add 'Form Fields' (Text Box) over your placeholders. \n3. Export as PDF again (ensure 'Create PDF Form' is checked).");
      }

      // Merge with existing mappings to avoid duplicates
      const existingPlaceholders = new Set(t.fieldMappings.map(m => m.placeholder));
      const merged = [...t.fieldMappings, ...formMappings.filter(m => !existingPlaceholders.has(m.placeholder))];
      
      await db.pdfTemplates.update(id, { fieldMappings: merged, detectedFields: fieldNames });
      if (formMappings.length > 0) {
        alert(`Found and added ${formMappings.length} potential form fields.`);
      }
    } catch (err) {
      console.error(err);
      alert(`Failed to scan PDF: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">PDF Templates (Form Fields)</h2>
          <p className="text-sm text-gray-500">
            Upload a PDF with interactive form fields (exported from ODS/Word as PDF Form) to map data.
            <br />
            <span className="text-orange-600 font-semibold">Note:</span> If your PDF only contains static text like <code>{"{{placeholder}}"}</code>, it is NOT an interactive form. You must create form fields in your PDF editor first.
          </p>
        </div>
        <label className="bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer flex items-center gap-2 hover:bg-blue-700 transition">
          <Plus size={20} /> Upload New PDF
          <input type="file" accept=".pdf" className="hidden" onChange={(e) => handleFileUpload(e)} />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {templates.map(t => (
          <div key={t.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <input 
                type="text" 
                className="text-xl font-bold bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-gray-900"
                value={t.name}
                onChange={(e) => db.pdfTemplates.update(t.id!, { name: e.target.value })}
              />
              <div className="flex gap-2">
                <button 
                  onClick={() => debugScanFields(t.id!)}
                  className="text-orange-600 hover:bg-orange-50 px-3 py-2 rounded-lg transition text-sm flex items-center gap-1"
                  title="Debug PDF Structure"
                >
                  <Search size={16} /> Debug
                </button>
                <button 
                  onClick={() => scanFields(t.id!)}
                  className="text-green-600 hover:bg-green-50 px-3 py-2 rounded-lg transition text-sm flex items-center gap-1"
                >
                  <RefreshCw size={16} /> Scan Fields
                </button>
                <button 
                  onClick={() => testFillPdf(t.id!)}
                  className="text-purple-600 hover:bg-purple-50 px-3 py-2 rounded-lg transition text-sm flex items-center gap-1"
                >
                  <Download size={16} /> Test Fill
                </button>
                <button 
                  onClick={() => setEditingId(editingId === t.id ? null : t.id!)}
                  className="text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition"
                >
                  {editingId === t.id ? 'Close' : 'Configure Mappings'}
                </button>
                <button 
                  onClick={() => db.pdfTemplates.delete(t.id!)}
                  className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>

            {editingId === t.id && (
              <div className="mt-6 space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="bg-gray-50 p-4 rounded-lg flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold text-gray-900">Auto-Scan</h3>
                      <p className="text-xs text-gray-500">Automatically detect fillable form fields in the PDF.</p>
                      {t.detectedFields && t.detectedFields.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {t.detectedFields.map(fn => {
                            const isMapped = t.fieldMappings.some(m => m.placeholder === `{{${fn}}}`);
                            return (
                              <span key={fn} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${isMapped ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                                {fn}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <button 
                    onClick={() => scanFields(t.id!)}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm font-bold shrink-0 ml-4"
                    >
                      Scan for PDF Fields
                    </button>
                  </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-gray-900">Field Mappings</h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => testFillPdf(t.id!)}
                        className="text-sm bg-orange-100 text-orange-700 px-3 py-1 rounded hover:bg-orange-200 flex items-center gap-1"
                        title="Download a sample PDF with test data to check alignment"
                      >
                        <Download size={14} /> Test Fill PDF
                      </button>
                      <button 
                        onClick={() => addMapping(t.id!)}
                        className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200"
                      >
                        + Add Mapping Manually
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {t.fieldMappings.map((m, idx) => (
                      <div key={idx} className="flex gap-2 items-center bg-white p-3 rounded border border-gray-200">
                        <div className="flex-1">
                          <input 
                            type="text" 
                            className="w-full border-b bg-transparent py-1 text-sm text-gray-900 focus:border-blue-500 outline-none"
                            placeholder="{{placeholder}}"
                            value={m.placeholder}
                            onChange={(e) => updateMapping(t.id!, idx, 'placeholder', e.target.value)}
                          />
                        </div>
                        <div className="flex-1">
                          <select 
                            className="w-full bg-transparent text-sm text-gray-900 outline-none"
                            value={m.dataSource}
                            onChange={(e) => updateMapping(t.id!, idx, 'dataSource', e.target.value)}
                          >
                            <optgroup label="General Info">
                              <option value="kunde">Customer Name</option>
                              <option value="dienstleistung">Service</option>
                              <option value="assistent">Assistant</option>
                              <option value="adresse">Address</option>
                              <option value="anfahrtFrom">Travel From (Default)</option>
                              <option value="abfahrtTo">Travel To (Default)</option>
                              <option value="month">Month (MM)</option>
                              <option value="month_name">Month Name</option>
                              <option value="year">Year (YYYY)</option>
                            </optgroup>
                            <optgroup label="Statistics">
                              <option value="total_km">Total KM (Month)</option>
                              <option value="total_work">Total Work (Month)</option>
                              <option value="total_drive">Total Drive Time (Month)</option>
                              <option value="total_gas_cost">Total Gasoline Cost</option>
                            </optgroup>
                            <optgroup label="Daily Logs (Row 1 Examples)">
                              <option value="date_1">Date (Row 1)</option>
                              <option value="foerderziel_1">Goal (Row 1)</option>
                              <option value="assistenzinhalt_1">Content (Row 1)</option>
                              <option value="anmerkungreflexion_1">Reflection (Row 1)</option>
                              <option value="zeitvb_1">Time Von-Bis (Row 1)</option>
                              <option value="zeitinmin_1">Time in Min (Row 1)</option>
                              <option value="anabfhart_from_1">Travel From (Row 1)</option>
                              <option value="anabfhart_too_1">Travel To (Row 1)</option>
                              <option value="traveltime_1">Travel Time (Row 1)</option>
                              <option value="km_1">Travel KM (Row 1)</option>
                              <option value="customer_anabfhart_from_1">Cust. Travel From (Row 1)</option>
                              <option value="customer_anabfhart_too_1">Cust. Travel To (Row 1)</option>
                              <option value="coustomer_traveltime_1">Cust. Travel Time (Row 1)</option>
                              <option value="couistomer_km_1">Cust. Travel KM (Row 1)</option>
                            </optgroup>
                          </select>
                        </div>
                        <button 
                          onClick={() => deleteMapping(t.id!, idx)}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {t.fieldMappings.length === 0 && (
                    <p className="text-gray-500 text-center py-4 italic text-sm">No mappings. Use "Scan for PDF Fields" or add manually.</p>
                  )}
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-2 text-gray-900">Replace PDF File</h3>
                  <input type="file" accept=".pdf" onChange={(e) => handleFileUpload(e, t.id)} className="text-sm text-gray-600" />
                </div>

                {debugInfo[t.id!] && (
                  <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-xs overflow-auto max-h-96 border-2 border-green-900 shadow-inner">
                    <div className="flex justify-between items-center mb-2 border-b border-green-900 pb-1">
                      <span className="font-bold">PDF STRUCTURE DEBUGGER</span>
                      <button onClick={() => setDebugInfo(prev => { const n = {...prev}; delete n[t.id!]; return n; })} className="hover:text-white">CLEAR</button>
                    </div>
                    {debugInfo[t.id!].map((page: any, pi: number) => (
                      <div key={pi} className="mb-4">
                        <div className="text-white border-b border-gray-800 mb-1">PAGE {page.page}</div>
                        {page.elements.length === 0 ? (
                          <div className="text-gray-600 italic">No searchable elements found on this page.</div>
                        ) : (
                          page.elements.map((el: any, ei: number) => (
                            <div key={ei} className="ml-2 mb-1 border-l border-gray-800 pl-2">
                              <span className="text-blue-400">[{el.kind}]</span>{' '}
                              <span className="text-yellow-400">{el.name}</span>{' '}
                              <span className="text-gray-500">({el.type || el.subtype})</span>
                              {el.contents && <div className="text-green-400">Contents: {el.contents}</div>}
                              {el.rect && <div className="text-[10px] text-gray-600">Rect: {el.rect}</div>}
                              {el.rawKeys && <div className="text-[10px] text-gray-600">Keys: {el.rawKeys.join(', ')}</div>}
                            </div>
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplatesView() {
  const templates = useLiveQuery(() => db.templates.toArray()) || [];
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const initialFields: TemplateField[] = [
    { id: 'title', label: 'Protokoll Titel', x: 105, y: 20, visible: true, type: 'static', content: 'ASSISTENZPROTOKOLL', fontSize: 18, fontStyle: 'bold', color: '#000000', width: 210, zOrder: 0 },
    { id: 'dienstleistung', label: 'Dienstleistung: ', x: 14, y: 30, visible: true, type: 'data', color: '#000000', zOrder: 1 },
    { id: 'kunde', label: 'Kunde: ', x: 14, y: 35, visible: true, type: 'data', color: '#000000', zOrder: 2 },
    { id: 'assistent', label: 'Assistent: ', x: 14, y: 40, visible: true, type: 'data', color: '#000000', zOrder: 3 },
    { id: 'adresse', label: 'Adresse: ', x: 14, y: 45, visible: true, type: 'data', color: '#000000', zOrder: 4 },
    { id: 'anfahrtFrom', label: 'Anfahrt von: ', x: 14, y: 50, visible: false, type: 'data', color: '#000000', zOrder: 5 },
    { id: 'abfahrtTo', label: 'Abfahrt zu: ', x: 14, y: 55, visible: false, type: 'data', color: '#000000', zOrder: 6 },
    { id: 'driveTimeMinutes', label: 'Fahrtzeit: ', x: 14, y: 60, visible: false, type: 'data', color: '#000000', zOrder: 7 },
    { id: 'km', label: 'Kilometer: ', x: 14, y: 65, visible: false, type: 'data', color: '#000000', zOrder: 8 },
    { id: 'month', label: 'Monat: ', x: 14, y: 70, visible: true, type: 'data', color: '#000000', zOrder: 9 },
  ];

  const [formData, setFormData] = useState<Partial<Template>>({
    name: '',
    title: '',
    fields: initialFields,
    primaryColor: '#c8c8c8',
    fontSize: 8,
    tableY: 80
  });

  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);

  const handleSave = async () => {
    if (!formData.name) return;
    const data = { ...formData } as Template;
    if (editingId) {
      const { id, ...updateData } = data;
      await db.templates.update(editingId, updateData);
    } else {
      await db.templates.add(data);
    }
    setEditingId(null);
    setFormData({
      name: '',
      title: '',
      fields: initialFields,
      primaryColor: '#c8c8c8',
      fontSize: 8,
      tableY: 80
    });
  };

  const handleApplyPreset = (preset: 'standard' | 'lebenshilfe') => {
    const lebenshilfeFields: TemplateField[] = [
      // Top Section
      { id: 'lh_logo_box', label: 'Logo', x: 14, y: 10, visible: true, type: 'static', content: 'lebenshilfe', fontSize: 14, fontStyle: 'bold', color: '#10b981', width: 40, height: 15, zOrder: 1 },
      { id: 'lh_region', label: 'Region', x: 14, y: 25, visible: true, type: 'static', content: 'Region Knittelfeld', fontSize: 10, fontStyle: 'bold', color: '#7c2d12', zOrder: 2 },
      { id: 'lh_wohnassistenz', label: 'Wohnassistenz', x: 105, y: 15, visible: true, type: 'static', content: 'Wohnassistenz (ASS-W)', fontSize: 12, fontStyle: 'bold', color: '#10b981', zOrder: 3 },
      { id: 'title', label: 'Protokoll Titel', x: 105, y: 35, visible: true, type: 'static', content: 'Assistenzprotokoll/UB', fontSize: 14, fontStyle: 'bold', zOrder: 4 },
      { id: 'lh_mobile', label: 'Mobile Dienste', x: 14, y: 45, visible: true, type: 'static', content: 'MOBILE DIENSTE', fontSize: 11, zOrder: 5 },
      
      // Header Table (Right Aligned Boxes)
      { id: 'kunde', label: 'Kunde/in: ', x: 110, y: 15, visible: true, type: 'data', fontSize: 10, zOrder: 6 },
      { id: 'adresse', label: 'Adresse: ', x: 110, y: 25, visible: true, type: 'data', fontSize: 10, zOrder: 7 },
      { id: 'assistent', label: 'Betreuer/in: ', x: 110, y: 35, visible: true, type: 'data', fontSize: 10, zOrder: 8 },
      { id: 'month', label: 'Monat: ', x: 110, y: 45, visible: true, type: 'data', fontSize: 10, zOrder: 9 },
      { id: 'year', label: 'Jahr: ', x: 170, y: 45, visible: true, type: 'data', fontSize: 10, zOrder: 10 },
      
      // Middle Lines
      { id: 'lh_line1', label: 'Line 1', x: 14, y: 55, visible: true, type: 'static', content: '________________________________________________________________________________________________________________', fontSize: 8, zOrder: 11 },
      { id: 'lh_foerderziel', label: 'Förderziel:', x: 14, y: 62, visible: true, type: 'static', content: 'Förderziel:', fontSize: 10, zOrder: 12 },
      { id: 'lh_line2', label: 'Line 2', x: 14, y: 72, visible: true, type: 'static', content: '________________________________________________________________________________________________________________', fontSize: 8, zOrder: 13 },
      { id: 'lh_assistenzinhalt', label: 'Assistenzinhalt:', x: 14, y: 79, visible: true, type: 'static', content: 'Assistenzinhalt:', fontSize: 10, zOrder: 14 },
      { id: 'lh_line3', label: 'Line 3', x: 14, y: 125, visible: true, type: 'static', content: '________________________________________________________________________________________________________________', fontSize: 8, zOrder: 15 },
      
      // Footer Info (Fixed at bottom)
      { id: 'lh_footer_sig1', label: 'Unterschrift Kunde/in:', x: 14, y: 260, visible: true, type: 'static', content: 'Unterschrift Kunde/in: _________________________________', fontSize: 9, zOrder: 16 },
      { id: 'lh_footer_sig2', label: 'Unterschrift Betreuer/in:', x: 110, y: 260, visible: true, type: 'static', content: 'Unterschrift Betreuer/in: _________________________________', fontSize: 9, zOrder: 17 },
      { id: 'lh_footer_info1', label: 'Legal 1', x: 105, y: 275, visible: true, type: 'static', content: 'Lebenshilfe Region Knittelfeld gem. GmbH / FN 535534a – LG Leoben / UID-Nr: ATU 75895514', fontSize: 7, fontStyle: 'normal', zOrder: 18 },
      { id: 'lh_footer_info2', label: 'Legal 2', x: 105, y: 280, visible: true, type: 'static', content: 'Tel.: +43/(0)3512 74184; Fax: +43/(0)3512 74184-9; E-Mail: office@lebenshilfe-knittelfeld.at', fontSize: 7, zOrder: 19 },
      { id: 'lh_footer_info3', label: 'Legal 3', x: 105, y: 285, visible: true, type: 'static', content: 'Raiba Aichfeld, IBAN: AT84 3834 6000 0020 6334, BIC: RZSTAT2G346', fontSize: 7, zOrder: 20 },
    ];

    if (preset === 'lebenshilfe') {
      setFormData({
        name: 'My Lebenshilfe Protocol',
        title: 'Assistenzprotokoll/UB',
        fields: lebenshilfeFields,
        primaryColor: '#10b981',
        fontSize: 9,
        tableY: 135
      });
    } else {
      setFormData({
        name: 'New Standard Template',
        title: 'ASSISTENZPROTOKOLL',
        fields: initialFields,
        primaryColor: '#c8c8c8',
        fontSize: 8,
        tableY: 80
      });
    }
  };

  const updateField = (id: string, updates: Partial<TemplateField>) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields?.map(f => f.id === id ? { ...f, ...updates } : f)
    }));
  };

  const addField = (type: 'static' | 'image') => {
    const id = `${type}_${Date.now()}`;
    const newField: TemplateField = {
      id,
      label: type === 'static' ? 'New Text' : 'New Image',
      x: 50,
      y: 50,
      visible: true,
      type,
      content: type === 'static' ? 'Your Text Here' : '',
      color: '#000000',
      width: type === 'image' ? 30 : undefined,
      height: type === 'image' ? 30 : undefined,
      zOrder: (formData.fields?.length || 0) + 10,
    };
    setFormData(prev => ({
      ...prev,
      fields: [...(prev.fields || []), newField]
    }));
    setExpandedFieldId(id);
  };

  const removeField = (id: string) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields?.filter(f => f.id !== id)
    }));
  };

  const handleImageUpload = (id: string, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      updateField(id, { content: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Template' : 'Create New Template'}</h3>
          <div className="flex gap-2">
            <button onClick={() => handleApplyPreset('standard')} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium border transition-colors">Apply Standard Preset</button>
            <button onClick={() => handleApplyPreset('lebenshilfe')} className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg font-medium border border-emerald-200 transition-colors">Apply Lebenshilfe Preset</button>
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-6">Create and position fields for your PDF protocol. Drag items on the visual editor to move them.</p>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
               <input className="border rounded p-2 bg-white text-gray-900" placeholder="Template Name" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
               <input className="border rounded p-2 bg-white text-gray-900" placeholder="Protocol Title" value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} />
            </div>

            <div className="space-y-2 border rounded p-4 bg-gray-50 max-h-96 overflow-y-auto">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-bold text-sm text-gray-700 uppercase">Field Configuration</h4>
                <div className="flex gap-1">
                  <button onClick={() => addField('static')} className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded">Add Text</button>
                  <button onClick={() => addField('image')} className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded">Add Image</button>
                </div>
              </div>
              {formData.fields?.map(field => (
                <div key={field.id} className="bg-white p-2 rounded border shadow-sm space-y-2">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={field.visible} onChange={e => updateField(field.id, { visible: e.target.checked })} />
                    <span className="text-sm font-medium flex-1 text-gray-900 cursor-pointer overflow-hidden whitespace-nowrap text-ellipsis" onClick={() => setExpandedFieldId(expandedFieldId === field.id ? null : field.id)}>
                      {field.label} {field.type && <span className="text-[10px] bg-gray-100 px-1 rounded text-gray-400">{field.type}</span>}
                    </span>
                    <div className="flex gap-1 items-center flex-shrink-0">
                      <span className="text-[10px] text-gray-500">X:</span>
                      <input type="number" className="w-10 border rounded p-1 text-[10px] bg-white text-gray-900" value={field.x} onChange={e => updateField(field.id, { x: Number(e.target.value) })} />
                      <span className="text-[10px] text-gray-500">Y:</span>
                      <input type="number" className="w-10 border rounded p-1 text-[10px] bg-white text-gray-900" value={field.y} onChange={e => updateField(field.id, { y: Number(e.target.value) })} />
                      <span className="text-[10px] text-gray-500">Z:</span>
                      <input type="number" className="w-10 border rounded p-1 text-[10px] bg-white text-gray-900" value={field.zOrder || 0} onChange={e => updateField(field.id, { zOrder: Number(e.target.value) })} />
                      {field.id.includes('_') && <button onClick={() => removeField(field.id)} className="text-red-500 p-1"><Trash2 size={12} /></button>}
                    </div>
                  </div>
                  
                  {expandedFieldId === field.id && (
                    <div className="p-2 bg-gray-50 rounded border-t space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] block font-bold text-gray-500">Label</label>
                          <input className="w-full border rounded p-1 text-xs" value={field.label} onChange={e => updateField(field.id, { label: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-[10px] block font-bold text-gray-500">Font Size</label>
                          <input type="number" className="w-full border rounded p-1 text-xs" value={field.fontSize || ''} placeholder="Default" onChange={e => updateField(field.id, { fontSize: Number(e.target.value) })} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] block font-bold text-gray-500">Font Style</label>
                          <select className="w-full border rounded p-1 text-xs" value={field.fontStyle || 'normal'} onChange={e => updateField(field.id, { fontStyle: e.target.value as any })}>
                            <option value="normal">Normal</option>
                            <option value="bold">Bold</option>
                            <option value="italic">Italic</option>
                            <option value="bolditalic">Bold Italic</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] block font-bold text-gray-500">Text Color</label>
                          <input type="color" className="w-full h-8 border rounded p-1" value={field.color || '#000000'} onChange={e => updateField(field.id, { color: e.target.value })} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] block font-bold text-gray-500">Width (mm)</label>
                          <input type="number" className="w-full border rounded p-1 text-xs" value={field.width || ''} placeholder="Auto" onChange={e => updateField(field.id, { width: Number(e.target.value) })} />
                        </div>
                        <div>
                          <label className="text-[10px] block font-bold text-gray-500">Height (mm)</label>
                          <input type="number" className="w-full border rounded p-1 text-xs" value={field.height || ''} placeholder="Auto" onChange={e => updateField(field.id, { height: Number(e.target.value) })} />
                        </div>
                      </div>

                      {(field.type === 'static' || field.id === 'title') && (
                        <div>
                          <label className="text-[10px] block font-bold text-gray-500">Content</label>
                          <textarea className="w-full border rounded p-1 text-xs" rows={2} value={field.content || ''} onChange={e => updateField(field.id, { content: e.target.value })} />
                        </div>
                      )}

                      {field.type === 'image' && (
                        <div>
                          <label className="text-[10px] block font-bold text-gray-500">Image</label>
                          <input type="file" accept="image/*" className="text-[10px] w-full" onChange={e => e.target.files?.[0] && handleImageUpload(field.id, e.target.files[0])} />
                          {field.content && <img src={field.content} className="mt-1 h-12 object-contain border rounded p-1" alt="Preview" />}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2 bg-blue-50 p-2 rounded border border-blue-200 mt-4">
                 <span className="text-sm font-bold text-blue-700 flex-1">Table Start Position (Y)</span>
                 <input type="number" className="w-16 border rounded p-1 text-xs bg-white text-gray-900" value={formData.tableY || 80} onChange={e => setFormData({...formData, tableY: Number(e.target.value)})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Theme Color</label>
                 <input type="color" className="border rounded h-10 w-full p-1 bg-white" value={formData.primaryColor || '#c8c8c8'} onChange={e => setFormData({...formData, primaryColor: e.target.value})} />
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Font Size (pt)</label>
                 <input type="number" className="border rounded p-1 w-full bg-white text-gray-900" value={formData.fontSize || 8} onChange={e => setFormData({...formData, fontSize: Number(e.target.value)})} />
               </div>
            </div>
          </div>

          <div className="flex flex-col">
            <h4 className="font-bold text-sm text-gray-500 uppercase mb-2 flex items-center gap-2">
              <Move size={16} /> Visual Layout Editor (Draft)
            </h4>
            <div 
              className="relative bg-white border-2 border-dashed border-gray-300 rounded-lg aspect-[1/1.4] w-full max-w-[400px] shadow-inner overflow-hidden cursor-crosshair mx-auto"
              style={{ backgroundSize: '20px 20px', backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)' }}
              onMouseMove={(e) => {
                if (!draggedFieldId) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = Math.round(((e.clientX - rect.left) / rect.width) * 210);
                const y = Math.round(((e.clientY - rect.top) / rect.height) * 297);
                updateField(draggedFieldId, { x, y });
              }}
              onMouseUp={() => setDraggedFieldId(null)}
              onMouseLeave={() => setDraggedFieldId(null)}
            >
              {/* PDF Header Title Placeholder (Removed - title is now a draggable field) */}
              
              {/* Draggable Fields */}
              {formData.fields?.filter(f => f.visible).map(field => (
                <div 
                  key={field.id}
                  className={`absolute p-1 border rounded text-[8px] whitespace-nowrap cursor-move select-none ${draggedFieldId === field.id ? 'bg-blue-100 border-blue-500 z-10' : 'bg-white border-gray-200 hover:border-blue-300'}`}
                  style={{ 
                    top: field.y !== undefined ? `${(field.y / 297) * 100}%` : '0%',
                    transform: field.id === 'title' ? 'translate(-50%, -50%)' : 'translate(-5%, -50%)',
                    fontSize: field.fontSize ? `${(field.fontSize / 297) * 100 * 3.5}px` : '8px',
                    fontWeight: field.fontStyle?.includes('bold') ? 'bold' : 'normal',
                    fontStyle: field.fontStyle?.includes('italic') ? 'italic' : 'normal',
                    color: field.color || 'black',
                    textAlign: field.id === 'title' ? 'center' : 'left',
                    width: field.width ? `${(field.width / 210) * 100}%` : (field.id === 'title' ? '100%' : 'auto'),
                    height: field.height ? `${(field.height / 297) * 100}%` : 'auto',
                    left: field.id === 'title' ? '50%' : (field.x !== undefined ? `${(field.x / 210) * 100}%` : '0%'),
                    overflow: 'hidden',
                    zIndex: field.zOrder || 0,
                  }}
                  onMouseDown={() => setDraggedFieldId(field.id)}
                >
                  {field.type === 'image' && field.content ? (
                    <img src={field.content} className="w-full h-full object-contain" alt="Logo" />
                  ) : (
                    <>
                      {field.label && <span className="font-bold">{field.label}</span>}
                      <span> {field.type === 'static' || field.id === 'title' ? field.content : '[Data]'}</span>
                    </>
                  )}
                </div>
              ))}

              {/* Table Marker */}
              <div 
                className="absolute left-0 right-0 border-t-2 border-blue-400 border-dotted bg-blue-50 bg-opacity-20 flex items-center justify-center pointer-events-none"
                style={{ top: `${((formData.tableY || 80) / 297) * 100}%`, bottom: 0 }}
              >
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Protocol Table Area</span>
              </div>
            </div>
            <p className="text-center text-xs text-gray-400 mt-2 italic">Drag fields to position them. 1 unit = 1mm on A4.</p>
          </div>
        </div>
        
        <div className="mt-8 pt-6 border-t flex gap-3">
          <button onClick={handleSave} className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 shadow-md">
            <Save size={20} /> Save Template
          </button>
          {editingId && <button onClick={() => {setEditingId(null); setFormData({name: '', title: '', fields: [], primaryColor: '#c8c8c8', fontSize: 8, tableY: 80});}} className="bg-gray-100 px-8 py-3 rounded-lg font-bold text-gray-600">Cancel</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates?.map(t => (
          <div key={t.id} className="bg-white p-5 rounded-xl border shadow-sm flex justify-between items-center group hover:border-blue-200 transition-all">
            <div className="flex items-center gap-4">
               <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ backgroundColor: t.primaryColor }}>
                 {t.name.charAt(0)}
               </div>
               <div>
                 <h4 className="font-bold text-gray-800">{t.name}</h4>
                 <p className="text-xs text-gray-400">{t.fields?.filter(f => f.visible).length || 0} fields visible</p>
               </div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => {setEditingId(t.id!); setFormData(t);}} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Plus size={18} /></button>
              <button onClick={async () => { if(confirm('Delete template?')) await db.templates.delete(t.id!); }} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryView() {
  const history = useLiveQuery(() => db.auditTrail.orderBy('timestamp').reverse().limit(50).toArray());

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-gray-50 text-xs font-bold text-gray-700 uppercase">
          <tr>
            <th className="p-4">Time</th>
            <th className="p-4">Action</th>
            <th className="p-4">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {history?.map(item => (
            <tr key={item.id}>
              <td className="p-4 text-sm text-gray-500">{format(item.timestamp, 'dd.MM HH:mm:ss')}</td>
              <td className="p-4">
                <span className={`px-2 py-1 rounded text-xs font-bold ${
                  item.action === 'create' ? 'bg-green-100 text-green-700' : 
                  item.action === 'update' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                }`}>
                  {item.action.toUpperCase()} {item.entityType.toUpperCase()}
                </span>
              </td>
              <td className="p-4 text-sm font-mono text-gray-600 max-w-lg truncate">
                {JSON.stringify(item.newValue || item.oldValue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
