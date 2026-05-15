import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PDFDocument, PDFDict, PDFName, PDFString, PDFHexString, PDFTextField } from 'pdf-lib';
import { Plus, Trash2, Download, Search, RefreshCw } from 'lucide-react';
import { db } from '../db';

export default function PDFTemplatesView() {
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
          tableY: 100,
          type: 'single_entry'
        });
        setEditingId(newId as number);
      }
    };
    reader.readAsDataURL(file);
  };

  const addMapping = async (id: number) => {
    const t = await db.pdfTemplates.get(id);
    if (!t) return;
    const newMappings = [...t.fieldMappings, { placeholder: '{{new}}', dataSource: 'kunde' as const }];
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
            field.enableMultiline();
            field.setFontSize(10);
            field.setText(sampleData[m.dataSource] || `[${m.dataSource}]`);
          } catch (e) {
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
            field.enableMultiline();
            field.setFontSize(10);
            field.setText(val);
          } catch(e) {
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
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      
      const annotationNames = new Set<string>();
      const pages = pdfDoc.getPages();
      pages.forEach(page => {
        const annotations = page.node.Annots();
        if (annotations) {
          annotations.asArray().forEach(annotRef => {
            const annot = pdfDoc.context.lookup(annotRef);
            if (annot instanceof PDFDict) {
              const subtype = annot.get(PDFName.of('Subtype'));
              if (subtype === PDFName.of('Widget') || subtype === PDFName.of('FreeText')) {
                let fieldName = '';
                const tKey = annot.get(PDFName.of('T'));
                const contents = annot.get(PDFName.of('Contents'));
                const tu = annot.get(PDFName.of('TU'));
                const tm = annot.get(PDFName.of('TM'));

                if (tKey instanceof PDFString || tKey instanceof PDFHexString) {
                  fieldName = tKey.decodeText();
                } 
                if ((!fieldName || fieldName === 'ramboo') && (contents instanceof PDFString || contents instanceof PDFHexString)) {
                  fieldName = contents.decodeText();
                }
                if (!fieldName && (tu instanceof PDFString || tu instanceof PDFHexString)) {
                  fieldName = tu.decodeText();
                } else if (!fieldName && (tm instanceof PDFString || tm instanceof PDFHexString)) {
                  fieldName = tm.decodeText();
                }

                if (fieldName) {
                  const cleanedName = fieldName.replace('{{', '').replace('}}', '');
                  annotationNames.add(cleanedName);
                }
              }
            }
          });
        }
      });

      let fieldNames = fields.map(f => f.getName());
      annotationNames.forEach(name => {
        if (!fieldNames.includes(name)) fieldNames.push(name);
      });

      const formMappings = fieldNames.map(name => ({
        placeholder: `{{${name}}}`,
        dataSource: 'kunde' as const
      }));

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
            Upload a PDF with interactive form fields to map data.
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
            <div className="flex justify-between items-start mb-4">
              <div className="flex flex-col">
                <input 
                  type="text" 
                  className="text-xl font-bold bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none text-gray-900"
                  value={t.name}
                  onChange={(e) => db.pdfTemplates.update(t.id!, { name: e.target.value })}
                />
                <select
                  className="mt-1 text-sm text-gray-600 bg-white border border-gray-200 rounded px-2 py-1 w-fit focus:border-blue-500 outline-none"
                  value={t.type || 'single_entry'}
                  onChange={(e) => db.pdfTemplates.update(t.id!, { type: e.target.value as any })}
                >
                  <option value="single_entry">1 Entry per PDF</option>
                  <option value="double_entry">2 Entries per PDF</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => debugScanFields(t.id!)}
                  className="text-orange-600 hover:bg-orange-50 px-3 py-2 rounded-lg transition text-sm flex items-center gap-1"
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
                            <optgroup label="Daily Logs (Row 2 Examples)">
                              <option value="date_2">Date (Row 2)</option>
                              <option value="foerderziel_2">Goal (Row 2)</option>
                              <option value="assistenzinhalt_2">Content (Row 2)</option>
                              <option value="anmerkungreflexion_2">Reflection (Row 2)</option>
                              <option value="zeitvb_2">Time Von-Bis (Row 2)</option>
                              <option value="zeitinmin_2">Time in Min (Row 2)</option>
                              <option value="anabfhart_from_2">Travel From (Row 2)</option>
                              <option value="anabfhart_too_2">Travel To (Row 2)</option>
                              <option value="traveltime_2">Travel Time (Row 2)</option>
                              <option value="km_2">Travel KM (Row 2)</option>
                              <option value="customer_anabfhart_from_2">Cust. Travel From (Row 2)</option>
                              <option value="customer_anabfhart_too_2">Cust. Travel To (Row 2)</option>
                              <option value="coustomer_traveltime_2">Cust. Travel Time (Row 2)</option>
                              <option value="couistomer_km_2">Cust. Travel KM (Row 2)</option>
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
                        {page.elements.map((el: any, ei: number) => (
                          <div key={ei} className="ml-2 mb-1 border-l border-gray-800 pl-2">
                            <span className="text-blue-400">[{el.kind}]</span>{' '}
                            <span className="text-yellow-400">{el.name}</span>{' '}
                            <span className="text-gray-500">({el.type || el.subtype})</span>
                            {el.contents && <div className="text-green-400">Contents: {el.contents}</div>}
                          </div>
                        ))}
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
