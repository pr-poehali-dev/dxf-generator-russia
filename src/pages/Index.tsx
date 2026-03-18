import { useState, useRef, useCallback } from 'react';
import Icon from '@/components/ui/icon';

type Unit = 'mm' | 'cm' | 'inch' | 'px';

interface Dimensions {
  width: string;
  height: string;
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

function parseDimensions(text: string): Dimensions {
  const cleaned = text.replace(/[^\d.,x×Xs]/g, ' ').trim();
  const patterns: RegExp[] = [
    /(\d+[.,]?\d*)\s*[x×X]\s*(\d+[.,]?\d*)/,
    /(\d+[.,]?\d*)\s+(\d+[.,]?\d*)/,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match[2]) return { width: match[1].replace(',', '.'), height: match[2].replace(',', '.') };
  }

  const allNums = [...cleaned.matchAll(/(\d+[.,]?\d*)/g)].map(m => m[1]);
  if (allNums.length >= 2) return { width: allNums[0].replace(',', '.'), height: allNums[1].replace(',', '.') };

  return { width: '', height: '' };
}

function generateDXF(widthMm: number, heightMm: number): string {
  const lines: string[] = [];

  const header = [
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
  lines.push(...header);

  const x0 = 0, y0 = 0, x1 = widthMm, y1 = heightMm;

  const rect = [
    '0', 'LWPOLYLINE',
    '8', '0',
    '90', '4',
    '70', '1',
    '10', `${x0}`, '20', `${y0}`,
    '10', `${x1}`, '20', `${y0}`,
    '10', `${x1}`, '20', `${y1}`,
    '10', `${x0}`, '20', `${y1}`,
  ];
  lines.push(...rect);

  const cx = widthMm / 2;
  const textSize = Math.min(widthMm, heightMm) * 0.05;

  const dimText = [
    '0', 'TEXT',
    '8', '0',
    '10', `${cx}`, '20', `${-textSize * 2}`,
    '40', `${textSize}`,
    '1', `${widthMm.toFixed(2)} x ${heightMm.toFixed(2)} mm`,
    '72', '1',
    '11', `${cx}`, '21', `${-textSize * 2}`,
  ];
  lines.push(...dimText);

  lines.push('0', 'ENDSEC', '0', 'EOF');

  return lines.join('\n');
}

export default function Index() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isDragging, setIsDragging] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [recognizedText, setRecognizedText] = useState('');
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [dimensions, setDimensions] = useState<Dimensions>({ width: '', height: '' });
  const [unit, setUnit] = useState<Unit>('mm');
  const [dxfContent, setDxfContent] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const recognizeImage = async (imageUrl: string) => {
    setIsRecognizing(true);
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('rus+eng');
      const { data: { text } } = await worker.recognize(imageUrl);
      await worker.terminate();
      setRecognizedText(text.trim());
      const dims = parseDimensions(text);
      setDimensions(dims);
    } catch {
      setRecognizedText('Не удалось распознать текст. Введите размеры вручную.');
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

  const handleGenerate = () => {
    const w = parseFloat(dimensions.width);
    const h = parseFloat(dimensions.height);
    if (!w || !h) return;
    const factor = UNIT_TO_MM[unit];
    const dxf = generateDXF(w * factor, h * factor);
    setDxfContent(dxf);
    setStep(3);
  };

  const handleDownload = () => {
    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frame_${dimensions.width}x${dimensions.height}${unit}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setStep(1);
    setImagePreview(null);
    setRecognizedText('');
    setDimensions({ width: '', height: '' });
    setDxfContent('');
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const wMm = parseFloat(dimensions.width) * UNIT_TO_MM[unit];
  const hMm = parseFloat(dimensions.height) * UNIT_TO_MM[unit];
  const isValid = !isNaN(wMm) && !isNaN(hMm) && wMm > 0 && hMm > 0;

  const maxPreviewW = 300;
  const maxPreviewH = 180;
  const aspect = isValid ? wMm / hMm : 1;
  const previewW = aspect >= 1 ? maxPreviewW : maxPreviewH * aspect;
  const previewH = aspect >= 1 ? maxPreviewW / aspect : maxPreviewH;

  return (
    <div className="min-h-screen bg-background grid-bg flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 px-6 py-4 flex items-center justify-between animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 border border-primary/60 rotate-45 flex items-center justify-center glow">
            <div className="w-2 h-2 bg-primary" />
          </div>
          <span className="font-mono text-sm text-primary tracking-widest uppercase glow-text">DXF Generator</span>
        </div>
        <div className="flex items-center gap-6">
          {([1, 2, 3] as const).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-5 h-5 border font-mono text-xs flex items-center justify-center transition-all duration-300 ${step >= s ? 'border-primary bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground'}`}>
                {step > s ? '✓' : s}
              </div>
              <span className={`text-xs font-mono hidden sm:block transition-colors duration-300 ${step >= s ? 'text-primary/80' : 'text-muted-foreground/50'}`}>
                {s === 1 ? 'ЗАГРУЗКА' : s === 2 ? 'ПАРАМЕТРЫ' : 'РЕЗУЛЬТАТ'}
              </span>
            </div>
          ))}
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">

        {/* STEP 1 */}
        {step === 1 && (
          <div className="w-full max-w-lg animate-fade-in">
            <div className="mb-8 text-center">
              <h1 className="font-mono text-2xl text-foreground mb-2 tracking-tight">Загрузите изображение</h1>
              <p className="text-muted-foreground text-sm">Фото с размерами, рукописный текст или чертёж — распознаю автоматически</p>
            </div>

            <div
              className={`relative border-2 border-dashed rounded-sm p-12 text-center cursor-crosshair transition-all duration-300 ${isDragging ? 'border-primary bg-primary/5 glow' : 'border-border/40 hover:border-primary/40 hover:bg-muted/20'}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <div className="flex flex-col items-center gap-4">
                <div className={`w-16 h-16 border border-primary/30 flex items-center justify-center transition-all duration-300 ${isDragging ? 'border-primary scale-110' : ''}`}>
                  <Icon name="Upload" size={28} className="text-primary/60" />
                </div>
                <div>
                  <p className="font-mono text-sm text-foreground/80 mb-1">
                    {isDragging ? 'ОТПУСТИТЕ ДЛЯ ЗАГРУЗКИ' : 'ПЕРЕТАЩИТЕ ИЛИ НАЖМИТЕ'}
                  </p>
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
              <span className="font-mono text-xs text-muted-foreground/50">или введите вручную</span>
              <div className="flex-1 h-px bg-border/30" />
            </div>

            <button
              onClick={() => setStep(2)}
              className="mt-4 w-full py-3 border border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground font-mono text-xs tracking-widest transition-all duration-200"
            >
              ВВЕСТИ РАЗМЕРЫ ВРУЧНУЮ →
            </button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="w-full max-w-2xl animate-fade-in">
            <div className="mb-6">
              <h1 className="font-mono text-2xl text-foreground mb-1 tracking-tight">Параметры рамки</h1>
              <p className="text-muted-foreground text-sm">Проверьте и скорректируйте распознанные размеры</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                {imagePreview && (
                  <div className="relative border border-border/40 overflow-hidden">
                    <img src={imagePreview} alt="Источник" className="w-full h-40 object-cover" />
                    <div className="absolute top-1 right-1 bg-background/80 px-2 py-0.5 font-mono text-xs text-primary/60">ИСТОЧНИК</div>
                  </div>
                )}
                <div className="border border-border/40">
                  <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground tracking-wider">РАСПОЗНАННЫЙ ТЕКСТ</span>
                    {isRecognizing && (
                      <span className="font-mono text-xs text-primary animate-pulse">ОБРАБОТКА...</span>
                    )}
                  </div>
                  <textarea
                    className="w-full bg-transparent p-3 font-mono text-xs text-foreground/80 resize-none focus:outline-none min-h-[80px] placeholder:text-muted-foreground/30"
                    value={recognizedText}
                    onChange={(e) => {
                      setRecognizedText(e.target.value);
                      const dims = parseDimensions(e.target.value);
                      if (dims.width || dims.height) setDimensions(dims);
                    }}
                    placeholder="Текст с изображения появится здесь..."
                    disabled={isRecognizing}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="border border-border/40">
                  <div className="px-3 py-2 border-b border-border/30">
                    <span className="font-mono text-xs text-muted-foreground tracking-wider">ЕДИНИЦЫ ИЗМЕРЕНИЯ</span>
                  </div>
                  <div className="p-3 grid grid-cols-2 gap-2">
                    {(Object.keys(UNIT_LABELS) as Unit[]).map((u) => (
                      <button
                        key={u}
                        onClick={() => setUnit(u)}
                        className={`py-2 font-mono text-xs tracking-wider border transition-all duration-200 ${unit === u ? 'border-primary bg-primary/10 text-primary' : 'border-border/30 text-muted-foreground hover:border-primary/30 hover:text-foreground/70'}`}
                      >
                        {UNIT_LABELS[u].toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border border-border/40">
                  <div className="px-3 py-2 border-b border-border/30">
                    <span className="font-mono text-xs text-muted-foreground tracking-wider">РАЗМЕРЫ</span>
                  </div>
                  <div className="p-3 space-y-3">
                    <div>
                      <label className="font-mono text-xs text-muted-foreground/60 block mb-1">ШИРИНА ({UNIT_LABELS[unit].toUpperCase()})</label>
                      <input
                        type="number"
                        className="w-full bg-muted/30 border border-border/40 px-3 py-2 font-mono text-lg text-foreground focus:outline-none focus:border-primary/60 transition-colors"
                        value={dimensions.width}
                        onChange={(e) => setDimensions(d => ({ ...d, width: e.target.value }))}
                        placeholder="758"
                      />
                    </div>
                    <div className="flex items-center justify-center">
                      <span className="text-primary/40 font-mono text-lg">×</span>
                    </div>
                    <div>
                      <label className="font-mono text-xs text-muted-foreground/60 block mb-1">ВЫСОТА ({UNIT_LABELS[unit].toUpperCase()})</label>
                      <input
                        type="number"
                        className="w-full bg-muted/30 border border-border/40 px-3 py-2 font-mono text-lg text-foreground focus:outline-none focus:border-primary/60 transition-colors"
                        value={dimensions.height}
                        onChange={(e) => setDimensions(d => ({ ...d, height: e.target.value }))}
                        placeholder="396"
                      />
                    </div>
                  </div>
                </div>

                {isValid && (
                  <div className="border border-primary/20 bg-primary/5 px-3 py-2 font-mono text-xs text-primary/80 animate-fade-in">
                    → {wMm.toFixed(2)} × {hMm.toFixed(2)} мм в DXF
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-3 border border-border/40 text-muted-foreground hover:border-primary/30 hover:text-foreground font-mono text-xs tracking-widest transition-all duration-200"
              >
                ← НАЗАД
              </button>
              <button
                onClick={handleGenerate}
                disabled={!isValid}
                className="flex-1 py-3 bg-primary text-primary-foreground font-mono text-sm tracking-widest hover:bg-primary/90 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed glow"
              >
                СГЕНЕРИРОВАТЬ DXF →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="w-full max-w-lg animate-fade-in">
            <div className="mb-8 text-center">
              <div className="inline-flex items-center gap-2 text-primary font-mono text-xs tracking-widest mb-4">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                DXF ФАЙЛ ГОТОВ
              </div>
              <h1 className="font-mono text-2xl text-foreground mb-2 tracking-tight">Рамка сгенерирована</h1>
              <p className="text-muted-foreground text-sm font-mono">
                {dimensions.width} × {dimensions.height} {UNIT_LABELS[unit]}
                {' '} → {' '}
                {wMm.toFixed(2)} × {hMm.toFixed(2)} мм
              </p>
            </div>

            {/* Preview */}
            <div className="border border-border/40 p-8 mb-6 flex items-center justify-center bg-muted/10 min-h-[240px]">
              <div className="relative mt-2" style={{ width: previewW, height: previewH }}>
                <div
                  className="absolute inset-0 border-2 border-primary/70 animate-pulse-border"
                  style={{
                    boxShadow: '0 0 16px hsl(195 100% 50% / 0.2), inset 0 0 16px hsl(195 100% 50% / 0.04)',
                  }}
                />
                {/* Corner ticks */}
                <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-primary" />
                <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-primary" />
                <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-primary" />
                <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-primary" />
                {/* Center cross */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-px h-5 bg-primary/25" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="h-px w-5 bg-primary/25" />
                </div>
                {/* Width label */}
                <div className="absolute -bottom-7 left-0 right-0 text-center font-mono text-xs text-primary/50">
                  {wMm.toFixed(1)} mm
                </div>
                {/* Height label */}
                <div
                  className="absolute font-mono text-xs text-primary/50"
                  style={{
                    right: -36,
                    top: '50%',
                    transform: 'translateY(-50%) rotate(90deg)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {hMm.toFixed(1)} mm
                </div>
              </div>
            </div>

            {/* Meta */}
            <div className="border border-border/40 mb-6">
              <div className="grid grid-cols-3 divide-x divide-border/30">
                {[
                  { label: 'ФОРМАТ', value: 'AC1015' },
                  { label: 'ЕДИНИЦЫ', value: 'мм' },
                  { label: 'ОБЪЕКТОВ', value: '2' },
                ].map(({ label, value }) => (
                  <div key={label} className="px-4 py-3 text-center">
                    <div className="font-mono text-xs text-muted-foreground/60 mb-1">{label}</div>
                    <div className="font-mono text-sm text-primary/80">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleDownload}
                className="w-full py-4 bg-primary text-primary-foreground font-mono text-sm tracking-widest hover:bg-primary/90 transition-all duration-200 glow flex items-center justify-center gap-3"
              >
                <Icon name="Download" size={18} />
                СКАЧАТЬ DXF ФАЙЛ
              </button>
              <button
                onClick={handleReset}
                className="w-full py-3 border border-border/40 text-muted-foreground hover:border-primary/30 hover:text-foreground font-mono text-xs tracking-widest transition-all duration-200"
              >
                ↺ НОВАЯ РАМКА
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-border/30 px-6 py-3 flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground/40">DXF GENERATOR v1.0</span>
        <span className="font-mono text-xs text-muted-foreground/40">AutoCAD R2000 · AC1015</span>
      </footer>
    </div>
  );
}