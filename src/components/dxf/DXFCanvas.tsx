import { useRef, useEffect } from 'react';
import { DimEntry, Unit, LayoutSettings, COLORS, buildRects } from './types';

export default function DXFCanvas({ entries, unit, layout }: { entries: DimEntry[]; unit: Unit; layout: LayoutSettings }) {
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
        ctx.beginPath(); ctx.moveTo(cx2 as number, (cy2 as number) + (dy as number) * tick); ctx.lineTo(cx2 as number, cy2 as number); ctx.lineTo((cx2 as number) + (dx as number) * tick, cy2 as number); ctx.stroke();
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
