import { useState, useRef, useCallback, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { Unit, DimEntry, LayoutSettings, UNIT_TO_MM, parseAllDimensions, generateDXF } from '@/components/dxf/types';
import StepUpload from '@/components/dxf/StepUpload';
import StepEditor from '@/components/dxf/StepEditor';

const OCR_URL = 'https://functions.poehali.dev/33370e84-0eb8-4c96-b594-e0c1681e8dca';

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
  const [ocrError, setOcrError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runOCR = async (imageBase64: string): Promise<string> => {
    const resp = await fetch(OCR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Ошибка сервера ${resp.status}`);
    }
    const data = await resp.json();
    return data.text || '';
  };

  const applyOCRResult = (text: string) => {
    setRawText(text.trim());
    setOcrError('');
    const parsed = parseAllDimensions(text);
    setEntries(parsed.length > 0 ? parsed : [{ id: '0', width: '', height: '', qty: '1' }]);
    if (parsed.length > 0) setActiveEntry(parsed[0].id);
  };

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const url = e.target?.result as string;
      setImagePreview(url);
      setStep(2);
      setIsRecognizing(true);
      setOcrError('');
      try {
        const text = await runOCR(url);
        applyOCRResult(text);
      } catch (e: unknown) {
        setRawText('');
        setOcrError(e instanceof Error ? e.message : 'Ошибка распознавания');
        setEntries([{ id: '0', width: '', height: '', qty: '1' }]);
      }
      setIsRecognizing(false);
    };
    reader.readAsDataURL(file);
  }, []);

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
        {step === 1 && (
          <StepUpload
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            handleFile={handleFile}
            setEntries={setEntries}
            setStep={setStep}
          />
        )}
        {step === 2 && (
          <StepEditor
            imagePreview={imagePreview}
            rawText={rawText}
            ocrError={ocrError}
            isRecognizing={isRecognizing}
            entries={entries}
            setEntries={setEntries}
            unit={unit}
            setUnit={setUnit}
            layout={layout}
            setLayout={setLayout}
            activeEntry={activeEntry}
            setActiveEntry={setActiveEntry}
            dxfContent={dxfContent}
            validEntries={validEntries}
            totalPieces={totalPieces}
            totalAreaMm2={totalAreaMm2}
            handleFile={handleFile}
            handleDownload={handleDownload}
            setStep={setStep}
            setImagePreview={setImagePreview}
            setRawText={setRawText}
          />
        )}
      </main>

      <footer className="border-t border-border/30 px-6 py-2 flex items-center justify-between shrink-0">
        <span className="font-mono text-xs text-muted-foreground/30">DXF GENERATOR v1.2</span>
        <span className="font-mono text-xs text-muted-foreground/30">AutoCAD R2000 · AC1015</span>
      </footer>
    </div>
  );
}
