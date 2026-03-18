import { useRef } from 'react';
import Icon from '@/components/ui/icon';
import { DimEntry, Unit, LayoutSettings, UNIT_LABELS, UNIT_TO_MM, COLORS } from './types';
import DXFCanvas from './DXFCanvas';

interface StepEditorProps {
  imagePreview: string | null;
  rawText: string;
  ocrError: string;
  isRecognizing: boolean;
  entries: DimEntry[];
  setEntries: React.Dispatch<React.SetStateAction<DimEntry[]>>;
  unit: Unit;
  setUnit: (u: Unit) => void;
  layout: LayoutSettings;
  setLayout: React.Dispatch<React.SetStateAction<LayoutSettings>>;
  activeEntry: string | null;
  setActiveEntry: (id: string | null) => void;
  dxfContent: string;
  validEntries: DimEntry[];
  totalPieces: number;
  totalAreaMm2: number;
  handleFile: (file: File) => void;
  handleDownload: () => void;
  setStep: (s: 1 | 2) => void;
  setImagePreview: (v: string | null) => void;
  setRawText: (v: string) => void;
}

export default function StepEditor({
  imagePreview, rawText, ocrError, isRecognizing,
  entries, setEntries, unit, setUnit,
  layout, setLayout, activeEntry, setActiveEntry,
  dxfContent, validEntries, totalPieces, totalAreaMm2,
  handleFile, handleDownload,
  setStep, setImagePreview, setRawText,
}: StepEditorProps) {
  const fileInputRef2 = useRef<HTMLInputElement>(null);

  const updateEntry = (id: string, field: keyof DimEntry, value: string) =>
    setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));

  const addEntry = () => {
    const newId = String(Date.now());
    setEntries(prev => [...prev, { id: newId, width: '', height: '', qty: '1' }]);
    setActiveEntry(newId);
  };

  const removeEntry = (id: string) =>
    setEntries(prev => { const n = prev.filter(e => e.id !== id); return n.length > 0 ? n : [{ id: '0', width: '', height: '', qty: '1' }]; });

  const setGap = (axis: 'gapX' | 'gapY', val: string) => setLayout(l => ({ ...l, [axis]: Math.max(0, parseFloat(val) || 0) }));
  const setCols = (val: string) => setLayout(l => ({ ...l, cols: Math.max(0, parseInt(val) || 0) }));

  return (
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
          {ocrError && (
            <div className="border-t border-border/25 px-2 py-1.5 shrink-0">
              <span className="font-mono text-xs text-red-400/80">{ocrError}</span>
            </div>
          )}
          {rawText && !ocrError && (
            <div className="border-t border-border/25 px-2 py-1.5 max-h-24 overflow-auto shrink-0">
              <p className="font-mono text-xs text-foreground/40 whitespace-pre-wrap leading-relaxed">{rawText}</p>
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
  );
}
