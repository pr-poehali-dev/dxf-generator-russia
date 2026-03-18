import { useState, useRef, useCallback, useEffect } from 'react';
import Icon from '@/components/ui/icon';

type Unit = 'mm' | 'cm' | 'inch' | 'px';

interface DimEntry {
  id: string;
  width: string;
  height: string;
  qty: string;
}

const UNIT_LABELS: Record<Unit, string> = { mm: 'мм', cm: 'см', inch: 'дюймы', px: 'пиксели' };
const UNIT_TO_MM: Record<Unit, number> = { mm: 1, cm: 10, inch: 25.4, px: 0.264583 };

function parseAllDimensions(text: string): DimEntry[] {
  const results: DimEntry[] = [];
  const linePattern = /(\d+[.,]?\d*)\s*[xхXХ×]\s*(\d+[.,]?\d*)(?:\s*[-—–]?\s*(\d+)\s*(?:шт|pcs|pc|штук|штуки)?)?/gi;
  let match;
  let idx = 0;
  while ((match = linePattern.exec(text)) !== null) {
    results.push({ id: String(idx++), width: match[1].replace(',', '.'), height: match[2].replace(',', '.'), qty: match[3] || '1' });
  }
  return results;
}

function generateDXF(entries: DimEntry[], unit: Unit): string {
  const factor = UNIT_TO_MM[unit];
  const lines: string[] = [
    '0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$INSUNITS','70','4','0','ENDSEC',
    '0','SECTION','2','TABLES','0','TABLE','2','LAYER','70','1',
    '0','LAYER','2','0','70','0','62','7','6','CONTINUOUS','0','ENDTAB','0','ENDSEC',
    '0','SECTION','2','ENTITIES',
  ];
  let offsetX = 0;
  let globalNum = 1;
  for (const entry of entries) {
    const w = parseFloat(entry.width) * factor;
    const h = parseFloat(entry.height) * factor;
    const qty = parseInt(entry.qty) || 1;
    if (!w || !h) continue;
    for (let q = 0; q < qty; q++) {
      const x0 = offsetX, y0 = 0, x1 = offsetX + w, y1 = h;
      lines.push('0','LWPOLYLINE','8','0','90','4','70','1',
        '10',`${x0}`,'20',`${y0}`,
        '10',`${x1}`,'20',`${y0}`,
        '10',`${x1}`,'20',`${y1}`,
        '10',`${x0}`,'20',`${y1}`,
      );
      const cx = x0 + w / 2, cy = y0 + h / 2;
      const ts = Math.min(w, h) * 0.06;
      lines.push('0','TEXT','8','0','10',`${cx}`,'20',`${cy + ts * 0.6}`,'40',`${ts}`,'1',`#${globalNum} ${w.toFixed(0)}×${h.toFixed(0)}mm`,'72','1','11',`${cx}`,'21',`${cy + ts * 0.6}`);
      lines.push('0','TEXT','8','0','10',`${cx}`,'20',`${cy - ts * 0.6}`,'40',`${ts * 0.8}`,'1',`${q + 1}/${qty} шт`,'72','1','11',`${cx}`,'21',`${cy - ts * 0.6}`);
      offsetX += w + 20;
      globalNum++;
    }
  }
  lines.push('0','ENDSEC','0','EOF');
  return lines.join('\n');
}

interface CanvasRect { x: number; y: number; w: number; h: number; label: string; num: number; }

function buildRects(entries: DimEntry[], unit: Unit): CanvasRect[] {
  const factor = UNIT_TO_MM[unit];
  const rects: CanvasRect[] = [];
  let offsetX = 0;
  let globalNum = 1;
  for (const entry of entries) {
    const w = parseFloat(entry.width) * factor;
    const h = parseFloat(entry.height) * factor;
    const qty = parseInt(entry.qty) || 1;
    if (!w || !h) continue;
    for (let q = 0; q < qty; q++) {
      rects.push({ x: offsetX, y: 0, w, h, label: `#${globalNum}  ${entry.width}×${entry.height} ${UNIT_LABELS[unit]}`, num: globalNum });
      offsetX += w + 20;
      globalNum++;
    }
  }
  return rects;
}

function DXFCanvas({ entries, unit }: { entries: DimEntry[]; unit: Unit }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rects = buildRects(entries, unit);
    if (rects.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const totalW = rects.reduce((m, r) => Math.max(m, r.x + r.w), 0);
    const totalH = rects.reduce((m, r) => Math.max(m, r.y + r.h), 0);

    const PAD = 40;
    const cw = canvas.offsetWidth || 800;
    const scaleX = (cw - PAD * 2) / totalW;
    const scaleY = (canvas.offsetHeight - PAD * 2) / totalH;
    const scale = Math.min(scaleX, scaleY, 2);

    canvas.width = cw;
    canvas.height = Math.max(200, totalH * scale + PAD * 2);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // background
    ctx.fillStyle = 'hsl(220,16%,8%)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // grid
    ctx.strokeStyle = 'hsl(195,100%,50%,0.05)';
    ctx.lineWidth = 0.5;
    const gridStep = 50 * scale;
    for (let x = PAD; x < canvas.width; x += gridStep) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = PAD; y < canvas.height; y += gridStep) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    const colors = [
      'hsl(195,100%,55%)', 'hsl(160,80%,50%)', 'hsl(45,100%,60%)',
      'hsl(280,70%,65%)', 'hsl(20,100%,60%)', 'hsl(340,80%,60%)',
    ];

    for (const rect of rects) {
      const sx = PAD + rect.x * scale;
      const sy = PAD + rect.y * scale;
      const sw = rect.w * scale;
      const sh = rect.h * scale;
      const color = colors[(rect.num - 1) % colors.length];

      // fill
      ctx.fillStyle = color.replace(')', ',0.06)').replace('hsl(', 'hsla(');
      ctx.fillRect(sx, sy, sw, sh);

      // border
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx, sy, sw, sh);

      // corner ticks
      const tick = Math.min(8, sw * 0.08, sh * 0.08);
      ctx.lineWidth = 2;
      [[sx, sy], [sx + sw, sy], [sx, sy + sh], [sx + sw, sy + sh]].forEach(([cx2, cy2], i) => {
        const dx = i % 2 === 0 ? 1 : -1;
        const dy = i < 2 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(cx2 + dx * tick, cy2); ctx.lineTo(cx2, cy2); ctx.lineTo(cx2, cy2 + dy * tick);
        ctx.stroke();
      });

      // label
      const cx2 = sx + sw / 2;
      const cy2 = sy + sh / 2;
      const fontSize = Math.max(9, Math.min(14, sw * 0.08, sh * 0.2));
      ctx.fillStyle = color;
      ctx.font = `600 ${fontSize}px "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (sw > 40 && sh > 24) {
        ctx.fillText(`#${rect.num}`, cx2, cy2 - fontSize * 0.7);
        ctx.font = `400 ${fontSize * 0.85}px "IBM Plex Mono", monospace`;
        ctx.fillStyle = color.replace(')', ',0.8)').replace('hsl(', 'hsla(');
        const dimLabel = `${rect.w.toFixed(0)}×${rect.h.toFixed(0)}`;
        ctx.fillText(dimLabel, cx2, cy2 + fontSize * 0.5);
      } else {
        ctx.fillText(`#${rect.num}`, cx2, cy2);
      }
    }

    // axis labels
    ctx.fillStyle = 'hsl(195,100%,50%,0.3)';
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`0`, PAD - 12, PAD - 14);
  }, [entries, unit]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', display: 'block', minHeight: 200 }}
    />
  );
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
  const fileInputRef2 = useRef<HTMLInputElement>(null);

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

  // Подсчёт площади
  const totalAreaMm2 = validEntries.reduce((sum, e) => {
    const w = parseFloat(e.width) * UNIT_TO_MM[unit];
    const h = parseFloat(e.height) * UNIT_TO_MM[unit];
    const qty = parseInt(e.qty) || 1;
    return sum + w * h * qty;
  }, 0);
  const totalAreaM2 = totalAreaMm2 / 1_000_000;
  const totalPieces = validEntries.reduce((s, e) => s + (parseInt(e.qty) || 1), 0);

  const handleGenerateAndPreview = () => {
    if (validEntries.length === 0) return;
    const dxf = generateDXF(validEntries, unit);
    setDxfContent(dxf);
  };

  const handleDownload = () => {
    if (!dxfContent) return;
    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frames_${validEntries.length}pos_${totalPieces}pcs.dxf`;
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

  // Автообновление превью при изменении entries/unit
  useEffect(() => {
    if (validEntries.length > 0) {
      const dxf = generateDXF(validEntries, unit);
      setDxfContent(dxf);
    }
  }, [entries, unit]);

  return (
    <div className="min-h-screen bg-background grid-bg flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border border-primary/60 rotate-45 flex items-center justify-center glow">
            <div className="w-1.5 h-1.5 bg-primary" />
          </div>
          <span className="font-mono text-sm text-primary tracking-widest uppercase glow-text">DXF Generator</span>
        </div>
        <div className="flex items-center gap-5">
          {([1, 2] as const).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-5 h-5 border font-mono text-xs flex items-center justify-center transition-all duration-300 ${step >= s ? 'border-primary bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground'}`}>
                {step > s ? '✓' : s}
              </div>
              <span className={`text-xs font-mono hidden sm:block transition-colors ${step >= s ? 'text-primary/80' : 'text-muted-foreground/40'}`}>
                {s === 1 ? 'ЗАГРУЗКА' : 'РЕДАКТОР'}
              </span>
            </div>
          ))}
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center p-4 overflow-hidden">

        {/* STEP 1 */}
        {step === 1 && (
          <div className="w-full max-w-lg mt-16 animate-fade-in">
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
                  <p className="font-mono text-sm text-foreground/80 mb-1">{isDragging ? 'ОТПУСТИТЕ' : 'ПЕРЕТАЩИТЕ ИЛИ НАЖМИТЕ'}</p>
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

        {/* STEP 2 — full page editor */}
        {step === 2 && (
          <div className="w-full animate-fade-in flex flex-col gap-4" style={{ height: 'calc(100vh - 64px)' }}>

            {/* Top: 3 columns */}
            <div className="grid gap-4 shrink-0" style={{ gridTemplateColumns: '1fr 1.1fr 1fr', height: 360 }}>

              {/* COL 1: Image */}
              <div className="border border-border/40 flex flex-col overflow-hidden">
                <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between shrink-0">
                  <span className="font-mono text-xs text-muted-foreground tracking-wider">ИЗОБРАЖЕНИЕ</span>
                  {imagePreview && (
                    <button onClick={() => fileInputRef2.current?.click()} className="font-mono text-xs text-primary/60 hover:text-primary transition-colors">ЗАМЕНИТЬ</button>
                  )}
                  <input ref={fileInputRef2} type="file" accept="image/*" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </div>
                <div className="flex-1 overflow-auto p-2">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Источник" className="w-full h-auto object-contain" />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-2 cursor-pointer"
                      onClick={() => fileInputRef2.current?.click()}>
                      <Icon name="Image" size={28} className="text-muted-foreground/25" />
                      <span className="font-mono text-xs text-muted-foreground/30">НЕТ ИЗОБРАЖЕНИЯ</span>
                    </div>
                  )}
                </div>
                {rawText && (
                  <div className="border-t border-border/30 px-3 py-2 max-h-20 overflow-auto shrink-0">
                    <p className="font-mono text-xs text-foreground/40 whitespace-pre-wrap leading-relaxed">{rawText}</p>
                  </div>
                )}
              </div>

              {/* COL 2: Entries list */}
              <div className="border border-border/40 flex flex-col overflow-hidden">
                <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between shrink-0">
                  <span className="font-mono text-xs text-muted-foreground tracking-wider">
                    ПОЗИЦИИ {isRecognizing ? <span className="text-primary animate-pulse ml-2">РАСПОЗНАЮ...</span> : null}
                  </span>
                  <div className="flex items-center gap-2">
                    {/* Unit selector inline */}
                    <div className="flex gap-1">
                      {(Object.keys(UNIT_LABELS) as Unit[]).map((u) => (
                        <button key={u} onClick={() => setUnit(u)}
                          className={`px-2 py-0.5 font-mono text-xs border transition-all duration-150 ${unit === u ? 'border-primary bg-primary/10 text-primary' : 'border-border/30 text-muted-foreground/50 hover:border-primary/30'}`}>
                          {u.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <button onClick={addEntry}
                      className="flex items-center gap-1 font-mono text-xs text-primary/70 hover:text-primary border border-primary/30 hover:border-primary/60 px-2 py-0.5 transition-colors">
                      <Icon name="Plus" size={11} />
                      ADD
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-2 space-y-1.5">
                  {isRecognizing ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="flex gap-1.5">
                        {[0,1,2].map(i => (
                          <div key={i} className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                        ))}
                      </div>
                    </div>
                  ) : entries.map((entry, idx) => {
                    const isActive = activeEntry === entry.id;
                    const ew = parseFloat(entry.width) * UNIT_TO_MM[unit];
                    const eh = parseFloat(entry.height) * UNIT_TO_MM[unit];
                    const qty = parseInt(entry.qty) || 1;
                    const entryValid = ew > 0 && eh > 0;
                    const areaMm2 = ew * eh * qty;

                    return (
                      <div key={entry.id} onClick={() => setActiveEntry(entry.id)}
                        className={`border p-2.5 cursor-pointer transition-all duration-150 ${isActive ? 'border-primary/60 bg-primary/5' : 'border-border/25 hover:border-border/50'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-primary/80">#{idx + 1}</span>
                            {entryValid && (
                              <span className="font-mono text-xs text-muted-foreground/60">
                                {(areaMm2 / 1_000_000).toFixed(4)} м²
                              </span>
                            )}
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); removeEntry(entry.id); }}
                            className="text-muted-foreground/25 hover:text-destructive transition-colors">
                            <Icon name="X" size={13} />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['width','height','qty'] as const).map((field) => (
                            <div key={field}>
                              <label className="font-mono text-xs text-muted-foreground/40 block mb-0.5">
                                {field === 'width' ? 'Ш' : field === 'height' ? 'В' : 'КОЛ'}
                              </label>
                              <input type="number" min={field === 'qty' ? '1' : undefined}
                                className="w-full bg-muted/20 border border-border/25 px-2 py-1 font-mono text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                                value={entry[field]}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => updateEntry(entry.id, field, e.target.value)}
                                placeholder={field === 'width' ? '753' : field === 'height' ? '497' : '1'}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* COL 3: Stats + actions */}
              <div className="border border-border/40 flex flex-col overflow-hidden">
                <div className="px-3 py-2 border-b border-border/30 shrink-0">
                  <span className="font-mono text-xs text-muted-foreground tracking-wider">СВОДКА</span>
                </div>
                <div className="flex-1 p-3 flex flex-col gap-3">
                  {/* Stats */}
                  <div className="space-y-2">
                    {[
                      { label: 'Позиций', value: String(validEntries.length) },
                      { label: 'Итого рамок', value: String(totalPieces) },
                      { label: 'Общая площадь', value: totalAreaM2 > 0 ? `${totalAreaM2.toFixed(4)} м²` : '—' },
                      { label: 'Площадь в мм²', value: totalAreaMm2 > 0 ? `${Math.round(totalAreaMm2).toLocaleString('ru')}` : '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/20">
                        <span className="font-mono text-xs text-muted-foreground/60">{label}</span>
                        <span className="font-mono text-sm text-primary/90 font-medium">{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Per-entry area breakdown */}
                  {validEntries.length > 0 && (
                    <div className="flex-1 overflow-auto">
                      <div className="font-mono text-xs text-muted-foreground/50 mb-1.5 tracking-wider">ПЛОЩАДЬ ПО ПОЗИЦИЯМ</div>
                      <div className="space-y-1">
                        {validEntries.map((e, idx) => {
                          const w = parseFloat(e.width) * UNIT_TO_MM[unit];
                          const h = parseFloat(e.height) * UNIT_TO_MM[unit];
                          const qty = parseInt(e.qty) || 1;
                          const area = (w * h * qty) / 1_000_000;
                          return (
                            <div key={e.id} className="flex items-center justify-between">
                              <span className="font-mono text-xs text-muted-foreground/50">#{idx + 1} {e.width}×{e.height} ×{qty}</span>
                              <span className="font-mono text-xs text-foreground/70">{area.toFixed(4)} м²</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 border-t border-border/30 space-y-2 shrink-0">
                  <button onClick={() => setStep(1)}
                    className="w-full py-2 border border-border/40 text-muted-foreground hover:border-primary/30 font-mono text-xs tracking-widest transition-all">
                    ← ЗАГРУЗИТЬ НОВОЕ
                  </button>
                  <button onClick={handleGenerateAndPreview} disabled={validEntries.length === 0}
                    className="w-full py-2.5 bg-primary text-primary-foreground font-mono text-xs tracking-widest hover:bg-primary/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed glow">
                    ОБНОВИТЬ ЧЕРТЁЖ ↓
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom: DXF Canvas preview */}
            <div className="border border-border/40 flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                  <span className="font-mono text-xs text-muted-foreground tracking-wider">ЧЕРТЁЖ DXF — ПРЕДПРОСМОТР</span>
                  {validEntries.length > 0 && (
                    <span className="font-mono text-xs text-primary/50">
                      {totalPieces} рамок · {totalAreaM2.toFixed(4)} м²
                    </span>
                  )}
                </div>
                <button
                  onClick={handleDownload}
                  disabled={!dxfContent}
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground font-mono text-xs tracking-widest hover:bg-primary/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed glow"
                >
                  <Icon name="Download" size={13} />
                  СКАЧАТЬ DXF
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                {validEntries.length > 0 ? (
                  <DXFCanvas entries={entries} unit={unit} />
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <Icon name="LayoutTemplate" size={32} className="text-muted-foreground/20 mx-auto mb-2" />
                      <span className="font-mono text-xs text-muted-foreground/30">ДОБАВЬТЕ ПОЗИЦИИ ЧТОБЫ УВИДЕТЬ ЧЕРТЁЖ</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </main>

      <footer className="border-t border-border/30 px-6 py-2 flex items-center justify-between shrink-0">
        <span className="font-mono text-xs text-muted-foreground/40">DXF GENERATOR v1.1</span>
        <span className="font-mono text-xs text-muted-foreground/40">AutoCAD R2000 · AC1015</span>
      </footer>
    </div>
  );
}
