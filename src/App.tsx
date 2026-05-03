import React, { useState, useEffect } from 'react';
import { db, type Customer, type DailyLog } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { Plus, Trash2, Save, FileText, BarChart, History, User, Calendar } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- Types ---
type View = 'customers' | 'logs' | 'stats' | 'history';

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
                  className="border rounded px-3 py-2" 
                  value={selectedCustomerId || ''} 
                  onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
                >
                  <option value="">Select Customer</option>
                  {customers?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
             )}
             {(activeView === 'logs' || activeView === 'stats') && (
               <input 
                 type="month" 
                 className="border rounded px-3 py-2"
                 value={selectedMonth}
                 onChange={(e) => setSelectedMonth(e.target.value)}
               />
             )}
          </div>
        </header>

        {activeView === 'customers' && <CustomerView />}
        {activeView === 'logs' && <LogsView customerId={selectedCustomerId} month={selectedMonth} />}
        {activeView === 'stats' && <StatsView customerId={selectedCustomerId} month={selectedMonth} />}
        {activeView === 'history' && <HistoryView />}
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
    if (!formData.name) return;
    const data = {
      name: formData.name || '',
      address: formData.address || '',
      birthDate: formData.birthDate || '',
      insuranceNumber: formData.insuranceNumber || '',
      defaultStartTime: formData.defaultStartTime || '08:00',
      defaultEndTime: formData.defaultEndTime || '16:00',
      defaultActivities: formData.defaultActivities || '',
    };

    if (editingId) {
      const old = await db.customers.get(editingId);
      await db.customers.update(editingId, data);
      await logChange('customer', editingId, 'update', old, data);
    } else {
      const id = await db.customers.add(data as Customer);
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
        <h3 className="text-lg font-bold mb-4">{editingId ? 'Edit Customer' : 'Add New Customer'}</h3>
        <div className="grid grid-cols-2 gap-4">
          <input className="border rounded p-2" placeholder="Full Name" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
          <input className="border rounded p-2" placeholder="Address" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} />
          <input className="border rounded p-2" type="date" placeholder="Birth Date" value={formData.birthDate || ''} onChange={e => setFormData({...formData, birthDate: e.target.value})} />
          <input className="border rounded p-2" placeholder="Insurance Number" value={formData.insuranceNumber || ''} onChange={e => setFormData({...formData, insuranceNumber: e.target.value})} />
          <input className="border rounded p-2" type="time" placeholder="Default Start" value={formData.defaultStartTime || ''} onChange={e => setFormData({...formData, defaultStartTime: e.target.value})} />
          <input className="border rounded p-2" type="time" placeholder="Default End" value={formData.defaultEndTime || ''} onChange={e => setFormData({...formData, defaultEndTime: e.target.value})} />
          <textarea className="border rounded p-2 col-span-2" placeholder="Default Activities" value={formData.defaultActivities || ''} onChange={e => setFormData({...formData, defaultActivities: e.target.value})} />
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
              <h4 className="font-bold text-gray-800">{c.name}</h4>
              <p className="text-sm text-gray-500">{c.insuranceNumber}</p>
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

  const logs = useLiveQuery(
    () => (customerId ? db.logs.where('customerId').equals(customerId).filter(l => l.date.startsWith(month)).toArray() : Promise.resolve([])) as Promise<DailyLog[]>,
    [customerId, month]
  );

  const customer = useLiveQuery(() => (customerId ? db.customers.get(customerId) : Promise.resolve(undefined)) as Promise<Customer | undefined>, [customerId]);

  const handleSaveLog = async (date: string, data: Partial<DailyLog>) => {
    if (!customerId) return;
    const existing = logs?.find(l => l.date === date);
    const logData = {
      customerId,
      date,
      startTime: data.startTime || '',
      endTime: data.endTime || '',
      activities: data.activities || '',
      kmDriven: Number(data.kmDriven) || 0,
      pauseMinutes: Number(data.pauseMinutes) || 0,
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
    doc.text(`Kunde: ${customer.name}`, 14, 30);
    doc.text(`Adresse: ${customer.address}`, 14, 35);
    doc.text(`Versicherungsnr: ${customer.insuranceNumber}`, 14, 40);
    doc.text(`Monat: ${month}`, 14, 45);

    const tableData = days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const log = logs.find(l => l.date === dateStr);
      return [
        format(day, 'dd.MM.yyyy'),
        log?.startTime || '-',
        log?.endTime || '-',
        log?.pauseMinutes || '0',
        log?.activities || '',
        log?.kmDriven || '0'
      ];
    });

    autoTable(doc, {
      startY: 55,
      head: [['Datum', 'Beginn', 'Ende', 'Pause (min)', 'Tätigkeiten', 'KM']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [200, 200, 200], textColor: 0 },
      styles: { fontSize: 8 }
    });

    doc.save(`Protokoll_${customer.name}_${month}.pdf`);
  };

  if (!customerId) return <div className="text-center p-12 bg-white rounded-xl border">Please select a customer to view logs.</div>;

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="p-4 border-b flex justify-between items-center bg-gray-50">
         <h3 className="font-bold">Protocol for {customer?.name} ({month})</h3>
         <button onClick={generatePDF} className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-green-700">
           <FileText size={18} /> Export PDF
         </button>
      </div>
      <table className="w-full text-left border-collapse">
        <thead className="bg-gray-50 text-sm uppercase text-gray-500">
          <tr>
            <th className="p-3 border-b">Date</th>
            <th className="p-3 border-b">Start</th>
            <th className="p-3 border-b">End</th>
            <th className="p-3 border-b">Pause</th>
            <th className="p-3 border-b">Activities</th>
            <th className="p-3 border-b">KM</th>
            <th className="p-3 border-b text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const log = logs?.find(l => l.date === dateStr);
            return <LogRow key={dateStr} day={day} log={log} onSave={(d) => handleSaveLog(dateStr, d)} defaults={customer} />;
          })}
        </tbody>
      </table>
    </div>
  );
}

function LogRow({ day, log, onSave, defaults }: { day: Date, log?: DailyLog, onSave: (d: Partial<DailyLog>) => void, defaults?: Customer }) {
  const [isEditing, setIsEditing] = useState(false);
  const [data, setData] = useState<Partial<DailyLog>>(log || {});

  useEffect(() => { setData(log || {}); }, [log]);

  const handleApplyDefaults = () => {
    setData({
      ...data,
      startTime: defaults?.defaultStartTime || '08:00',
      endTime: defaults?.defaultEndTime || '16:00',
      activities: defaults?.defaultActivities || '',
    });
    setIsEditing(true);
  };

  return (
    <tr className={`border-b hover:bg-gray-50 ${!log ? 'text-gray-400' : ''}`}>
      <td className="p-3 font-medium">{format(day, 'dd.MM (EEE)')}</td>
      {isEditing ? (
        <>
          <td className="p-1"><input type="time" className="border rounded p-1 w-full" value={data.startTime || ''} onChange={e => setData({...data, startTime: e.target.value})} /></td>
          <td className="p-1"><input type="time" className="border rounded p-1 w-full" value={data.endTime || ''} onChange={e => setData({...data, endTime: e.target.value})} /></td>
          <td className="p-1"><input type="number" className="border rounded p-1 w-20" value={data.pauseMinutes || 0} onChange={e => setData({...data, pauseMinutes: Number(e.target.value)})} /></td>
          <td className="p-1"><input type="text" className="border rounded p-1 w-full" value={data.activities || ''} onChange={e => setData({...data, activities: e.target.value})} /></td>
          <td className="p-1"><input type="number" className="border rounded p-1 w-20" value={data.kmDriven || 0} onChange={e => setData({...data, kmDriven: Number(e.target.value)})} /></td>
          <td className="p-3 text-right flex justify-end gap-1">
            <button onClick={() => { onSave(data); setIsEditing(false); }} className="text-green-600 p-1"><Save size={18} /></button>
            <button onClick={() => setIsEditing(false)} className="text-gray-400 p-1">X</button>
          </td>
        </>
      ) : (
        <>
          <td className="p-3">{log?.startTime || '-'}</td>
          <td className="p-3">{log?.endTime || '-'}</td>
          <td className="p-3">{log?.pauseMinutes || 0}m</td>
          <td className="p-3 truncate max-w-xs">{log?.activities || '-'}</td>
          <td className="p-3">{log?.kmDriven || 0} km</td>
          <td className="p-3 text-right">
             <button onClick={() => setIsEditing(true)} className="text-blue-600 text-sm hover:underline mr-2">Edit</button>
             {!log && <button onClick={handleApplyDefaults} className="text-gray-500 text-sm hover:underline">Use Defaults</button>}
          </td>
        </>
      )}
    </tr>
  );
}

function StatsView({ customerId, month }: { customerId: number | null, month: string }) {
  const logs = useLiveQuery(
    () => (customerId ? db.logs.where('customerId').equals(customerId).filter(l => l.date.startsWith(month)).toArray() : Promise.resolve([])) as Promise<DailyLog[]>,
    [customerId, month]
  );

  if (!customerId) return <div>Please select a customer.</div>;

  const totalKm = logs?.reduce((sum, l) => sum + (l.kmDriven || 0), 0) || 0;
  const totalMinutes = logs?.reduce((sum, l) => {
    if (!l.startTime || !l.endTime) return sum;
    const start = new Date(`2000-01-01T${l.startTime}`);
    const end = new Date(`2000-01-01T${l.endTime}`);
    let diff = (end.getTime() - start.getTime()) / 60000;
    if (diff < 0) diff += 24 * 60; // handle overnight
    return sum + (diff - (l.pauseMinutes || 0));
  }, 0) || 0;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white p-6 rounded-xl border shadow-sm">
        <h3 className="text-gray-500 text-sm font-bold uppercase mb-2">Total Distance</h3>
        <p className="text-4xl font-black text-blue-600">{totalKm} <span className="text-lg">km</span></p>
      </div>
      <div className="bg-white p-6 rounded-xl border shadow-sm">
        <h3 className="text-gray-500 text-sm font-bold uppercase mb-2">Total Working Time</h3>
        <p className="text-4xl font-black text-green-600">{hours}h {minutes}m</p>
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
