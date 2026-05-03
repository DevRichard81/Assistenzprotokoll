import React, { useState, useEffect } from 'react';
import { db, type Customer, type DailyLog, type Template, type TemplateField } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { Plus, Trash2, Save, FileText, BarChart, History, User, Calendar, Settings, Palette, Move } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- Types ---
type View = 'customers' | 'logs' | 'stats' | 'history' | 'settings' | 'templates';

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
        if (count === 0) {
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

          await db.templates.bulkAdd([
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
            const first = await db.templates.toCollection().first();
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
      startTime: data.startTime || '',
      endTime: data.endTime || '',
      timeWithCustomerMinutes: Number(data.timeWithCustomerMinutes) || 0,
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
    
    // Get active template
    const activeTemplateSetting = await db.settings.get('activeTemplateId');
    const templateId = activeTemplateSetting?.value;
    const template = templateId ? await db.templates.get(templateId) : null;
    
    const doc = new jsPDF();
    const primaryColor = template?.primaryColor || '#c8c8c8';
    const defaultFontSize = template?.fontSize || 8;

    if (template?.fields) {
      template.fields.filter(f => f.visible).forEach(field => {
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
            switch(field.id) {
              case 'dienstleistung': value = customer.dienstleistung; break;
              case 'kunde': value = customer.kunde; break;
              case 'assistent': value = customer.assistent; break;
              case 'adresse': value = customer.adresse; break;
              case 'anfahrtFrom': value = customer.anfahrtFrom; break;
              case 'abfahrtTo': value = customer.abfahrtTo; break;
              case 'driveTimeMinutes': value = `${customer.driveTimeMinutes} min`; break;
              case 'km': value = `${customer.km} km`; break;
              case 'month': value = month; break;
              case 'title': value = field.content || template.title || 'ASSISTENZPROTOKOLL'; break;
              default: value = '';
            }
          }
          
          if (field.id === 'title') {
             doc.text(value, field.x, field.y, { align: 'center' });
          } else {
             doc.text(field.type === 'static' ? value : `${field.label}: ${value}`, field.x, field.y);
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
      headStyles: { fillColor: primaryColor as any, textColor: 0 },
      styles: { fontSize: defaultFontSize }
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
              <th className="p-3 border-b">Förderziel</th>
              <th className="p-3 border-b">Assistenzinhalt</th>
              <th className="p-3 border-b">Start</th>
              <th className="p-3 border-b">End</th>
              <th className="p-3 border-b">Time (min)</th>
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
          <td className="p-1"><input type="text" className="border rounded p-1 w-full bg-white text-gray-900" value={data.foerderziel || ''} onChange={e => setData({...data, foerderziel: e.target.value})} /></td>
          <td className="p-1"><input type="text" className="border rounded p-1 w-full bg-white text-gray-900" value={data.assistenzinhalt || ''} onChange={e => setData({...data, assistenzinhalt: e.target.value})} /></td>
          <td className="p-1">
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
          </td>
          <td className="p-1">
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
          </td>
          <td className="p-1"><input type="number" className="border rounded p-1 w-24 bg-white text-gray-900" value={data.timeWithCustomerMinutes || 0} onChange={e => setData({...data, timeWithCustomerMinutes: Number(e.target.value)})} /></td>
          <td className="p-3 text-right flex justify-end gap-1">
            <button onClick={() => { onSave(data); setIsEditing(false); }} className="text-green-600 p-1"><Save size={18} /></button>
            <button onClick={() => setIsEditing(false)} className="text-gray-400 p-1">X</button>
          </td>
        </>
      ) : (
        <>
          <td className="p-3 truncate max-w-[150px] text-gray-900">{log?.foerderziel || '-'}</td>
          <td className="p-3 truncate max-w-[200px] text-gray-900">{log?.assistenzinhalt || '-'}</td>
          <td className="p-3 text-gray-900">{log?.startTime || '-'}</td>
          <td className="p-3 text-gray-900">{log?.endTime || '-'}</td>
          <td className="p-3 text-gray-900">{log?.timeWithCustomerMinutes || 0}m</td>
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
  const templates = useLiveQuery(() => db.templates.toArray()) || [];

  const [consumption, setConsumption] = useState('');
  const [price, setPrice] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (fuelConsumption) setConsumption(String(fuelConsumption.value));
    if (fuelPrice) setPrice(String(fuelPrice.value));
    if (activeTemplateId) setSelectedTemplateId(activeTemplateId.value);
  }, [fuelConsumption, fuelPrice, activeTemplateId]);

  const handleSave = async () => {
    await db.settings.put({ key: 'fuelConsumption', value: Number(consumption) });
    await db.settings.put({ key: 'fuelPrice', value: Number(price) });
    if (selectedTemplateId) {
      await db.settings.put({ key: 'activeTemplateId', value: Number(selectedTemplateId) });
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

function TemplatesView() {
  const templates = useLiveQuery(() => db.templates.toArray()) || [];
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const initialFields: TemplateField[] = [
    { id: 'title', label: 'Protokoll Titel', x: 105, y: 20, visible: true, type: 'static', content: 'ASSISTENZPROTOKOLL', fontSize: 18, fontStyle: 'bold', color: '#000000', width: 210 },
    { id: 'dienstleistung', label: 'Dienstleistung', x: 14, y: 30, visible: true, type: 'data', color: '#000000' },
    { id: 'kunde', label: 'Kunde', x: 14, y: 35, visible: true, type: 'data', color: '#000000' },
    { id: 'assistent', label: 'Assistent', x: 14, y: 40, visible: true, type: 'data', color: '#000000' },
    { id: 'adresse', label: 'Adresse', x: 14, y: 45, visible: true, type: 'data', color: '#000000' },
    { id: 'anfahrtFrom', label: 'Anfahrt von', x: 14, y: 50, visible: false, type: 'data', color: '#000000' },
    { id: 'abfahrtTo', label: 'Abfahrt zu', x: 14, y: 55, visible: false, type: 'data', color: '#000000' },
    { id: 'driveTimeMinutes', label: 'Fahrtzeit', x: 14, y: 60, visible: false, type: 'data', color: '#000000' },
    { id: 'km', label: 'Kilometer', x: 14, y: 65, visible: false, type: 'data', color: '#000000' },
    { id: 'month', label: 'Monat', x: 14, y: 70, visible: true, type: 'data', color: '#000000' },
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
        <h3 className="text-lg font-bold mb-4 text-gray-900">{editingId ? 'Edit Template' : 'Create New Template'}</h3>
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
                    <span className="text-sm font-medium flex-1 text-gray-900 cursor-pointer" onClick={() => setExpandedFieldId(expandedFieldId === field.id ? null : field.id)}>
                      {field.label} {field.type && <span className="text-[10px] bg-gray-100 px-1 rounded text-gray-400">{field.type}</span>}
                    </span>
                    <div className="flex gap-1 items-center">
                      <span className="text-xs text-gray-500">X:</span>
                      <input type="number" className="w-12 border rounded p-1 text-xs bg-white text-gray-900" value={field.x} onChange={e => updateField(field.id, { x: Number(e.target.value) })} />
                      <span className="text-xs text-gray-500">Y:</span>
                      <input type="number" className="w-12 border rounded p-1 text-xs bg-white text-gray-900" value={field.y} onChange={e => updateField(field.id, { y: Number(e.target.value) })} />
                      {field.id.includes('_') && <button onClick={() => removeField(field.id)} className="text-red-500 p-1"><Trash2 size={14} /></button>}
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
                  }}
                  onMouseDown={() => setDraggedFieldId(field.id)}
                >
                  {field.type === 'image' && field.content ? (
                    <img src={field.content} className="w-full h-full object-contain" alt="Logo" />
                  ) : (
                    <>
                      <span className="font-bold">{field.label}:</span> 
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
