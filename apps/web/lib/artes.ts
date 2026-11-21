import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { MODALIDADES, type ModalidadeSlug } from '@radar/core';
import { NOME_MODALIDADE } from './formato';

/**
 * Gerador de artes (Fase 5) com Satori -> SVG -> PNG (resvg), 1080 x 1080 para Instagram/WhatsApp.
 * Design próprio do Radar (faixa com a cor da loteria, bolas brancas, rodapé com a marca da
 * lotérica). Tipos: resultado do sorteio, bolões disponíveis, bolão premiado e "Saiu aqui!".
 */
export type TipoArte = 'resultado' | 'boloes' | 'premiado' | 'saiu-aqui';
export const TIPOS_ARTE: TipoArte[] = ['resultado', 'boloes', 'premiado', 'saiu-aqui'];

export interface Marca {
  nome: string;
  whatsapp?: string | null;
  instagram?: string | null;
  endereco?: string | null;
  cidadeUf?: string | null;
}

export interface DadosResultado {
  modalidade: ModalidadeSlug;
  concurso: number;
  data: string;
  dezenas: number[];
  extra?: string | null;
  /** "Acumulou! Próximo concurso: R$ 45 milhões" ou "2 ganhadores de R$ 12 milhões". */
  destaque: string;
}

export interface DadosBoloes {
  itens: { modalidade: ModalidadeSlug; concurso: number; formato: string; valorCota: number; restam: number }[];
}

export interface DadosPremio {
  modalidade: ModalidadeSlug;
  concurso: number;
  /** Ex.: "Quadra" ou "4 quadras e 1 quina". */
  descricao: string;
  valor: number;
}

type No = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, ...children: (No | string | null | false | undefined)[]): No => ({
  type,
  props: { style: { display: 'flex', ...style }, children: children.filter((c) => c !== null && c !== false && c !== undefined) },
});

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fone = (w: string) => {
  const d = w.replace(/\D/g, '').replace(/^55/, '');
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : w;
};

function escurecer(hex: string, f = 0.55): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((n >> s) & 255) * f);
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

function moldura(cor: string, rotulo: string, titulo: string, subtitulo: string, corpo: No, marca: Marca): No {
  return h(
    'div',
    { width: 1080, height: 1080, flexDirection: 'column', backgroundImage: `linear-gradient(160deg, ${cor} 0%, ${escurecer(cor)} 100%)`, color: 'white', fontFamily: 'Inter' },
    h(
      'div',
      { flexDirection: 'column', padding: '64px 72px 0 72px' },
      h('div', { fontSize: 30, fontWeight: 700, letterSpacing: 6, opacity: 0.85 }, rotulo.toUpperCase()),
      h('div', { fontSize: 84, fontWeight: 700, marginTop: 12, lineHeight: 1.05 }, titulo),
      h('div', { fontSize: 36, marginTop: 8, opacity: 0.9 }, subtitulo),
    ),
    h('div', { flex: 1, flexDirection: 'column', justifyContent: 'center', padding: '0 72px' }, corpo),
    h(
      'div',
      { backgroundColor: 'rgba(255,255,255,0.95)', color: '#0f172a', padding: '32px 72px', flexDirection: 'column' },
      h('div', { fontSize: 44, fontWeight: 700 }, marca.nome),
      h(
        'div',
        { fontSize: 28, marginTop: 6, color: '#334155', flexWrap: 'wrap' },
        [marca.whatsapp ? `WhatsApp ${fone(marca.whatsapp)}` : null, marca.instagram ? `@${marca.instagram}` : null, marca.endereco ?? marca.cidadeUf ?? null].filter(Boolean).join('   ·   '),
      ),
    ),
  );
}

function bolas(dezenas: number[], extra?: string | null): No {
  const tam = dezenas.length > 10 ? 96 : 128;
  return h(
    'div',
    { flexDirection: 'column', alignItems: 'center' },
    h(
      'div',
      { flexWrap: 'wrap', justifyContent: 'center', gap: 22 },
      ...dezenas.map((d) =>
        h('div', { width: tam, height: tam, borderRadius: tam, backgroundColor: 'white', color: '#0f172a', alignItems: 'center', justifyContent: 'center', fontSize: tam * 0.45, fontWeight: 700 }, String(d).padStart(2, '0')),
      ),
    ),
    extra ? h('div', { fontSize: 36, marginTop: 28, fontWeight: 700 }, extra) : null,
  );
}

export function arteResultado(d: DadosResultado, marca: Marca): No {
  const m = MODALIDADES[d.modalidade];
  return moldura(m.cor, 'Resultado', `${NOME_MODALIDADE[d.modalidade]} ${d.concurso}`, d.data, h('div', { flexDirection: 'column', alignItems: 'center' }, bolas(d.dezenas, d.extra), h('div', { fontSize: 40, marginTop: 40, fontWeight: 700, textAlign: 'center' }, d.destaque)), marca);
}

export function arteBoloes(d: DadosBoloes, marca: Marca): No {
  const cor = d.itens[0] ? MODALIDADES[d.itens[0].modalidade].cor : '#0e7490';
  const linhas = d.itens.slice(0, 6).map((b) =>
    h(
      'div',
      { justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 20, padding: '18px 28px', marginBottom: 14 },
      h('div', { flexDirection: 'column' }, h('div', { fontSize: 36, fontWeight: 700 }, `${NOME_MODALIDADE[b.modalidade]} ${b.concurso}`), h('div', { fontSize: 26, opacity: 0.85 }, `${b.formato} · restam ${b.restam}`)),
      h('div', { fontSize: 44, fontWeight: 700 }, brl(b.valorCota)),
    ),
  );
  const corpo = d.itens.length ? h('div', { flexDirection: 'column' }, ...linhas) : h('div', { fontSize: 44 }, 'Novos bolões em breve. Fale com a gente!');
  return moldura(cor, 'Bolões disponíveis', 'Garanta sua cota', 'Cotas oficiais CAIXA, com tarifa de serviço', corpo, marca);
}

export function artePremiado(d: DadosPremio, marca: Marca): No {
  const corpo = h('div', { flexDirection: 'column', alignItems: 'center' }, h('div', { fontSize: 56, fontWeight: 700, textAlign: 'center' }, d.descricao), h('div', { fontSize: 120, fontWeight: 700, marginTop: 24 }, brl(d.valor)), h('div', { fontSize: 34, marginTop: 16, opacity: 0.9 }, 'de prêmio para os nossos cotistas'));
  return moldura(MODALIDADES[d.modalidade].cor, 'Bolão premiado', `${NOME_MODALIDADE[d.modalidade]} ${d.concurso}`, 'Parabéns aos ganhadores!', corpo, marca);
}

export function arteSaiuAqui(d: DadosPremio, marca: Marca): No {
  const corpo = h('div', { flexDirection: 'column', alignItems: 'center' }, h('div', { fontSize: 170, fontWeight: 700, lineHeight: 1 }, 'Saiu aqui!'), h('div', { fontSize: 52, fontWeight: 700, marginTop: 32, textAlign: 'center' }, `${d.descricao} da ${NOME_MODALIDADE[d.modalidade]} ${d.concurso}`), h('div', { fontSize: 72, fontWeight: 700, marginTop: 20 }, brl(d.valor)));
  return moldura(MODALIDADES[d.modalidade].cor, 'Premiado na lotérica', 'A sorte passou por aqui', 'Venha fazer a sua aposta', corpo, marca);
}

// Inter (SIL Open Font License, ver assets/fontes/LICENSE-Inter-OFL.txt), lida do disco: o webpack
// transformaria `new URL(..., import.meta.url)` em URL pública, que o fs não abre.
function arquivoFonte(nome: string): string {
  const candidatos = [join(process.cwd(), 'assets', 'fontes', nome), join(process.cwd(), 'apps', 'web', 'assets', 'fontes', nome)];
  const achado = candidatos.find((c) => existsSync(c));
  if (!achado) throw new Error(`fonte das artes não encontrada (${nome}); rode a web a partir de apps/web`);
  return achado;
}

let fontes: { name: string; data: Buffer; weight: 400 | 700; style: 'normal' }[] | null = null;
function carregarFontes() {
  fontes ??= [
    { name: 'Inter', data: readFileSync(arquivoFonte('inter-latin-400-normal.woff')), weight: 400, style: 'normal' },
    { name: 'Inter', data: readFileSync(arquivoFonte('inter-latin-700-normal.woff')), weight: 700, style: 'normal' },
  ];
  return fontes;
}

/** Desenha a arte em PNG (1080 x 1080). */
export async function renderizarPng(no: No, tamanho = 1080): Promise<Buffer> {
  const svg = await satori(no as unknown as Parameters<typeof satori>[0], { width: 1080, height: 1080, fonts: carregarFontes() });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: tamanho } }).render().asPng());
}
