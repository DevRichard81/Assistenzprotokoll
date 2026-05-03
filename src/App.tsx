import React, { useState, useEffect } from 'react';
import { PDFDocument, PDFDict, PDFName, PDFString, PDFHexString } from 'pdf-lib';
import { db, type Customer, type DailyLog } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { Plus, Trash2, Save, FileText, BarChart, History, User, Calendar, Settings, Download, Search, RefreshCw } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- Types ---
type View = 'customers' | 'logs' | 'stats' | 'history' | 'settings' | 'pdfTemplates';

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
    // Check if initial settings exist
    const checkSettings = async () => {
      try {
        const gasSettings = await db.settings.get('gasoline');
        if (!gasSettings) {
          await db.settings.put({ key: 'gasoline', value: { consumption: 7, price: 1.60 } });
        }
      } catch (error) {
        console.error("Failed to init settings:", error);
      }
    };
    checkSettings();
  }, []);

  const customers = useLiveQuery(() => db.customers.toArray());
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
          <NavItem icon={<FileText />} label="Templates" active={activeView === 'pdfTemplates'} onClick={() => setActiveView('pdfTemplates')} />
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

  const generatePDF = async (scope: 'selected' | 'month' = 'selected') => {
    if (!customer || !logs) return;

    const activePdfTemplateSetting = await db.settings.get('activePdfTemplateId');
    const pdfTemplateId = activePdfTemplateSetting?.value;
    const pdfTemplate = pdfTemplateId ? await db.pdfTemplates.get(pdfTemplateId) : null;
    if (!pdfTemplate) {
      alert('Please select an active PDF template in Settings before exporting.');
      return;
    }

    const selectedDateSet = new Set(selectedDayStrings);
    const exportEntries = days
      .map((day) => {
        const date = format(day, 'yyyy-MM-dd');
        return { day, date, log: logs.find((l) => l.date === date) };
      })
      .filter((entry) => {
        if (!entry.log) return false;
        return scope === 'month' ? true : selectedDateSet.has(entry.date);
      });

    if (exportEntries.length === 0) {
      alert(scope === 'month' ? 'No saved logs found for this month.' : 'Please select at least one saved day to export.');
      return;
    }

    const [yearStr, monthStr] = month.split('-');
    const monthTotalKm = exportEntries.reduce((acc, entry) => acc + (entry.log?.km || customer.km || 0), 0);
    const monthTotalWorkMinutes = exportEntries.reduce((acc, entry) => acc + (entry.log?.timeWithCustomerMinutes || 0), 0);
    const monthTotalDriveMinutes = exportEntries.reduce((acc, entry) => acc + (entry.log?.traveltime || customer.driveTimeMinutes || 0), 0);
    const gasSettings = await db.settings.get('gasoline');
    const fuelPrice = gasSettings?.value?.price || 0;
    const fuelConsumption = gasSettings?.value?.consumption || 0;

    const normalizeFieldName = (value: string) => value.replaceAll('{{', '').replaceAll('}}', '').toLowerCase().replace(/[^a-z0-9]+/g, '');

    const aliasToDataKey: Record<string, string> = {
      betreuer: 'assistent',
      betreuerin: 'assistent',
      monat: 'month',
      jahr: 'year',
      datum: 'date_1',
      forderziel: 'foerderziel_1',
      foerderziel: 'foerderziel_1',
      assistenzinhalt: 'assistenzinhalt_1',
      anmerkungreflexion: 'anmerkungreflexion_1',
      anmerkungenreflexion: 'anmerkungreflexion_1',
      zeitvb: 'zeitvb_1',
      zeitvonbis: 'zeitvb_1',
      zeitinmin: 'zeitinmin_1',
      anabfhartvon: 'anabfhart_von_1',
      anabfhartbis: 'anabfhart_bis_1',
      anabfahrtvon: 'anabfhart_von_1',
      anabfahrtbis: 'anabfhart_bis_1',
      anabzeit: 'anab_zeit_1',
      anabkm: 'anab_km_1',
      kdanabfhartvon: 'kdanabfhart_von_1',
      kdanabfhartbis: 'kdanabfhart_bis_1',
      kdanabfahrtvon: 'kdanabfhart_von_1',
      kdanabfahrtbis: 'kdanabfhart_bis_1',
      kdanabzeit: 'kdanab_zeit_1',
      kdanabkm: 'kdanab_km_1',
    };

    const resolveDataValue = (token: string, dataMap: Record<string, string>) => {
      if (!token) return undefined;
      if (Object.prototype.hasOwnProperty.call(dataMap, token)) return dataMap[token];

      const clean = token.replaceAll('{{', '').replaceAll('}}', '').trim();
      if (Object.prototype.hasOwnProperty.call(dataMap, clean)) return dataMap[clean];

      const normalizedToken = normalizeFieldName(clean);
      const normalizedDataEntry = Object.entries(dataMap).find(([key]) => normalizeFieldName(key) === normalizedToken);
      if (normalizedDataEntry) return normalizedDataEntry[1];

      const aliasKey = aliasToDataKey[normalizedToken];
      if (aliasKey && Object.prototype.hasOwnProperty.call(dataMap, aliasKey)) return dataMap[aliasKey];

      return undefined;
    };

    const setPdfFieldValue = (
      pdfDoc: PDFDocument,
      fieldToken: string,
      value: string,
      form: ReturnType<PDFDocument['getForm']>
    ) => {
      const clean = fieldToken.replaceAll('{{', '').replaceAll('}}', '').trim();
      const candidates = Array.from(new Set([
        fieldToken,
        clean,
        `{{${clean}}}`,
      ])).filter(Boolean);

      const allFields = form.getFields();
      let fieldHandled = false;

      for (const candidate of candidates) {
        try {
          const exact = allFields.find((f) => f.getName() === candidate);
          if (exact && 'setText' in exact) {
            (exact as any).setText(value);
            fieldHandled = true;
            break;
          }
        } catch (e) {}

        try {
          const normalizedCandidate = normalizeFieldName(candidate);
          const normalized = allFields.find((f) => normalizeFieldName(f.getName()) === normalizedCandidate);
          if (normalized && 'setText' in normalized) {
            (normalized as any).setText(value);
            fieldHandled = true;
            break;
          }
        } catch (e) {}
      }

      if (fieldHandled) return;

      const normalizedCandidates = new Set(candidates.map(normalizeFieldName));
      pdfDoc.getPages().forEach((page) => {
        const annots = page.node.Annots();
        if (!annots) return;

        annots.asArray().forEach((ref) => {
          const annot = pdfDoc.context.lookup(ref);
          if (!(annot instanceof PDFDict)) return;

          const title = annot.get(PDFName.of('T'));
          const contents = annot.get(PDFName.of('Contents'));
          let name = '';
          if (title instanceof PDFString || title instanceof PDFHexString) name = title.decodeText();
          if ((!name || name === 'ramboo') && (contents instanceof PDFString || contents instanceof PDFHexString)) name = contents.decodeText();

          if (name && normalizedCandidates.has(normalizeFieldName(name))) {
            annot.set(PDFName.of('Contents'), PDFString.of(value));
          }
        });
      });
    };

    // One day entry = one PDF file
    for (const { day, log } of exportEntries) {
      if (!log) continue;

      const monthTotalGasCost = (monthTotalKm / 100) * fuelConsumption * fuelPrice;

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
        total_km: `${monthTotalKm} km`,
        total_work: `${monthTotalWorkMinutes} min`,
        total_drive: `${monthTotalDriveMinutes} min`,
        total_gas_cost: `${monthTotalGasCost.toFixed(2)} €`,
        date_1: format(day, 'dd.MM.yyyy'),
        datum: format(day, 'dd.MM.yyyy'),
        foerderziel_1: log.foerderziel,
        foerderziel: log.foerderziel,
        forderziel: log.foerderziel,
        assistenzinhalt_1: log.assistenzinhalt,
        assistenzinhalt: log.assistenzinhalt,
        anmerkungreflexion_1: log.anmerkungReflexion,
        anmerkungreflexion: log.anmerkungReflexion,
        anmerkungenreflexion: log.anmerkungReflexion,
        startTime_1: log.startTime,
        endTime_1: log.endTime,
        zeitvb_1: `${log.startTime} - ${log.endTime}`,
        zeitvb: `${log.startTime} - ${log.endTime}`,
        zeitinmin_1: String(log.timeWithCustomerMinutes),
        zeitinmin: String(log.timeWithCustomerMinutes),
        anabfhart_von_1: log.anabfhart_from,
        anabfhart_von: log.anabfhart_from,
        anabfhart_bis_1: log.anabfhart_too,
        anabfhart_bis: log.anabfhart_too,
        anabfhart_from_1: log.anabfhart_from,
        anabfhart_too_1: log.anabfhart_too,
        traveltime_1: String(log.traveltime),
        km_1: String(log.km),
        anab_zeit_1: String(log.traveltime),
        anab_km_1: String(log.km),
        customer_anabfhart_from_1: log.customer_anabfhart_from,
        customer_anabfhart_too_1: log.customer_anabfhart_too,
        coustomer_traveltime_1: String(log.coustomer_traveltime),
        couistomer_km_1: String(log.couistomer_km),
        kdanabfhart_von_1: log.customer_anabfhart_from,
        kdanabfhart_von: log.customer_anabfhart_from,
        kdanabfhart_bis_1: log.customer_anabfhart_too,
        kdanabfhart_bis: log.customer_anabfhart_too,
        kdanab_zeit_1: String(log.coustomer_traveltime),
        kdanab_zeit: String(log.coustomer_traveltime),
        kdanab_km_1: String(log.couistomer_km),
        kdanab_km: String(log.couistomer_km),
      };

      try {
        const existingPdfBytes = await fetch(pdfTemplate.pdfBase64).then((res) => res.arrayBuffer());
        const pdfDoc = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });
        const form = pdfDoc.getForm();

        try {
          // @ts-ignore
          if (typeof form.updateFieldAppearances === 'function') {
            // @ts-ignore
            form.updateFieldAppearances();
          }
        } catch (e) {}

        pdfTemplate.fieldMappings.forEach((m) => {
          const value = resolveDataValue(m.dataSource, dataMap) ?? resolveDataValue(m.placeholder, dataMap) ?? '';
          setPdfFieldValue(pdfDoc, m.placeholder, value, form);
        });

        const rowData: Record<string, string> = {
          date_1: format(day, 'dd.MM.yyyy'),
          goal_1: log.foerderziel,
          content_1: log.assistenzinhalt,
          start_1: log.startTime,
          end_1: log.endTime,
          duration_1: String(log.timeWithCustomerMinutes || 0),
        };

        Object.entries(rowData).forEach(([fieldName, val]) => {
          setPdfFieldValue(pdfDoc, fieldName, val, form);
        });

        // Fallback autofill: if template still has placeholder-like field names, resolve by token.
        const autoTokens = new Set<string>();
        form.getFields().forEach((f) => autoTokens.add(f.getName()));
        pdfDoc.getPages().forEach((page) => {
          const annots = page.node.Annots();
          if (!annots) return;
          annots.asArray().forEach((ref) => {
            const annot = pdfDoc.context.lookup(ref);
            if (!(annot instanceof PDFDict)) return;
            const title = annot.get(PDFName.of('T'));
            const contents = annot.get(PDFName.of('Contents'));
            if (title instanceof PDFString || title instanceof PDFHexString) autoTokens.add(title.decodeText());
            if (contents instanceof PDFString || contents instanceof PDFHexString) autoTokens.add(contents.decodeText());
          });
        });

        autoTokens.forEach((token) => {
          const value = resolveDataValue(token, dataMap);
          if (value !== undefined) {
            setPdfFieldValue(pdfDoc, token, value, form);
          }
        });

        form.flatten();

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
        const link = document.createElement('a');
        const fileDate = format(day, 'yyyy-MM-dd');
        const objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
        link.download = `${customer.kunde}_${fileDate}.pdf`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } catch (err) {
        console.error('PDF-LIB error:', err);
        alert(`Failed to generate PDF for ${format(day, 'dd.MM.yyyy')}.`);
      }
    }
  };

  if (!customerId) return <div className="text-center p-12 bg-white rounded-xl border">Please select a customer to view logs.</div>;

  const monthLogCount = logs?.length || 0;

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
              <button onClick={() => generatePDF('selected')} className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-green-700 ml-2">
                <FileText size={18} /> Export Selected ({selectedDayStrings.length})
              </button>
              <button onClick={() => generatePDF('month')} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-blue-700">
                <FileText size={18} /> Export Month ({monthLogCount})
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
  const activePdfTemplateId = useLiveQuery(() => db.settings.get('activePdfTemplateId'));
  const pdfTemplates = useLiveQuery(() => db.pdfTemplates.toArray()) || [];

  const [consumption, setConsumption] = useState('');
  const [price, setPrice] = useState('');
  const [selectedPdfTemplateId, setSelectedPdfTemplateId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (fuelConsumption) setConsumption(String(fuelConsumption.value));
    if (fuelPrice) setPrice(String(fuelPrice.value));
    if (activePdfTemplateId) setSelectedPdfTemplateId(activePdfTemplateId.value);
  }, [fuelConsumption, fuelPrice, activePdfTemplateId]);

  const handleSave = async () => {
    await db.settings.put({ key: 'fuelConsumption', value: Number(consumption) });
    await db.settings.put({ key: 'fuelPrice', value: Number(price) });
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Active PDF Template</label>
              <select
                className="w-full border rounded p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                value={selectedPdfTemplateId || ''}
                onChange={(e) => setSelectedPdfTemplateId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">Select a template...</option>
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
          annots.asArray().forEach((annotRef) => {
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
