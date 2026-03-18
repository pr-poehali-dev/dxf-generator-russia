import { useState, useRef, useCallback } from 'react';
import Icon from '@/components/ui/icon';

type Unit = 'mm' | 'cm' | 'inch' | 'px';

interface DimEntry {
  id: string;
  width: string;
  height: string;
  qty: string;
}

const UNIT_LABELS: Record<Unit, string> = {
  mm: 'мм',
  cm: 'см',
  inch: 'дюймы',
  px: 'пиксели',
};

const UNIT_TO_MM: Record<Unit, number> = {
  mm: 1,
  cm: 10,
  inch: 25.4,
  px: 0.264583,
};

function parseAllDimensions(text: string): DimEntry[] {
  const results: DimEntry[] = [];
  // Ищем паттерны вида: 753x497 - 2шт / 753x497 2шт / 753×497 — 2 шт
  const linePattern = /(\d+[.,]?\d*)\s*[xхXХ×]\s*(\d+[.,]?\d*)(?:\s*[-—–]?\s*(\d+)\s*(?:шт|pcs|pc|штук|штуки)?)?/gi;
  let match;
  let idx = 0;
  while ((match = linePattern.exec(text)) !== null) {
    results.push({
      id: String(idx++),
      width: match[1].replace(',', '.'),
      height: match[2].replace(',', '.'),
      qty: match[3] || '1',
    });
  }
  return results;
}

function generateDXF(entries: DimEntry[], unit: Unit): string {
  const factor = UNIT_TO_MM[unit];
  const lines: string[] = [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER',
    '1', 'AC1015',
    '9', '$INSUNITS',
    '70', '4',
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'TABLES',
    '0', 'TABLE',
    '2', 'LAYER',
    '70', '1',
    '0', 'LAYER',
    '2', '0',
    '70', '0',
    '62', '7',
    '6', 'CONTINUOUS',
    '0', 'ENDTAB',
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'ENTITIES',
  ];

  let offsetX = 0;

  for (const entry of entries) {
    const w = parseFloat(entry.width) * factor;
    const h = parseFloat(entry.height) * factor;
    const qty = parseInt(entry.qty) || 1;
    if (!w || !h) continue;

    for (let q = 0; q < qty; q++) {
      const x0 = offsetX;
      const y0 = 0;
      const x1 = offsetX + w;
      const y1 = h;

      lines.push(
        '0', 'LWPOLYLINE',
        '8', '0',
        '90', '4',
        '70', '1',
        '10', `${x0}`, '20', `${y0}`,
        '10', `${x1}`, '20', `${y0}`,
        '10', `${x1}`, '20', `${y1}`,
        '10', `${x0}`, '20', `${y1}`,
      );

      const cx = x0 + w / 2;
      const textSize = Math.min(w, h) * 0.05;
      lines.push(
        '0', 'TEXT',
        '8', '0',
        '10', `${cx}`, '20', `${-textSize * 2.5}`,
        '40', `${textSize}`,
        '1', `${w.toFixed(1)} x ${h.toFixed(1)} mm`,
        '72', '1',
        '11', `${cx}`, '21', `${-textSize * 2.5}`,
      );

      offsetX += w + 10;
    }
  }

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

export default function Index() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isDragging, setIsDragging] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [rawText, setRawText] = useState('');
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [entries, setEntries] = useState<DimEntry[]>([]);
  const [unit, setUnit] = useState<Unit>('mm');
  const [dxfContent, setDxfContent] = useState('');
  const [activeEntry, setActiveEntry] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const recognizeImage = async (imageUrl: string) => {
    setIsRecognizing(true);
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('rus+eng');
      const { data: { text } } = await worker.recognize(imageUrl);
      await worker.terminate();
      setRawText(text.trim());
      const parsed = parseAllDimensions(text);
      setEntries(parsed.length > 0 ? parsed : [{ id: '0', width: '', height: '', qty: '1' }]);
      if (parsed.length > 0) setActiveEntry(parsed[0].id);
    } catch {
      setRawText('');
      setEntries([{ id: '0', width: '', height: '', qty: '1' }]);
    }
    setIsRecognizing(false);
  };

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setImagePreview(url);
      setStep(2);
      recognizeImage(url);
    };
    reader.readAsDataURL(file);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const updateEntry = (id: string, field: keyof DimEntry, value: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const addEntry = () => {
    const newId = String(Date.now());
    setEntries(prev => [...prev, { id: newId, width: '', height: '', qty: '1' }]);
    setActiveEntry(newId);
  };

  const removeEntry = (id: string) => {
    setEntries(prev => {
      const next = prev.filter(e => e.id !== id);
      return next.length > 0 ? next : [{ id: '0', width: '', height: '', qty: '1' }];
    });
  };

  const validEntries = entries.filter(e => parseFloat(e.width) > 0 && parseFloat(e.height) > 0);

  const handleGenerate = () => {
    if (validEntries.length === 0) return;
    const dxf = generateDXF(validEntries, unit);
    setDxfContent(dxf);
    setStep(3);
  };

  const handleDownload = () => {
    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frames_${validEntries.length}pcs.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setStep(1);
    setImagePreview(null);
    setRawText('');
    setEntries([]);
    setDxfContent('');
    setActiveEntry(null);
  };

  const activeEntryData = entries.find(e => e.id === activeEntry) || entries[0];
  const wMm = activeEntryData ? parseFloat(activeEntryData.width) * UNIT_TO_MM[unit] : 0;
  const hMm = activeEntryData ? parseFloat(activeEntryData.height) * UNIT_TO_MM[unit] : 0;
  const isActiveValid = wMm > 0 && hMm > 0;

  const maxPW = 260;
  const maxPH = 200;
  const aspect = isActiveValid ? wMm / hMm : 1.6;
  const previewW = Math.min(maxPW, maxPH * aspect);
  const previewH = previewW / aspect;

  return (
    <div className="min-h-screen bg-background grid-bg flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border border-primary/60 rotate-45 flex items-center justify-center glow">
            <div className="w-1.5 h-1.5 bg-primary" />
          </div>
          <span className="font-mono text-sm text-primary tracking-widest uppercase glow-text">DXF Generator</span>
        </div>
        <div className="flex items-center gap-5">
          {([1, 2, 3] as const).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-5 h-5 border font-mono text-xs flex items-center justify-center transition-all duration-300 ${step >= s ? 'border-primary bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground'}`}>
                {step > s ? '✓' : s}
              </div>
              <span className={`text-xs font-mono hidden sm:block transition-colors ${step >= s ? 'text-primary/80' : 'text-muted-foreground/40'}`}>
                {s === 1 ? 'ЗАГРУЗКА' : s === 2 ? 'РЕДАКТОР' : 'РЕЗУЛЬТАТ'}
              </span>
            </div>
          ))}
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">

        {/* STEP 1 — Upload */}
        {step === 1 && (
          <div className="w-full max-w-lg animate-fade-in">
            <div className="mb-8 text-center">
              <h1 className="font-mono text-2xl text-foreground mb-2 tracking-tight">Загрузите изображение</h1>
              <p className="text-muted-foreground text-sm">Фото с размерами, рукописный текст или накладная — распознаю все позиции автоматически</p>
            </div>

            <div
              className={`relative border-2 border-dashed p-14 text-center cursor-crosshair transition-all duration-300 ${isDragging ? 'border-primary bg-primary/5 glow' : 'border-border/40 hover:border-primary/40 hover:bg-muted/20'}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              <div className="flex flex-col items-center gap-4">
                <div className={`w-16 h-16 border border-primary/30 flex items-center justify-center transition-all duration-300 ${isDragging ? 'border-primary scale-110' : ''}`}>
                  <Icon name="Upload" size={28} className="text-primary/60" />
                </div>
                <div>
                  <p className="font-mono text-sm text-foreground/80 mb-1">{isDragging ? 'ОТПУСТИТЕ ДЛЯ ЗАГРУЗКИ' : 'ПЕРЕТАЩИТЕ ИЛИ НАЖМИТЕ'}</p>
                  <p className="text-xs text-muted-foreground font-mono">PNG · JPG · WEBP · BMP</p>
                </div>
              </div>
              <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-primary/30" />
              <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-primary/30" />
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-primary/30" />
              <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-primary/30" />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1 h-px bg-border/30" />
              <span className="font-mono text-xs text-muted-foreground/50">или без изображения</span>
              <div className="flex-1 h-px bg-border/30" />
            </div>
            <button onClick={() => { setEntries([{ id: '0', width: '', height: '', qty: '1' }]); setStep(2); }}
              className="mt-4 w-full py-3 border border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground font-mono text-xs tracking-widest transition-all duration-200">
              ВВЕСТИ РАЗМЕРЫ ВРУЧНУЮ →
            </button>
          </div>
        )}

        {/* STEP 2 — Split editor */}
        {step === 2 && (
          <div className="w-full animate-fade-in" style={{ maxWidth: 1000 }}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h1 className="font-mono text-xl text-foreground tracking-tight">Редактор размеров</h1>
                <p className="text-muted-foreground text-xs font-mono mt-0.5">
                  {isRecognizing ? '⏳ Распознаю текст...' : `Найдено позиций: ${entries.length}`}
                </p>
              </div>
              {/* Unit selector */}
              <div className="flex gap-1">
                {(Object.keys(UNIT_LABELS) as Unit[]).map((u) => (
                  <button key={u} onClick={() => setUnit(u)}
                    className={`px-3 py-1.5 font-mono text-xs border transition-all duration-150 ${unit === u ? 'border-primary bg-primary/10 text-primary' : 'border-border/30 text-muted-foreground hover:border-primary/30'}`}>
                    {UNIT_LABELS[u].toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Split panels */}
            <div className="grid grid-cols-2 gap-4" style={{ height: 'calc(100vh - 240px)', minHeight: 400 }}>

              {/* LEFT — image */}
              <div className="border border-border/40 flex flex-col overflow-hidden">
                <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between shrink-0">
                  <span className="font-mono text-xs text-muted-foreground tracking-wider">ИЗОБРАЖЕНИЕ</span>
                  {imagePreview && (
                    <button onClick={() => fileInputRef.current?.click()}
                      className="font-mono text-xs text-primary/60 hover:text-primary transition-colors">
                      ЗАМЕНИТЬ
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </div>
                <div className="flex-1 overflow-auto p-3">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Источник" className="w-full h-auto object-contain" />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-center cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}>
                      <Icon name="Image" size={32} className="text-muted-foreground/30" />
                      <span className="font-mono text-xs text-muted-foreground/40">ИЗОБРАЖЕНИЕ НЕ ЗАГРУЖЕНО</span>
                    </div>
                  )}
                </div>
                {rawText && (
                  <div className="border-t border-border/30 shrink-0">
                    <div className="px-3 py-1.5 flex items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground/60 tracking-wider">РАСПОЗНАННЫЙ ТЕКСТ</span>
                    </div>
                    <div className="px-3 pb-2 max-h-24 overflow-auto">
                      <p className="font-mono text-xs text-foreground/50 whitespace-pre-wrap">{rawText}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT — entries list */}
              <div className="border border-border/40 flex flex-col overflow-hidden">
                <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between shrink-0">
                  <span className="font-mono text-xs text-muted-foreground tracking-wider">ПОЗИЦИИ</span>
                  <button onClick={addEntry}
                    className="flex items-center gap-1 font-mono text-xs text-primary/70 hover:text-primary transition-colors border border-primary/30 hover:border-primary/60 px-2 py-0.5">
                    <Icon name="Plus" size={12} />
                    ДОБАВИТЬ
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-2 space-y-2">
                  {isRecognizing ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center">
                        <div className="font-mono text-xs text-primary animate-pulse mb-2">РАСПОЗНАЮ ТЕКСТ...</div>
                        <div className="flex gap-1 justify-center">
                          {[0,1,2].map(i => (
                            <div key={i} className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-pulse"
                              style={{ animationDelay: `${i * 0.2}s` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : entries.map((entry, idx) => {
                    const isActive = activeEntry === entry.id;
                    const entryW = parseFloat(entry.width) * UNIT_TO_MM[unit];
                    const entryH = parseFloat(entry.height) * UNIT_TO_MM[unit];
                    const entryValid = entryW > 0 && entryH > 0;

                    return (
                      <div
                        key={entry.id}
                        onClick={() => setActiveEntry(entry.id)}
                        className={`border p-3 cursor-pointer transition-all duration-150 ${isActive ? 'border-primary/60 bg-primary/5' : 'border-border/30 hover:border-border/60'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground/50">#{idx + 1}</span>
                            {entryValid && (
                              <span className="font-mono text-xs text-primary/70">
                                {entryW.toFixed(1)} × {entryH.toFixed(1)} мм
                              </span>
                            )}
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); removeEntry(entry.id); }}
                            className="text-muted-foreground/30 hover:text-destructive transition-colors">
                            <Icon name="X" size={14} />
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="font-mono text-xs text-muted-foreground/50 block mb-1">ШИРИНА</label>
                            <input
                              type="number"
                              className="w-full bg-muted/20 border border-border/30 px-2 py-1.5 font-mono text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors"
                              value={entry.width}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateEntry(entry.id, 'width', e.target.value)}
                              placeholder="753"
                            />
                          </div>
                          <div>
                            <label className="font-mono text-xs text-muted-foreground/50 block mb-1">ВЫСОТА</label>
                            <input
                              type="number"
                              className="w-full bg-muted/20 border border-border/30 px-2 py-1.5 font-mono text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors"
                              value={entry.height}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateEntry(entry.id, 'height', e.target.value)}
                              placeholder="497"
                            />
                          </div>
                          <div>
                            <label className="font-mono text-xs text-muted-foreground/50 block mb-1">КОЛ-ВО</label>
                            <input
                              type="number"
                              min="1"
                              className="w-full bg-muted/20 border border-border/30 px-2 py-1.5 font-mono text-sm text-foreground focus:outline-none focus:border-primary/60 transition-colors"
                              value={entry.qty}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateEntry(entry.id, 'qty', e.target.value)}
                              placeholder="2"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Mini preview + actions */}
                <div className="border-t border-border/30 p-3 shrink-0">
                  {isActiveValid && (
                    <div className="mb-3 flex items-center justify-center bg-muted/10 py-4" style={{ minHeight: 80 }}>
                      <div className="relative"
                        style={{ width: Math.min(previewW, 200), height: Math.min(previewH, 100) * (Math.min(previewW, 200) / previewW) }}>
                        <div className="absolute inset-0 border border-primary/60 animate-pulse-border"
                          style={{ boxShadow: '0 0 10px hsl(195 100% 50% / 0.15)' }} />
                        <div className="absolute -top-1 -left-1 w-2 h-2 border-t border-l border-primary" />
                        <div className="absolute -top-1 -right-1 w-2 h-2 border-t border-r border-primary" />
                        <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b border-l border-primary" />
                        <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-primary" />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setStep(1)}
                      className="px-4 py-2 border border-border/40 text-muted-foreground hover:border-primary/30 font-mono text-xs tracking-widest transition-all duration-200">
                      ←
                    </button>
                    <button onClick={handleGenerate} disabled={validEntries.length === 0}
                      className="flex-1 py-2 bg-primary text-primary-foreground font-mono text-xs tracking-widest hover:bg-primary/90 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed glow">
                      СГЕНЕРИРОВАТЬ DXF ({validEntries.length} поз.) →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3 — Result */}
        {step === 3 && (
          <div className="w-full max-w-lg animate-fade-in">
            <div className="mb-6 text-center">
              <div className="inline-flex items-center gap-2 text-primary font-mono text-xs tracking-widest mb-3">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                DXF ФАЙЛ ГОТОВ
              </div>
              <h1 className="font-mono text-2xl text-foreground mb-1 tracking-tight">Файл сгенерирован</h1>
              <p className="text-muted-foreground text-sm font-mono">{validEntries.length} позиций · {validEntries.reduce((s, e) => s + (parseInt(e.qty) || 1), 0)} рамок</p>
            </div>

            {/* Entries summary */}
            <div className="border border-border/40 mb-6 max-h-64 overflow-auto">
              <div className="px-3 py-2 border-b border-border/30">
                <span className="font-mono text-xs text-muted-foreground tracking-wider">ИТОГО ПОЗИЦИЙ</span>
              </div>
              {validEntries.map((entry, idx) => {
                const w = parseFloat(entry.width) * UNIT_TO_MM[unit];
                const h = parseFloat(entry.height) * UNIT_TO_MM[unit];
                return (
                  <div key={entry.id} className="flex items-center justify-between px-3 py-2 border-b border-border/20 last:border-0">
                    <span className="font-mono text-xs text-muted-foreground/60">#{idx + 1}</span>
                    <span className="font-mono text-sm text-foreground">{w.toFixed(1)} × {h.toFixed(1)} мм</span>
                    <span className="font-mono text-xs text-primary/70">{entry.qty} шт</span>
                  </div>
                );
              })}
            </div>

            <div className="border border-border/40 mb-6">
              <div className="grid grid-cols-3 divide-x divide-border/30">
                {[
                  { label: 'ФОРМАТ', value: 'AC1015' },
                  { label: 'ПОЗИЦИЙ', value: String(validEntries.length) },
                  { label: 'РАМОК', value: String(validEntries.reduce((s, e) => s + (parseInt(e.qty) || 1), 0)) },
                ].map(({ label, value }) => (
                  <div key={label} className="px-4 py-3 text-center">
                    <div className="font-mono text-xs text-muted-foreground/60 mb-1">{label}</div>
                    <div className="font-mono text-sm text-primary/80">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <button onClick={handleDownload}
                className="w-full py-4 bg-primary text-primary-foreground font-mono text-sm tracking-widest hover:bg-primary/90 transition-all glow flex items-center justify-center gap-3">
                <Icon name="Download" size={18} />
                СКАЧАТЬ DXF ФАЙЛ
              </button>
              <button onClick={() => setStep(2)}
                className="w-full py-2.5 border border-border/40 text-muted-foreground hover:border-primary/30 hover:text-foreground font-mono text-xs tracking-widest transition-all">
                ← ВЕРНУТЬСЯ К РЕДАКТОРУ
              </button>
              <button onClick={handleReset}
                className="w-full py-2.5 border border-border/40 text-muted-foreground hover:border-primary/30 hover:text-foreground font-mono text-xs tracking-widest transition-all">
                ↺ НАЧАТЬ ЗАНОВО
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-border/30 px-6 py-2 flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground/40">DXF GENERATOR v1.0</span>
        <span className="font-mono text-xs text-muted-foreground/40">AutoCAD R2000 · AC1015</span>
      </footer>
    </div>
  );
}