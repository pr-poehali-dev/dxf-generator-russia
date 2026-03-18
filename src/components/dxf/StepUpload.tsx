import { useRef } from 'react';
import Icon from '@/components/ui/icon';
import { DimEntry } from './types';

interface StepUploadProps {
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  handleFile: (file: File) => void;
  setEntries: React.Dispatch<React.SetStateAction<DimEntry[]>>;
  setStep: (s: 1 | 2) => void;
}

export default function StepUpload({ isDragging, setIsDragging, handleFile, setEntries, setStep }: StepUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
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
  );
}
