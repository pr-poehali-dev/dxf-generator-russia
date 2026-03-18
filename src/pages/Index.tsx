import { useState, useRef, useCallback, useEffect } from 'react';
import Icon from '@/components/ui/icon';

type Unit = 'mm' | 'cm' | 'inch' | 'px';

interface DimEntry {
  id: string;
  width: string;
  height: string;
  qty: string;
}

interface LayoutSettings {
  gapX: number;   // отступ по горизонтали мм
  gapY: number;   // отступ по вертикали мм
  cols: number;   // колонок в ряд (0 = авто)
}

interface CanvasRect {
  x: number; y: number; w: number; h: number; num: number;
  wOrig: number; hOrig: number; unitLabel: string;
}

const UNIT_LABELS: Record<Unit, string> = { mm: 'мм', cm: 'см', inch: 'дюймы', px: 'пиксели' };
const UNIT_TO_MM: Record<Unit, number> = { mm: 1, cm: 10, inch: 25.4, px: 0.264583 };

function parseAllDimensions(text: string): DimEntry[] {
  const results: DimEntry[] = [];
  // Парсим построчно для лучшего качества
  const lines = text.split(/[\n\r]+/);
  let idx = 0;

  // Паттерн: 997 × 347 — 6 шт  (или x/х/X/×/*, тире/—/–, кол-во опционально)
  // Группа 1: ширина, Группа 2: высота, Группа 3: количество (опционально)
  const linePattern = /(\d{2,5}[.,]?\d*)\s*[xхXХ×*]\s*(\d{2,5}[.,]?\d*)(?:\s*[-—–=]\s*(\d+)\s*(?:шт\.?|pcs\.?|pc\.?|штук|штуки|ед\.?|шт)?)?/i;

  for (const line of lines) {
    const match = linePattern.exec(line);
    if (match) {
      const w = match[1].replace(',', '.');
      const h = match[2].replace(',', '.');
      if (parseFloat(w) > 0 && parseFloat(h) > 0) {
        // Ищем количество отдельно в строке если не нашли в паттерне
        let qty = match[3] || '';
        if (!qty) {
          const qtyMatch = line.match(/[-—–=]\s*(\d+)\s*(?:шт\.?|pcs\.?|pc\.?|штук|штуки|ед\.?)?/i);
          if (qtyMatch) qty = qtyMatch[1];
        }
        results.push({ id: String(idx++), width: w, height: h, qty: qty || '1' });
      }
    }
  }

  // Fallback: если построчный не дал результатов — весь текст одним регекспом
  if (results.length === 0) {
    const globalPattern = /(\d{2,5}[.,]?\d*)\s*[xхXХ×*]\s*(\d{2,5}[.,]?\d*)(?:\s*[-—–]?\s*(\d+)\s*(?:шт\.?|pcs\.?|pc\.?|штук|штуки|шт|ед\.?))?/gi;
    let m;
    while ((m = globalPattern.exec(text)) !== null) {
      const w = m[1].replace(',', '.');
      const h = m[2].replace(',', '.');
      if (parseFloat(w) > 0 && parseFloat(h) > 0) {
        results.push({ id: String(idx++), width: w, height: h, qty: m[3] || '1' });
      }
    }
  }

  return results;
}

function buildRects(entries: DimEntry[], unit: Unit, layout: LayoutSettings): CanvasRect[] {
  const factor = UNIT_TO_MM[unit];
  // Разворачиваем все экземпляры
  const all: { w: number; h: number; wOrig: number; hOrig: number }[] = [];
  for (const e of entries) {
    const w = parseFloat(e.width) * factor;
    const h = parseFloat(e.height) * factor;
    if (!w || !h) continue;
    const qty = parseInt(e.qty) || 1;
    for (let q = 0; q < qty; q++) all.push({ w, h, wOrig: parseFloat(e.width), hOrig: parseFloat(e.height) });
  }
  if (all.length === 0) return [];

  const cols = layout.cols > 0 ? layout.cols : Math.ceil(Math.sqrt(all.length));
  const rects: CanvasRect[] = [];

  let col = 0, row = 0;
  // Для каждой строки запоминаем maxH и offsetY
  const rowHeights: number[] = [];
  const rowOffsetY: number[] = [];
  // Для каждой колонки в строке запоминаем offsetX
  const colOffsets: number[] = [];

  let curX = 0, curY = 0;
  let rowMaxH = 0;

  for (let i = 0; i < all.length; i++) {
    const { w, h, wOrig, hOrig } = all[i];

    if (col === 0) curX = 0;

    rects.push({ x: curX, y: curY, w, h, num: i + 1, wOrig, hOrig, unitLabel: UNIT_LABELS[unit] });

    rowMaxH = Math.max(rowMaxH, h);
    curX += w + layout.gapX;
    col++;

    if (col >= cols) {
      rowHeights[row] = rowMaxH;
      rowOffsetY[row] = curY;
      curY += rowMaxH + layout.gapY;
      col = 0;
      row++;
      rowMaxH = 0;
      colOffsets[row] = 0;
    }
  }

  return rects;
}

function generateDXF(entries: DimEntry[], unit: Unit, layout: LayoutSettings): string {
  const rects = buildRects(entries, unit, layout);
  const lines: string[] = [
    '0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$INSUNITS','70','4','0','ENDSEC',
    '0','SECTION','2','TABLES','0','TABLE','2','LAYER','70','1',
    '0','LAYER','2','0','70','0','62','7','6','CONTINUOUS','0','ENDTAB','0','ENDSEC',
    '0','SECTION','2','ENTITIES',
  ];

  for (const r of rects) {
    lines.push('0','LWPOLYLINE','8','0','90','4','70','1',
      '10',`${r.x}`,'20',`${r.y}`,
      '10',`${r.x + r.w}`,'20',`${r.y}`,
      '10',`${r.x + r.w}`,'20',`${r.y + r.h}`,
      '10',`${r.x}`,'20',`${r.y + r.h}`,
    );
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const ts = Math.min(r.w, r.h) * 0.06;
    lines.push('0','TEXT','8','0','10',`${cx}`,'20',`${cy + ts * 0.6}`,'40',`${ts}`,'1',`#${r.num} ${r.wOrig}×${r.hOrig}${r.unitLabel}`,'72','1','11',`${cx}`,'21',`${cy + ts * 0.6}`);
  }

  lines.push('0','ENDSEC','0','EOF');
  return lines.join('\n');
}

const COLORS = [
  'hsl(195,100%,55%)', 'hsl(160,80%,50%)', 'hsl(45,100%,60%)',
  'hsl(280,70%,65%)', 'hsl(20,100%,60%)', 'hsl(340,80%,60%)',
  'hsl(60,90%,55%)', 'hsl(200,80%,60%)',
];

function DXFCanvas({ entries, unit, layout }: { entries: DimEntry[]; unit: Unit; layout: LayoutSettings }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rects = buildRects(entries, unit, layout);
    if (rects.length === 0) {
      canvas.width = canvas.offsetWidth || 800;
      canvas.height = 200;
      ctx.fillStyle = 'hsl(220,16%,8%)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const totalW = rects.reduce((m, r) => Math.max(m, r.x + r.w), 0);
    const totalH = rects.reduce((m, r) => Math.max(m, r.y + r.h), 0);

    const PAD = 48;
    const cw = canvas.offsetWidth || 800;
    const maxCanvasH = Math.max(300, window.innerHeight * 0.38);
    const scaleX = (cw - PAD * 2) / totalW;
    const scaleY = (maxCanvasH - PAD * 2) / totalH;
    const scale = Math.min(scaleX, scaleY, 3);

    canvas.width = cw;
    canvas.height = Math.max(220, totalH * scale + PAD * 2);

    ctx.fillStyle = 'hsl(220,16%,8%)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = 'rgba(0,220,255,0.04)';
    ctx.lineWidth = 0.5;
    const gridStep = Math.max(20, 50 * scale);
    for (let x = PAD; x < canvas.width; x += gridStep) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = PAD; y < canvas.height; y += gridStep) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

    // Origin cross
    ctx.strokeStyle = 'rgba(0,220,255,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(PAD, 0); ctx.lineTo(PAD, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, PAD); ctx.lineTo(canvas.width, PAD); ctx.stroke();
    ctx.setLineDash([]);

    // Dimension lines between rects (gap indicators)
    if (layout.gapX > 0 || layout.gapY > 0) {
      ctx.strokeStyle = 'rgba(0,220,255,0.12)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 3]);
      for (let i = 0; i < rects.length - 1; i++) {
        const a = rects[i], b = rects[i + 1];
        if (Math.abs(a.y - b.y) < 1) {
          const x1s = PAD + (a.x + a.w) * scale;
          const x2s = PAD + b.x * scale;
          const ym = PAD + (a.y + a.h / 2) * scale;
          ctx.beginPath(); ctx.moveTo(x1s, ym); ctx.lineTo(x2s, ym); ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }

    for (const rect of rects) {
      const sx = PAD + rect.x * scale;
      const sy = PAD + rect.y * scale;
      const sw = rect.w * scale;
      const sh = rect.h * scale;
      const color = COLORS[(rect.num - 1) % COLORS.length];

      // Fill
      ctx.fillStyle = color.replace('hsl(', 'hsla(').replace(')', ',0.07)');
      ctx.fillRect(sx, sy, sw, sh);

      // Border
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx, sy, sw, sh);

      // Corner ticks
      const tick = Math.max(4, Math.min(10, sw * 0.07, sh * 0.07));
      ctx.lineWidth = 2;
      [[sx, sy, 1, 1], [sx+sw, sy, -1, 1], [sx, sy+sh, 1, -1], [sx+sw, sy+sh, -1, -1]].forEach(([cx2, cy2, dx, dy]) => {
        ctx.beginPath();
        ctx.moveTo(cx2 + dx * tick, cy2); ctx.lineTo(cx2, cy2); ctx.lineTo(cx2, cy2 + dy * tick);
        ctx.stroke();
      });

      // Width dimension line (top)
      if (sh > 30) {
        ctx.strokeStyle = color.replace('hsl(', 'hsla(').replace(')', ',0.35)');
        ctx.lineWidth = 0.8;
        const arrowY = sy - 8;
        ctx.beginPath(); ctx.moveTo(sx + 4, arrowY); ctx.lineTo(sx + sw - 4, arrowY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx, arrowY - 3); ctx.lineTo(sx, arrowY + 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx + sw, arrowY - 3); ctx.lineTo(sx + sw, arrowY + 3); ctx.stroke();
      }

      // Label
      const cx2 = sx + sw / 2;
      const cy2 = sy + sh / 2;
      const fontSize = Math.max(8, Math.min(13, sw * 0.1, sh * 0.22));

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (sw > 30 && sh > 20) {
        // num
        ctx.fillStyle = color;
        ctx.font = `700 ${fontSize}px "IBM Plex Mono", monospace`;
        ctx.fillText(`#${rect.num}`, cx2, sh > 40 ? cy2 - fontSize * 0.8 : cy2);

        // dims
        if (sh > 40 && sw > 50) {
          ctx.font = `400 ${fontSize * 0.82}px "IBM Plex Mono", monospace`;
          ctx.fillStyle = color.replace('hsl(', 'hsla(').replace(')', ',0.75)');
          ctx.fillText(`${rect.wOrig}×${rect.hOrig}`, cx2, cy2 + fontSize * 0.5);
        }

        // top dimension label
        if (sh > 30) {
          ctx.font = `400 ${Math.max(7, fontSize * 0.75)}px "IBM Plex Mono", monospace`;
          ctx.fillStyle = color.replace('hsl(', 'hsla(').replace(')', ',0.5)');
          ctx.fillText(`${rect.w.toFixed(0)}mm`, cx2, sy - 12);
        }
      }
    }

    // Origin label
    ctx.fillStyle = 'rgba(0,220,255,0.25)';
    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('0,0', PAD + 3, PAD + 3);

  }, [entries, unit, layout]);

  return <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} />;
}

export default function Index() {
  const [step, setStep] = useState<1 | 2>(1);
  const [isDragging, setIsDragging] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [rawText, setRawText] = useState('');
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [entries, setEntries] = useState<DimEntry[]>([]);
  const [unit, setUnit] = useState<Unit>('mm');
  const [dxfContent, setDxfContent] = useState('');
  const [activeEntry, setActiveEntry] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutSettings>({ gapX: 10, gapY: 10, cols: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);

  const OCR_URL = 'https://functions.poehali.dev/33370e84-0eb8-4c96-b594-e0c1681e8dca';

  const runOCR = async (imageBase64: string): Promise<string> => {
    const resp = await fetch(OCR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 })
    });
    const data = await resp.json();
    return data.text || '';
  };

  const recognizeImage = async (imageUrl: string) => {
    setIsRecognizing(true);
    try {
      const text = await runOCR(imageUrl);
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
    reader.onload = async (e) => {
      const url = e.target?.result as string;
      setImagePreview(url);
      setStep(2);
      setIsRecognizing(true);
      try {
        const text = await runOCR(url);
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
    reader.readAsDataURL(file);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const updateEntry = (id: string, field: keyof DimEntry, value: string) =>
    setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));

  const addEntry = () => {
    const newId = String(Date.now());
    setEntries(prev => [...prev, { id: newId, width: '', height: '', qty: '1' }]);
    setActiveEntry(newId);
  };

  const removeEntry = (id: string) =>
    setEntries(prev => { const n = prev.filter(e => e.id !== id); return n.length > 0 ? n : [{ id: '0', width: '', height: '', qty: '1' }]; });

  const validEntries = entries.filter(e => parseFloat(e.width) > 0 && parseFloat(e.height) > 0);
  const totalPieces = validEntries.reduce((s, e) => s + (parseInt(e.qty) || 1), 0);
  const totalAreaMm2 = validEntries.reduce((sum, e) => {
    const w = parseFloat(e.width) * UNIT_TO_MM[unit];
    const h = parseFloat(e.height) * UNIT_TO_MM[unit];
    return sum + w * h * (parseInt(e.qty) || 1);
  }, 0);

  useEffect(() => {
    if (validEntries.length > 0) setDxfContent(generateDXF(validEntries, unit, layout));
  }, [entries, unit, layout]);

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

  const setGap = (axis: 'gapX' | 'gapY', val: string) => setLayout(l => ({ ...l, [axis]: Math.max(0, parseFloat(val) || 0) }));
  const setCols = (val: string) => setLayout(l => ({ ...l, cols: Math.max(0, parseInt(val) || 0) }));

  return (
    <div className="min-h-screen bg-background grid-bg flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <header className="border-b border-border/50 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border border-primary/60 rotate-45 flex items-center justify-center glow">
            <div className="w-1.5 h-1.5 bg-primary" />
          </div>
          <span className="font-mono text-sm text-primary tracking-widest uppercase glow-text">DXF Generator</span>
        </div>
        {step === 2 && validEntries.length > 0 && (
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-muted-foreground/60">
              {validEntries.length} поз · {totalPieces} рамок · {(totalAreaMm2 / 1_000_000).toFixed(4)} м²
            </span>
            <button onClick={handleDownload} disabled={!dxfContent}
              className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground font-mono text-xs tracking-widest hover:bg-primary/90 transition-all disabled:opacity-30 glow">
              <Icon name="Download" size={13} />
              СКАЧАТЬ DXF
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-hidden flex flex-col">

        {/* STEP 1 */}
        {step === 1 && (
          <div className="flex-1 flex items-center justify-center p-4 animate-fade-in">
            <div className="w-full max-w-lg">
              <div className="mb-8 text-center">
                <h1 className="font-mono text-2xl text-foreground mb-2 tracking-tight">Загрузите изображение</h1>
                <p className="text-muted-foreground text-sm">Фото с размерами, рукописный текст — распознаю все позиции автоматически</p>
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
                className="mt-4 w-full py-3 border border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground font-mono text-xs tracking-widest transition-all">
                ВВЕСТИ РАЗМЕРЫ ВРУЧНУЮ →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="flex-1 overflow-hidden flex flex-col animate-fade-in">

            {/* Top row: 3 panels */}
            <div className="grid shrink-0 gap-3 p-3 pb-0" style={{ gridTemplateColumns: '1fr 1.1fr 0.9fr', height: 340 }}>

              {/* Panel 1: Image */}
              <div className="border border-border/40 flex flex-col overflow-hidden">
                <div className="px-3 py-1.5 border-b border-border/30 flex items-center justify-between shrink-0">
                  <span className="font-mono text-xs text-muted-foreground/70 tracking-wider">ИЗОБРАЖЕНИЕ</span>
                  <button onClick={() => fileInputRef2.current?.click()} className="font-mono text-xs text-primary/50 hover:text-primary transition-colors">
                    {imagePreview ? 'ЗАМЕНИТЬ' : 'ЗАГРУЗИТЬ'}
                  </button>
                  <input ref={fileInputRef2} type="file" accept="image/*" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </div>
                <div className="flex-1 overflow-auto p-2">
                  {imagePreview
                    ? <img src={imagePreview} alt="Источник" className="w-full h-auto object-contain" />
                    : <div className="h-full flex flex-col items-center justify-center gap-2 cursor-pointer opacity-30" onClick={() => fileInputRef2.current?.click()}>
                        <Icon name="Image" size={24} className="text-muted-foreground" />
                        <span className="font-mono text-xs text-muted-foreground">НЕТ ИЗОБРАЖЕНИЯ</span>
                      </div>
                  }
                </div>
                {rawText && (
                  <div className="border-t border-border/25 px-2 py-1.5 max-h-24 overflow-auto shrink-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs text-muted-foreground/40">OCR ТЕКСТ</span>
                      {validEntries.length === 0 && (
                        <span className="font-mono text-xs text-yellow-500/70">размеры не найдены — введи вручную</span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-foreground/40 whitespace-pre-wrap leading-relaxed">{rawText}</p>
                  </div>
                )}
                {!rawText && !isRecognizing && imagePreview && (
                  <div className="border-t border-border/25 px-2 py-1.5 shrink-0">
                    <span className="font-mono text-xs text-yellow-500/70">OCR не нашёл текст — введи размеры вручную</span>
                  </div>
                )}
              </div>

              {/* Panel 2: Entries */}
              <div className="border border-border/40 flex flex-col overflow-hidden">
                <div className="px-3 py-1.5 border-b border-border/30 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground/70 tracking-wider">ПОЗИЦИИ</span>
                    {isRecognizing && <span className="font-mono text-xs text-primary animate-pulse">РАСПОЗНАЮ...</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex gap-0.5">
                      {(Object.keys(UNIT_LABELS) as Unit[]).map((u) => (
                        <button key={u} onClick={() => setUnit(u)}
                          className={`px-1.5 py-0.5 font-mono text-xs border transition-all ${unit === u ? 'border-primary bg-primary/10 text-primary' : 'border-border/25 text-muted-foreground/50 hover:border-primary/30'}`}>
                          {u.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <button onClick={addEntry}
                      className="flex items-center gap-1 font-mono text-xs text-primary/60 hover:text-primary border border-primary/25 hover:border-primary/50 px-1.5 py-0.5 transition-colors">
                      <Icon name="Plus" size={10} />+
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-1.5 space-y-1">
                  {isRecognizing
                    ? <div className="h-full flex items-center justify-center gap-1.5">
                        {[0,1,2].map(i => <div key={i} className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: `${i*0.2}s` }} />)}
                      </div>
                    : entries.map((entry, idx) => {
                        const isActive = activeEntry === entry.id;
                        const ew = parseFloat(entry.width) * UNIT_TO_MM[unit];
                        const eh = parseFloat(entry.height) * UNIT_TO_MM[unit];
                        const qty = parseInt(entry.qty) || 1;
                        const areaMm2 = ew * eh * qty;
                        return (
                          <div key={entry.id} onClick={() => setActiveEntry(entry.id)}
                            className={`border p-2 cursor-pointer transition-all duration-150 ${isActive ? 'border-primary/50 bg-primary/5' : 'border-border/20 hover:border-border/40'}`}>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold" style={{ color: COLORS[idx % COLORS.length] }}>#{idx + 1}</span>
                                {ew > 0 && eh > 0 && <span className="font-mono text-xs text-muted-foreground/50">{(areaMm2/1_000_000).toFixed(4)} м²</span>}
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); removeEntry(entry.id); }}
                                className="text-muted-foreground/25 hover:text-destructive transition-colors">
                                <Icon name="X" size={12} />
                              </button>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              {(['width','height','qty'] as const).map(field => (
                                <div key={field}>
                                  <label className="font-mono text-xs text-muted-foreground/35 block mb-0.5">
                                    {field === 'width' ? 'ШИР' : field === 'height' ? 'ВЫС' : 'КОЛ'}
                                  </label>
                                  <input type="number" min={field === 'qty' ? '1' : undefined}
                                    className="w-full bg-muted/15 border border-border/20 px-1.5 py-1 font-mono text-sm text-foreground focus:outline-none focus:border-primary/40 transition-colors"
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
                      })
                  }
                </div>
              </div>

              {/* Panel 3: Stats + Layout settings */}
              <div className="border border-border/40 flex flex-col overflow-hidden">
                <div className="px-3 py-1.5 border-b border-border/30 shrink-0">
                  <span className="font-mono text-xs text-muted-foreground/70 tracking-wider">ПАРАМЕТРЫ</span>
                </div>
                <div className="flex-1 overflow-auto p-3 space-y-4">

                  {/* Stats */}
                  <div className="space-y-1.5">
                    {[
                      { label: 'Позиций', value: String(validEntries.length) },
                      { label: 'Итого рамок', value: String(totalPieces) },
                      { label: 'Площадь', value: totalAreaMm2 > 0 ? `${(totalAreaMm2/1_000_000).toFixed(4)} м²` : '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between py-1 border-b border-border/15">
                        <span className="font-mono text-xs text-muted-foreground/50">{label}</span>
                        <span className="font-mono text-sm text-primary/90 font-medium">{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Layout settings */}
                  <div>
                    <div className="font-mono text-xs text-muted-foreground/50 tracking-wider mb-2">РАСПОЛОЖЕНИЕ</div>
                    <div className="space-y-2">
                      <div>
                        <label className="font-mono text-xs text-muted-foreground/40 block mb-1">ОТСТУП Г (мм)</label>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setGap('gapX', String(Math.max(0, layout.gapX - 5)))} className="w-6 h-6 border border-border/30 text-muted-foreground hover:border-primary/40 font-mono text-xs flex items-center justify-center">−</button>
                          <input type="number" min="0"
                            className="flex-1 bg-muted/15 border border-border/20 px-2 py-1 font-mono text-sm text-foreground text-center focus:outline-none focus:border-primary/40"
                            value={layout.gapX}
                            onChange={(e) => setGap('gapX', e.target.value)} />
                          <button onClick={() => setGap('gapX', String(layout.gapX + 5))} className="w-6 h-6 border border-border/30 text-muted-foreground hover:border-primary/40 font-mono text-xs flex items-center justify-center">+</button>
                        </div>
                      </div>
                      <div>
                        <label className="font-mono text-xs text-muted-foreground/40 block mb-1">ОТСТУП В (мм)</label>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setGap('gapY', String(Math.max(0, layout.gapY - 5)))} className="w-6 h-6 border border-border/30 text-muted-foreground hover:border-primary/40 font-mono text-xs flex items-center justify-center">−</button>
                          <input type="number" min="0"
                            className="flex-1 bg-muted/15 border border-border/20 px-2 py-1 font-mono text-sm text-foreground text-center focus:outline-none focus:border-primary/40"
                            value={layout.gapY}
                            onChange={(e) => setGap('gapY', e.target.value)} />
                          <button onClick={() => setGap('gapY', String(layout.gapY + 5))} className="w-6 h-6 border border-border/30 text-muted-foreground hover:border-primary/40 font-mono text-xs flex items-center justify-center">+</button>
                        </div>
                      </div>
                      <div>
                        <label className="font-mono text-xs text-muted-foreground/40 block mb-1">КОЛОНОК В РЯД <span className="text-muted-foreground/30">(0 = авто)</span></label>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setCols(String(Math.max(0, layout.cols - 1)))} className="w-6 h-6 border border-border/30 text-muted-foreground hover:border-primary/40 font-mono text-xs flex items-center justify-center">−</button>
                          <input type="number" min="0"
                            className="flex-1 bg-muted/15 border border-border/20 px-2 py-1 font-mono text-sm text-foreground text-center focus:outline-none focus:border-primary/40"
                            value={layout.cols}
                            onChange={(e) => setCols(e.target.value)} />
                          <button onClick={() => setCols(String(layout.cols + 1))} className="w-6 h-6 border border-border/30 text-muted-foreground hover:border-primary/40 font-mono text-xs flex items-center justify-center">+</button>
                        </div>
                        <div className="mt-1.5 flex gap-1 flex-wrap">
                          {[0,2,3,4,5].map(n => (
                            <button key={n} onClick={() => setCols(String(n))}
                              className={`px-2 py-0.5 font-mono text-xs border transition-all ${layout.cols === n ? 'border-primary bg-primary/10 text-primary' : 'border-border/25 text-muted-foreground/40 hover:border-primary/30'}`}>
                              {n === 0 ? 'авто' : `${n}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Per-entry area */}
                  {validEntries.length > 0 && (
                    <div>
                      <div className="font-mono text-xs text-muted-foreground/40 tracking-wider mb-1.5">ПО ПОЗИЦИЯМ</div>
                      <div className="space-y-0.5">
                        {validEntries.map((e, idx) => {
                          const w = parseFloat(e.width) * UNIT_TO_MM[unit];
                          const h = parseFloat(e.height) * UNIT_TO_MM[unit];
                          const qty = parseInt(e.qty) || 1;
                          return (
                            <div key={e.id} className="flex items-center justify-between">
                              <span className="font-mono text-xs" style={{ color: COLORS[idx % COLORS.length] + 'aa' }}>
                                #{idx+1} {e.width}×{e.height}×{qty}
                              </span>
                              <span className="font-mono text-xs text-foreground/50">
                                {((w * h * qty) / 1_000_000).toFixed(4)}м²
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-2 border-t border-border/25 shrink-0">
                  <button onClick={() => { setStep(1); setImagePreview(null); setRawText(''); setEntries([]); }}
                    className="w-full py-1.5 border border-border/30 text-muted-foreground/60 hover:border-primary/30 font-mono text-xs tracking-widest transition-all">
                    ← НОВОЕ ИЗОБРАЖЕНИЕ
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom: canvas */}
            <div className="flex-1 border border-border/40 m-3 mt-3 overflow-hidden flex flex-col min-h-0">
              <div className="px-3 py-1.5 border-b border-border/30 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                  <span className="font-mono text-xs text-muted-foreground/70 tracking-wider">ЧЕРТЁЖ — ПРЕДПРОСМОТР</span>
                  {validEntries.length > 0 && (
                    <span className="font-mono text-xs text-muted-foreground/40">
                      {totalPieces} рамок · {layout.cols > 0 ? `${layout.cols} кол.` : 'авто'} · отступ {layout.gapX}×{layout.gapY}мм
                    </span>
                  )}
                </div>
                <button onClick={handleDownload} disabled={!dxfContent}
                  className="flex items-center gap-2 px-3 py-1 bg-primary text-primary-foreground font-mono text-xs tracking-widest hover:bg-primary/90 transition-all disabled:opacity-30 glow">
                  <Icon name="Download" size={12} />
                  СКАЧАТЬ DXF
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                {validEntries.length > 0
                  ? <DXFCanvas entries={entries} unit={unit} layout={layout} />
                  : <div className="h-full flex items-center justify-center">
                      <div className="text-center opacity-30">
                        <Icon name="LayoutTemplate" size={28} className="text-muted-foreground mx-auto mb-2" />
                        <span className="font-mono text-xs text-muted-foreground">ДОБАВЬТЕ ПОЗИЦИИ</span>
                      </div>
                    </div>
                }
              </div>
            </div>

          </div>
        )}
      </main>

      <footer className="border-t border-border/30 px-6 py-2 flex items-center justify-between shrink-0">
        <span className="font-mono text-xs text-muted-foreground/30">DXF GENERATOR v1.2</span>
        <span className="font-mono text-xs text-muted-foreground/30">AutoCAD R2000 · AC1015</span>
      </footer>
    </div>
  );
}