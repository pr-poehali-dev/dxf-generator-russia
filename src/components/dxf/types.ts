export type Unit = 'mm' | 'cm' | 'inch' | 'px';

export interface DimEntry {
  id: string;
  width: string;
  height: string;
  qty: string;
}

export interface LayoutSettings {
  gapX: number;
  gapY: number;
  cols: number;
}

export interface CanvasRect {
  x: number; y: number; w: number; h: number; num: number;
  wOrig: number; hOrig: number; unitLabel: string;
}

export const UNIT_LABELS: Record<Unit, string> = { mm: 'мм', cm: 'см', inch: 'дюймы', px: 'пиксели' };
export const UNIT_TO_MM: Record<Unit, number> = { mm: 1, cm: 10, inch: 25.4, px: 0.264583 };

export const COLORS = [
  'hsl(195,100%,55%)', 'hsl(160,80%,50%)', 'hsl(45,100%,60%)',
  'hsl(280,70%,65%)', 'hsl(20,100%,60%)', 'hsl(340,80%,60%)',
  'hsl(60,90%,55%)', 'hsl(200,80%,60%)',
];

export function parseAllDimensions(text: string): DimEntry[] {
  const results: DimEntry[] = [];
  const lines = text.split(/[\n\r]+/);
  let idx = 0;

  const linePattern = /(\d{2,5}[.,]?\d*)\s*[xхXХ×*]\s*(\d{2,5}[.,]?\d*)(?:\s*[-—–=]\s*(\d+)\s*(?:шт\.?|pcs\.?|pc\.?|штук|штуки|ед\.?|шт)?)?/i;

  for (const line of lines) {
    const match = linePattern.exec(line);
    if (match) {
      const w = match[1].replace(',', '.');
      const h = match[2].replace(',', '.');
      if (parseFloat(w) > 0 && parseFloat(h) > 0) {
        let qty = match[3] || '';
        if (!qty) {
          const qtyMatch = line.match(/[-—–=]\s*(\d+)\s*(?:шт\.?|pcs\.?|pc\.?|штук|штуки|ед\.?)?/i);
          if (qtyMatch) qty = qtyMatch[1];
        }
        results.push({ id: String(idx++), width: w, height: h, qty: qty || '1' });
      }
    }
  }

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

export function buildRects(entries: DimEntry[], unit: Unit, layout: LayoutSettings): CanvasRect[] {
  const factor = UNIT_TO_MM[unit];
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
  const rowHeights: number[] = [];
  const rowOffsetY: number[] = [];
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

export function generateDXF(entries: DimEntry[], unit: Unit, layout: LayoutSettings): string {
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
