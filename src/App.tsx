import React, { useState, useEffect } from 'react';
import { db, type Customer, type DailyLog } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { Plus, Trash2, Save, FileText, BarChart, History, User, Calendar, Settings } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- Types ---
type View = 'customers' | 'logs' | 'stats' | 'history' | 'settings';

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
              <h4 className="font-bold text-gray-800">{c.kunde}</h4>
              <p className="text-sm text-gray-500">{c.dienstleistung}</p>
              <p className="text-xs text-gray-400">{c.adresse}</p>
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

  const generatePDF = () => {
    if (!customer || !logs) return;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('ASSISTENZPROTOKOLL', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text(`Dienstleistung: ${customer.dienstleistung}`, 14, 30);
    doc.text(`Kunde: ${customer.kunde}`, 14, 35);
    doc.text(`Assistent: ${customer.assistent}`, 14, 40);
    doc.text(`Adresse: ${customer.adresse}`, 14, 45);
    doc.text(`Monat: ${month}`, 14, 50);

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
      startY: 60,
      head: [['Datum', 'Förderziel', 'Assistenzinhalt', 'Beginn', 'Ende', 'Zeit (min)']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [200, 200, 200], textColor: 0 },
      styles: { fontSize: 8 }
    });

    doc.save(`Protokoll_${customer.kunde}_${month}.pdf`);
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
      <td className="p-3 font-medium">{format(day, 'dd.MM (EEE)')}</td>
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
          <td className="p-3 truncate max-w-[150px]">{log?.foerderziel || '-'}</td>
          <td className="p-3 truncate max-w-[200px]">{log?.assistenzinhalt || '-'}</td>
          <td className="p-3">{log?.startTime || '-'}</td>
          <td className="p-3">{log?.endTime || '-'}</td>
          <td className="p-3">{log?.timeWithCustomerMinutes || 0}m</td>
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

  const [consumption, setConsumption] = useState('');
  const [price, setPrice] = useState('');

  useEffect(() => {
    if (fuelConsumption) setConsumption(String(fuelConsumption.value));
    if (fuelPrice) setPrice(String(fuelPrice.value));
  }, [fuelConsumption, fuelPrice]);

  const handleSave = async () => {
    await db.settings.put({ key: 'fuelConsumption', value: Number(consumption) });
    await db.settings.put({ key: 'fuelPrice', value: Number(price) });
    alert('Settings saved!');
  };

  return (
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
  );
}

function HistoryView() {
  const history = useLiveQuery(() => db.auditTrail.orderBy('timestamp').reverse().limit(50).toArray());

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-gray-50 text-xs font-bold text-gray-400 uppercase">
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
