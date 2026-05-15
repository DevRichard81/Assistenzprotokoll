import React, { useState, useEffect } from 'react';
import { PDFDocument, PDFDict, PDFName, PDFString, PDFHexString, PDFBool, PDFTextField } from 'pdf-lib';
import { db, type Customer, type DailyLog } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { Plus, Trash2, Save, FileText, BarChart, History, User, Calendar, Settings, Download, Search, RefreshCw } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Dialog from './components/Dialog';
import PWAManager from './components/PWAManager';
import PDFTemplatesView from './components/PDFTemplatesView';

// --- Types ---
type View = 'customers' | 'logs' | 'stats' | 'history' | 'settings' | 'pdfTemplates';
type ViewMode = 'auto' | 'desktop' | 'mobile';

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
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem('uiMode') as ViewMode) || 'auto';
    } catch {
      return 'auto';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('uiMode', viewMode);
    } catch {
      // ignore storage failures
    }

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
  }, [viewMode]);

  const customers = useLiveQuery(() => db.customers.toArray());
  const isMobileLayout = viewMode === 'mobile';
  return (
    <div className={`min-h-screen bg-gray-50 ${isMobileLayout ? 'flex flex-col' : 'flex'}`}>
      <PWAManager />
      {/* Sidebar */}
      <aside className={`${isMobileLayout ? 'w-full border-b' : 'w-64 border-r'} bg-white flex flex-col`}>
        <div className="p-6">
          <h1 className="text-xl font-bold text-blue-600">Assistenz Manager</h1>
        </div>
        <nav className={`flex-1 ${isMobileLayout ? 'flex gap-2 overflow-x-auto px-3 pb-3' : 'px-4 space-y-2'}`}>
          <NavItem compact={isMobileLayout} icon={<Calendar />} label="Daily Logs" active={activeView === 'logs'} onClick={() => setActiveView('logs')} />
          <NavItem compact={isMobileLayout} icon={<User />} label="Customers" active={activeView === 'customers'} onClick={() => setActiveView('customers')} />
          <NavItem compact={isMobileLayout} icon={<BarChart />} label="Statistics" active={activeView === 'stats'} onClick={() => setActiveView('stats')} />
          <NavItem compact={isMobileLayout} icon={<History />} label="Change Log" active={activeView === 'history'} onClick={() => setActiveView('history')} />
          <NavItem compact={isMobileLayout} icon={<Settings />} label="Settings" active={activeView === 'settings'} onClick={() => setActiveView('settings')} />
        </nav>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 overflow-auto ${isMobileLayout ? 'p-4' : 'p-8'}`}>
        <header className={`mb-8 flex ${isMobileLayout ? 'flex-col gap-4' : 'justify-between items-center'}`}>
          <div>
            <h2 className="text-2xl font-bold text-gray-800 capitalize">{activeView.replace('-', ' ')}</h2>
            <p className="text-gray-500">Manage your assistance protocols and customer data.</p>
          </div>
          <div className={`flex gap-4 ${isMobileLayout ? 'flex-col' : 'items-center'}`}>
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
              <div className="inline-flex items-center gap-2 rounded-lg bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('auto')}
                  className={`rounded-md px-3 py-1 text-sm transition ${viewMode === 'auto' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('desktop')}
                  className={`rounded-md px-3 py-1 text-sm transition ${viewMode === 'desktop' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('mobile')}
                  className={`rounded-md px-3 py-1 text-sm transition ${viewMode === 'mobile' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  Mobile
                </button>
              </div>
          </div>
        </header>

        {activeView === 'customers' && <CustomerView />}
        {activeView === 'logs' && <LogsView customerId={selectedCustomerId} month={selectedMonth} />}
        {activeView === 'stats' && <StatsView month={selectedMonth} />}
        {activeView === 'history' && <HistoryView />}
        {activeView === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, compact }: { icon: any, label: string, active: boolean, onClick: () => void, compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`${compact ? 'min-w-max flex-shrink-0 px-3 py-2' : 'w-full px-4 py-2'} flex items-center gap-3 rounded-lg transition-colors ${
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

  const pdfTemplates = useLiveQuery(() => db.pdfTemplates.toArray()) || [];
  const [selectedPdfTemplateId, setSelectedPdfTemplateId] = useState<number | undefined>(undefined);
  const activePdfSetting = useLiveQuery(() => db.settings.get('activePdfTemplateId'));

  useEffect(() => {
    if (activePdfSetting && !selectedPdfTemplateId) {
      setSelectedPdfTemplateId(activePdfSetting.value);
    }
  }, [activePdfSetting]);

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

    let pdfTemplate;
    if (selectedPdfTemplateId) {
      pdfTemplate = await db.pdfTemplates.get(selectedPdfTemplateId);
    } else {
      const activePdfTemplateSetting = await db.settings.get('activePdfTemplateId');
      const pdfTemplateId = activePdfTemplateSetting?.value;
      pdfTemplate = pdfTemplateId ? await db.pdfTemplates.get(pdfTemplateId) : null;
    }

    if (!pdfTemplate) {
      alert('Please select an active PDF template before exporting.');
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

    // Add mappings for _2 fields in aliasToDataKey
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
      datum_2: 'date_2',
      forderziel_2: 'foerderziel_2',
      foerderziel_2: 'foerderziel_2',
      assistenzinhalt_2: 'assistenzinhalt_2',
      anmerkungreflexion_2: 'anmerkungreflexion_2',
      zeitvb_2: 'zeitvb_2',
      zeitvonbis_2: 'zeitvb_2',
      zeitinmin_2: 'zeitinmin_2',
      anabfhartvon_2: 'anabfhart_von_2',
      anabfhartbis_2: 'anabfhart_bis_2',
      anabfahrtvon_2: 'anabfhart_von_2',
      anabfahrtbis_2: 'anabfhart_bis_2',
      anabzeit_2: 'anab_zeit_2',
      anabkm_2: 'anab_km_2',
      kdanabfhartvon_2: 'kdanabfhart_von_2',
      kdanabfhartbis_2: 'kdanabfhart_bis_2',
      kdanabfahrtvon_2: 'kdanabfhart_von_2',
      kdanabfahrtbis_2: 'kdanabfhart_bis_2',
      kdanabzeit_2: 'kdanab_zeit_2',
      kdanabkm_2: 'kdanab_km_2',
    };

    const resolveDataValue = (token: string, dataMap: Record<string, string>, allowAlias = true) => {
      if (!token) return undefined;
      if (Object.prototype.hasOwnProperty.call(dataMap, token)) return dataMap[token];

      const clean = token.replaceAll('{{', '').replaceAll('}}', '').trim();
      if (Object.prototype.hasOwnProperty.call(dataMap, clean)) return dataMap[clean];

      const normalizedToken = normalizeFieldName(clean);
      const normalizedDataEntry = Object.entries(dataMap).find(([key]) => normalizeFieldName(key) === normalizedToken);
      if (normalizedDataEntry) return normalizedDataEntry[1];

      if (allowAlias) {
        const aliasKey = aliasToDataKey[normalizedToken];
        if (aliasKey && Object.prototype.hasOwnProperty.call(dataMap, aliasKey)) return dataMap[aliasKey];
      }

      return undefined;
    };

    const setPdfFieldValue = (
      pdfDoc: PDFDocument,
      fieldToken: string,
      value: string,
      form: ReturnType<PDFDocument['getForm']>
    ) => {
      const clean = fieldToken.replaceAll('{{', '').replaceAll('}}', '').trim();
      const isMustacheToken = fieldToken.includes('{{') && fieldToken.includes('}}');
      const candidates = Array.from(new Set([
        fieldToken,
        clean,
        `{{${clean}}}`,
      ])).filter(Boolean);
      const candidateLower = new Set(candidates.map((c) => c.trim().toLowerCase()));

      const allFields = form.getFields();
      let fieldHandled = false;

      for (const candidate of candidates) {
        try {
          const exact = allFields.find((f) => f.getName() === candidate);
          if (exact && 'setText' in exact) {
            if (exact instanceof PDFTextField) {
              exact.enableMultiline();
              exact.setFontSize(10);
            }
            (exact as any).setText(value);
            fieldHandled = true;
            break;
          }
        } catch (e) {}

        try {
          const normalizedCandidate = normalizeFieldName(candidate);
          const normalized = allFields.find((f) => normalizeFieldName(f.getName()) === normalizedCandidate);
          if (normalized && 'setText' in normalized) {
            if (normalized instanceof PDFTextField) {
              normalized.enableMultiline();
              normalized.setFontSize(10);
            }
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

          if (!name) return;

          const nameTrimmed = name.trim();
          const isLabelLike = /[A-Za-zÄÖÜäöüß\s]+:$/.test(nameTrimmed);
          // Avoid replacing static labels like "Jahr:" when token is a placeholder key like {{jahr}}.
          if (isMustacheToken && isLabelLike) return;

          const hasExactOrBracedMatch = candidateLower.has(nameTrimmed.toLowerCase());
          const hasNormalizedMatch = normalizedCandidates.has(normalizeFieldName(nameTrimmed));
          if (hasExactOrBracedMatch || hasNormalizedMatch) {
            annot.set(PDFName.of('Contents'), PDFString.of(value));
            annot.set(PDFName.of('RC'), PDFString.of(value));
            annot.set(PDFName.of('V'), PDFString.of(value));
            annot.set(PDFName.of('DV'), PDFString.of(value));
            annot.delete(PDFName.of('AP'));
          }
        });
      });
    };

    const replacePlaceholdersInText = (text: string, dataMap: Record<string, string>) => {
      return text.replace(/\{\{\s*([^}]+?)\s*}}/g, (full, rawToken) => {
        const resolved = resolveDataValue(rawToken, dataMap);
        return resolved !== undefined ? resolved : full;
      });
    };

    const entryGroups: typeof exportEntries[] = [];
    if (pdfTemplate.type === 'double_entry') {
      for (let i = 0; i < exportEntries.length; i += 2) {
        entryGroups.push(exportEntries.slice(i, i + 2));
      }
    } else {
      exportEntries.forEach((e) => entryGroups.push([e]));
    }

    // Process each group (one group = one PDF file)
    for (const group of entryGroups) {
      const firstEntry = group[0];
      const { day, log } = firstEntry;
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
      };

      // Add data for each entry in the group
      group.forEach((entry, idx) => {
        const sfx = `_${idx + 1}`;
        const l = entry.log!;
        const d = entry.day;

        const entryData = {
          [`date${sfx}`]: format(d, 'dd.MM.yyyy'),
          [`datum${sfx}`]: format(d, 'dd.MM.yyyy'),
          [`foerderziel${sfx}`]: l.foerderziel,
          [`forderziel${sfx}`]: l.foerderziel,
          [`assistenzinhalt${sfx}`]: l.assistenzinhalt,
          [`anmerkungreflexion${sfx}`]: l.anmerkungReflexion,
          [`anmerkungenreflexion${sfx}`]: l.anmerkungReflexion,
          [`startTime${sfx}`]: l.startTime,
          [`endTime${sfx}`]: l.endTime,
          [`zeitvb${sfx}`]: `${l.startTime} - ${l.endTime}`,
          [`zeitinmin${sfx}`]: String(l.timeWithCustomerMinutes),
          [`anabfhart_von${sfx}`]: l.anabfhart_from,
          [`anabfhart_von`]: l.anabfhart_from,
          [`anabfhart_bis${sfx}`]: l.anabfhart_too,
          [`anabfhart_bis`]: l.anabfhart_too,
          [`anabfhart_from${sfx}`]: l.anabfhart_from,
          [`anabfhart_too${sfx}`]: l.anabfhart_too,
          [`traveltime${sfx}`]: String(l.traveltime),
          [`km${sfx}`]: String(l.km),
          [`anab_zeit${sfx}`]: String(l.traveltime),
          [`anab_km${sfx}`]: String(l.km),
          [`customer_anabfhart_from${sfx}`]: l.customer_anabfhart_from,
          [`customer_anabfhart_too${sfx}`]: l.customer_anabfhart_too,
          [`coustomer_traveltime${sfx}`]: String(l.coustomer_traveltime),
          [`couistomer_km${sfx}`]: String(l.couistomer_km),
        };

        Object.assign(dataMap, entryData);

        if (idx === 0) {
          // Backward compatibility for single-entry templates
          dataMap['date_1'] = entryData.date_1;
          dataMap['datum'] = entryData.datum_1;
          dataMap['foerderziel_1'] = entryData.foerderziel_1;
          dataMap['foerderziel'] = entryData.foerderziel_1;
          dataMap['forderziel'] = entryData.foerderziel_1;
          dataMap['assistenzinhalt_1'] = entryData.assistenzinhalt_1;
          dataMap['assistenzinhalt'] = entryData.assistenzinhalt_1;
          dataMap['anmerkungreflexion_1'] = entryData.anmerkungreflexion_1;
          dataMap['anmerkungreflexion'] = entryData.anmerkungreflexion_1;
          dataMap['anmerkungenreflexion'] = entryData.anmerkungreflexion_1;
          dataMap['startTime_1'] = entryData.startTime_1;
          dataMap['endTime_1'] = entryData.endTime_1;
          dataMap['zeitvb_1'] = entryData.zeitvb_1;
          dataMap['zeitvb'] = entryData.zeitvb_1;
          dataMap['zeitinmin_1'] = entryData.zeitinmin_1;
          dataMap['zeitinmin'] = entryData.zeitinmin_1;
          dataMap['anabfhart_von_1'] = entryData.anabfhart_von_1;
          dataMap['anabfhart_bis_1'] = entryData.anabfhart_bis_1;
          dataMap['anabfhart_from_1'] = entryData.anabfhart_from_1;
          dataMap['anabfhart_too_1'] = entryData.anabfhart_too_1;
          dataMap['traveltime_1'] = entryData.traveltime_1;
          dataMap['km_1'] = entryData.km_1;
          dataMap['anab_zeit_1'] = entryData.anab_zeit_1;
          dataMap['anab_km_1'] = entryData.anab_km_1;
          dataMap['customer_anabfhart_from_1'] = entryData.customer_anabfhart_from_1;
          dataMap['customer_anabfhart_too_1'] = entryData.customer_anabfhart_too_1;
          dataMap['coustomer_traveltime_1'] = entryData.coustomer_traveltime_1;
          dataMap['couistomer_km_1'] = entryData.couistomer_km_1;
          dataMap['kdanabfhart_von_1'] = entryData.kdanabfhart_von_1;
          dataMap['kdanabfhart_bis_1'] = entryData.kdanabfhart_bis_1;
          dataMap['kdanab_zeit_1'] = entryData.kdanab_zeit_1;
          dataMap['kdanab_km_1'] = entryData.kdanab_km_1;
        } else if (idx === 1) {
          dataMap['date_2'] = entryData.date_2;
          dataMap['datum_2'] = entryData.datum_2;
          dataMap['foerderziel_2'] = entryData.foerderziel_2;
          dataMap['assistenzinhalt_2'] = entryData.assistenzinhalt_2;
          dataMap['anmerkungreflexion_2'] = entryData.anmerkungreflexion_2;
          dataMap['zeitvb_2'] = entryData.zeitvb_2;
          dataMap['zeitvonbis_2'] = entryData.zeitvonbis_2;
          dataMap['zeitinmin_2'] = entryData.zeitinmin_2;
          dataMap['anabfhartvon_2'] = entryData.anabfhartvon_2;
          dataMap['anabfhartbis_2'] = entryData.anabfhartbis_2;
          dataMap['anabfahrtvon_2'] = entryData.anabfhartvon_2;
          dataMap['anabfahrtbis_2'] = entryData.anabfhartbis_2;
          dataMap['anab_zeit_2'] = entryData.anab_zeit_2;
          dataMap['anab_km_2'] = entryData.anab_km_2;
          dataMap['customer_anabfhart_from_2'] = entryData.customer_anabfhart_from_2;
          dataMap['customer_anabfhart_too_2'] = entryData.customer_anabfhart_too_2;
          dataMap['coustomer_traveltime_2'] = entryData.coustomer_traveltime_2;
          dataMap['couistomer_km_2'] = entryData.couistomer_km_2;
          dataMap['kdanabfhart_von_2'] = entryData.kdanabfhart_von_2;
          dataMap['kdanabfhart_bis_2'] = entryData.kdanabfhart_bis_2;
          dataMap['kdanab_zeit_2'] = entryData.kdanab_zeit_2;
          dataMap['kdanab_km_2'] = entryData.kdanab_km_2;
        }
      });

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
            if (title instanceof PDFString || title instanceof PDFHexString) autoTokens.add(title.decodeText());
          });
        });

        autoTokens.forEach((token) => {
          const trimmedToken = token.trim();
          // Do not treat static labels (e.g. "Jahr:") as data placeholders.
          if (/^[A-Za-zÄÖÜäöüß\s]+:$/.test(trimmedToken)) return;

          const value = resolveDataValue(trimmedToken, dataMap, false);
          if (value !== undefined) {
            setPdfFieldValue(pdfDoc, trimmedToken, value, form);
          }
        });

        // Replace inline placeholder text inside annotation content, e.g. "Kunde/in: {{kunde}}".
        pdfDoc.getPages().forEach((page) => {
          const annots = page.node.Annots();
          if (!annots) return;

          annots.asArray().forEach((ref) => {
            const annot = pdfDoc.context.lookup(ref);
            if (!(annot instanceof PDFDict)) return;

            const contents = annot.get(PDFName.of('Contents'));
            if (!(contents instanceof PDFString || contents instanceof PDFHexString)) return;

            const oldText = contents.decodeText();
            const newText = replacePlaceholdersInText(oldText, dataMap);
            if (newText === oldText) return;

            annot.set(PDFName.of('Contents'), PDFString.of(newText));
            annot.set(PDFName.of('RC'), PDFString.of(newText));
            annot.set(PDFName.of('V'), PDFString.of(newText));
            annot.set(PDFName.of('DV'), PDFString.of(newText));
            annot.delete(PDFName.of('AP'));
          });
        });

        // Ask viewers to regenerate appearances from updated values.
        const acroForm = pdfDoc.catalog.get(PDFName.of('AcroForm'));
        if (acroForm instanceof PDFDict) {
          acroForm.set(PDFName.of('NeedAppearances'), PDFBool.True);
        }

        form.flatten();

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
        const link = document.createElement('a');
        const fileDate = group.length > 1 
          ? `${format(group[0].day, 'yyyy-MM-dd')}_to_${format(group[group.length - 1].day, 'yyyy-MM-dd')}`
          : format(group[0].day, 'yyyy-MM-dd');
        const objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
        link.download = `${customer.kunde}_${fileDate}.pdf`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } catch (err) {
        console.error('PDF-LIB error:', err);
        const errorDate = group.length > 1 
          ? `${format(group[0].day, 'dd.MM.yyyy')} - ${format(group[group.length - 1].day, 'dd.MM.yyyy')}`
          : format(group[0].day, 'dd.MM.yyyy');
        alert(`Failed to generate PDF for ${errorDate}.`);
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
        <div className="p-4 border-b flex flex-col gap-3 md:flex-row md:justify-between md:items-center bg-gray-50">
           <h3 className="font-bold">Protocol for {customer?.kunde} ({month})</h3>
            <div className="flex flex-wrap gap-2 items-center md:justify-end">
              <div className="flex gap-2 mr-0 md:mr-4">
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
             </div>
             
             <select 
               className="border rounded px-2 py-1.5 bg-white text-sm text-gray-900 focus:border-blue-500 outline-none"
               value={selectedPdfTemplateId || ''}
               onChange={(e) => setSelectedPdfTemplateId(e.target.value ? Number(e.target.value) : undefined)}
             >
               <option value="">Select PDF Template...</option>
               {pdfTemplates.map(t => (
                 <option key={t.id} value={t.id}>
                   {t.name} ({t.type === 'double_entry' ? '2 Entries' : '1 Entry'})
                 </option>
               ))}
             </select>

              <button onClick={() => generatePDF('selected')} className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-green-700 ml-2 shadow-sm transition">
                <FileText size={18} /> Export Selected ({selectedDayStrings.length})
              </button>
              <button onClick={() => generatePDF('month')} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-blue-700 shadow-sm transition">
                <FileText size={18} /> Export Month ({monthLogCount})
             </button>
           </div>
        </div>
        <div className="overflow-x-auto">
        <table className="min-w-[800px] w-full text-left border-collapse">
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
    </div>
  );
}

function LogEditModal({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData, 
  dateStr,
  defaults 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSave: (d: Partial<DailyLog>) => void, 
  initialData: Partial<DailyLog>,
  dateStr: string,
  defaults?: Customer
}) {
  const [data, setData] = useState<Partial<DailyLog>>(initialData);

  useEffect(() => {
    setData(initialData);
  }, [initialData, isOpen]);

  const calculateDuration = (start: string, end: string) => {
    if (!start || !end) return;
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;
    let diff = endTotal - startTotal;
    if (diff < 0) diff += 24 * 60;
    setData(prev => ({ ...prev, timeWithCustomerMinutes: diff }));
  };

  const handleApplyDefaults = () => {
    const defaultStart = '08:00';
    const defaultEnd = '16:00';
    const newData = {
      ...data,
      startTime: defaultStart,
      endTime: defaultEnd,
      anabfhart_from: defaults?.anfahrtFrom || '',
      anabfhart_too: defaults?.abfahrtTo || '',
      traveltime: defaults?.driveTimeMinutes || 0,
      km: defaults?.km || 0,
    };
    setData(newData);
    calculateDuration(defaultStart, defaultEnd);
  };

  if (!isOpen) return null;

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={`Edit Log Entry - ${dateStr}`}>
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            onClick={handleApplyDefaults}
            className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded-md hover:bg-blue-100 border border-blue-200"
          >
            Apply Customer Defaults
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4 className="font-semibold text-blue-700 border-b pb-1">Work Content</h4>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Förderziel</label>
              <textarea
                className="w-full border rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Förderziel"
                value={data.foerderziel || ''}
                onChange={e => setData({...data, foerderziel: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assistenzinhalt</label>
              <textarea
                className="w-full border rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500"
                rows={6}
                placeholder="Assistenzinhalt"
                value={data.assistenzinhalt || ''}
                onChange={e => setData({...data, assistenzinhalt: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Anmerkung/Reflexion</label>
              <textarea
                className="w-full border rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Anmerkung/Reflexion"
                value={data.anmerkungReflexion || ''}
                onChange={e => setData({...data, anmerkungReflexion: e.target.value})}
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <h4 className="font-semibold text-blue-700 border-b pb-1">Time & Duration</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                  <input
                    type="time"
                    className="w-full border rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500"
                    value={data.startTime || ''}
                    onChange={e => {
                      const newStart = e.target.value;
                      setData({...data, startTime: newStart});
                      if (data.endTime) calculateDuration(newStart, data.endTime);
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
                  <input
                    type="time"
                    className="w-full border rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500"
                    value={data.endTime || ''}
                    onChange={e => {
                      const newEnd = e.target.value;
                      setData({...data, endTime: newEnd});
                      if (data.startTime) calculateDuration(data.startTime, newEnd);
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
                  <input
                    type="number"
                    className="w-full border rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500"
                    value={data.timeWithCustomerMinutes || 0}
                    onChange={e => setData({...data, timeWithCustomerMinutes: Number(e.target.value)})}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-blue-700 border-b pb-1">Assistant Travel (An/Abfahrt)</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                  <input type="text" className="w-full border rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500" value={data.anabfhart_from || ''} onChange={e => setData({...data, anabfhart_from: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                  <input type="text" className="w-full border rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500" value={data.anabfhart_too || ''} onChange={e => setData({...data, anabfhart_too: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time (min)</label>
                  <input type="number" className="w-full border rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500" value={data.traveltime || 0} onChange={e => setData({...data, traveltime: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Distance (km)</label>
                  <input type="number" className="w-full border rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500" value={data.km || 0} onChange={e => setData({...data, km: Number(e.target.value)})} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-blue-700 border-b pb-1">Customer Travel (An/Abfahrt Kunde)</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                  <input type="text" className="w-full border rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500" value={data.customer_anabfhart_from || ''} onChange={e => setData({...data, customer_anabfhart_from: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                  <input type="text" className="w-full border rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500" value={data.customer_anabfhart_too || ''} onChange={e => setData({...data, customer_anabfhart_too: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time (min)</label>
                  <input type="number" className="w-full border rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500" value={data.coustomer_traveltime || 0} onChange={e => setData({...data, coustomer_traveltime: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Distance (km)</label>
                  <input type="number" className="w-full border rounded-lg p-2 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500" value={data.couistomer_km || 0} onChange={e => setData({...data, couistomer_km: Number(e.target.value)})} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <button
            onClick={onClose} 
            className="px-6 py-2 border rounded-lg text-gray-700 hover:bg-gray-100 font-medium"
          >
            Cancel
          </button>
          <button 
            onClick={() => { onSave(data); onClose(); }} 
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium"
          >
            <Save size={18} /> Save Entry
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function LogRow({ day, log, isSelected, onToggle, onSave, defaults }: { day: Date, log?: DailyLog, isSelected: boolean, onToggle: () => void, onSave: (d: Partial<DailyLog>) => void, defaults?: Customer }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

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
      <td className="p-3 text-gray-900 text-xs">
        <div className="font-bold">{log?.foerderziel || '-'}</div>
        <div className="text-gray-500 italic">{log?.anmerkungReflexion || '-'}</div>
      </td>
      <td className="p-3 text-gray-900 text-xs whitespace-pre-wrap line-clamp-2 hover:line-clamp-none transition-all cursor-help">{log?.assistenzinhalt || '-'}</td>
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
          <button onClick={() => setIsModalOpen(true)} className="text-blue-600 text-sm hover:underline mr-2">Edit</button>
          <LogEditModal 
            isOpen={isModalOpen} 
            onClose={() => setIsModalOpen(false)} 
            onSave={onSave} 
            initialData={log || {}} 
            dateStr={format(day, 'dd.MM.yyyy')}
            defaults={defaults}
          />
      </td>
    </tr>
  );
}

function StatsView({ month }: { month: string }) {
  const allLogs = useLiveQuery(
    () => db.logs.filter(l => l.date.startsWith(month)).toArray(),
    [month]
  );
  const customers = useLiveQuery(() => db.customers.toArray());
  const gasolineSettings = useLiveQuery(() => db.settings.get('gasoline'));

  if (!customers || !allLogs) return <div className="p-12 text-center text-gray-500">Loading statistics...</div>;

  const consumption = Number(gasolineSettings?.value?.consumption) || 0;
  const price = Number(gasolineSettings?.value?.price) || 0;

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
                      <p className="text-xs text-gray-500 font-bold">{formatTime(s.totalMinutes)}</p>
                    </td>
                    <td className="p-4 text-right">
                      <p className="font-bold text-orange-600">{s.totalDriveTime} m</p>
                      <p className="text-xs text-gray-500 font-bold">{formatTime(s.totalDriveTime)}</p>
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
  const [activeTab, setActiveTab] = useState<'general' | 'templates' | 'backup'>('general');
  const gasolineSetting = useLiveQuery(() => db.settings.get('gasoline'));
  const [consumption, setConsumption] = useState('');
  const [price, setPrice] = useState('');
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  useEffect(() => {
    if (gasolineSetting) {
      setConsumption(String(gasolineSetting.value?.consumption ?? ''));
      setPrice(String(gasolineSetting.value?.price ?? ''));
    }
  }, [gasolineSetting]);

  const handleSave = async () => {
    await db.settings.put({ key: 'gasoline', value: { consumption: Number(consumption), price: Number(price) } });
    alert('Settings saved!');
  };

  const handleBackup = async () => {
    try {
      const [customers, logs, settings, pdfTemplatesData, auditTrail] = await Promise.all([
        db.customers.toArray(),
        db.logs.toArray(),
        db.settings.toArray(),
        db.pdfTemplates.toArray(),
        db.auditTrail.toArray(),
      ]);

      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        customers,
        logs,
        settings,
        pdfTemplates: pdfTemplatesData,
        auditTrail,
      };

      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `assistenz_backup_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error(err);
      alert('Backup failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!confirm('This will REPLACE all existing data with the backup. Are you sure?')) return;

    setRestoreStatus('Restoring...');
    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup.version || !backup.customers || !backup.logs) {
        setRestoreStatus('❌ Restore failed: Invalid backup file format.');
        return;
      }

      await db.transaction('rw', [db.customers, db.logs, db.settings, db.pdfTemplates, db.auditTrail], async () => {
        await db.customers.clear();
        await db.logs.clear();
        await db.settings.clear();
        await db.pdfTemplates.clear();
        await db.auditTrail.clear();

        if (backup.customers?.length) await db.customers.bulkAdd(backup.customers);
        if (backup.logs?.length) await db.logs.bulkAdd(backup.logs);
        if (backup.settings?.length) await db.settings.bulkAdd(backup.settings);
        if (backup.pdfTemplates?.length) await db.pdfTemplates.bulkAdd(backup.pdfTemplates);
        if (backup.auditTrail?.length) await db.auditTrail.bulkAdd(backup.auditTrail);
      });

      setRestoreStatus(`✅ Restored successfully from ${backup.exportedAt ? new Date(backup.exportedAt).toLocaleString() : 'backup'}.`);
    } catch (err) {
      console.error(err);
      setRestoreStatus('❌ Restore failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-6 py-3 font-bold text-sm transition-colors border-b-2 ${activeTab === 'general' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          General
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-6 py-3 font-bold text-sm transition-colors border-b-2 ${activeTab === 'templates' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          PDF Templates
        </button>
        <button
          onClick={() => setActiveTab('backup')}
          className={`px-6 py-3 font-bold text-sm transition-colors border-b-2 ${activeTab === 'backup' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Backup & Restore
        </button>
      </div>

      <div className="animate-in fade-in duration-300">
        {activeTab === 'general' && (
          <div className="max-w-md mx-auto bg-white p-8 rounded-xl border shadow-sm">
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
              <button 
                onClick={handleSave} 
                className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors mt-4"
              >
                <Save size={20} /> Save Configuration
              </button>
            </div>
          </div>
        )}

        {activeTab === 'templates' && <PDFTemplatesView />}

        {activeTab === 'backup' && (
          <div className="max-w-md mx-auto bg-white p-8 rounded-xl border shadow-sm">
            <h3 className="text-xl font-bold mb-2 text-gray-900 flex items-center gap-2">
              <Download size={24} className="text-gray-400" />
              Backup &amp; Restore
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              Save a full backup of all data (customers, daily logs, PDF templates, settings, change log) to a JSON file, or restore from a previous backup.
            </p>

            <div className="space-y-3">
              <button
                onClick={handleBackup}
                className="w-full bg-green-600 text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-green-700 transition-colors"
              >
                <Download size={20} /> Download Backup (.json)
              </button>

              <label className="w-full bg-orange-500 text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-orange-600 transition-colors cursor-pointer">
                <RefreshCw size={20} /> Restore from Backup
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleRestore}
                />
              </label>

              {restoreStatus && (
                <div className={`text-sm p-3 rounded-lg ${restoreStatus.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200' : restoreStatus === 'Restoring...' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {restoreStatus}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Components ---

// --- Components ---

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
