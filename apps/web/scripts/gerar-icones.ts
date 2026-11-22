import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

/**
 * Ícones do PWA (desenho próprio: um radar com o ponteiro). Gera os PNG em public/icones.
 * Rodar só quando o desenho mudar: pnpm --filter @radar/web exec tsx scripts/gerar-icones.ts
 */
const radar = (fundo: string, escala = 1) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${escala === 1 ? 112 : 0}" fill="${fundo}"/>
  <g transform="translate(256 256) scale(${escala})">
    <circle r="168" fill="none" stroke="#7dd3fc" stroke-width="20"/>
    <circle r="108" fill="none" stroke="#38bdf8" stroke-width="16" opacity="0.8"/>
    <circle r="46" fill="#0ea5e9"/>
    <path d="M0 0 L150 -86 A174 174 0 0 1 172 26 Z" fill="#38bdf8" opacity="0.45"/>
    <circle cx="112" cy="-58" r="20" fill="#fbbf24"/>
  </g>
</svg>`;
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="34" fill="none" stroke="#fff" stroke-width="8"/><circle cx="48" cy="48" r="12" fill="#fff"/><circle cx="70" cy="34" r="7" fill="#fff"/></svg>`;

const dir = join(import.meta.dirname, '..', 'public', 'icones');
mkdirSync(dir, { recursive: true });
const png = (svg: string, largura: number) => new Resvg(svg, { fitTo: { mode: 'width', value: largura } }).render().asPng();
writeFileSync(join(dir, 'icone-192.png'), png(radar('#0c1a2b'), 192));
writeFileSync(join(dir, 'icone-512.png'), png(radar('#0c1a2b'), 512));
writeFileSync(join(dir, 'icone-maskable-512.png'), png(radar('#0c1a2b', 0.72), 512));
writeFileSync(join(dir, 'apple-touch-icon.png'), png(radar('#0c1a2b'), 180));
writeFileSync(join(dir, 'badge-96.png'), png(badge, 96));
console.log('ícones gerados em', dir);
