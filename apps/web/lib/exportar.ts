import ExcelJS from 'exceljs';

/** Exportação de tabelas (CSV para Excel em português e XLSX). */
export interface Coluna<T> {
  titulo: string;
  valor: (linha: T) => string | number | null | undefined;
  /** Formato numérico no XLSX (ex.: '0.00%', '#,##0.00'). */
  formato?: string;
  largura?: number;
}

function celulaCsv(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV com ";" e vírgula decimal (padrão do Excel em pt-BR), com BOM para acentos. */
export function paraCsv<T>(colunas: readonly Coluna<T>[], linhas: readonly T[]): string {
  const cab = colunas.map((c) => celulaCsv(c.titulo)).join(';');
  const corpo = linhas.map((l) => colunas.map((c) => celulaCsv(c.valor(l))).join(';'));
  return '﻿' + [cab, ...corpo].join('\r\n') + '\r\n';
}

export async function paraXlsx<T>(aba: string, colunas: readonly Coluna<T>[], linhas: readonly T[], aviso?: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Radar Lotérico';
  const ws = wb.addWorksheet(aba.slice(0, 31));
  ws.columns = colunas.map((c) => ({ header: c.titulo, width: c.largura ?? Math.max(12, c.titulo.length + 2) }));
  ws.getRow(1).font = { bold: true };
  for (const l of linhas) ws.addRow(colunas.map((c) => c.valor(l) ?? null));
  colunas.forEach((c, i) => {
    if (c.formato) ws.getColumn(i + 1).numFmt = c.formato;
  });
  if (aviso) {
    ws.addRow([]);
    ws.addRow([aviso]).font = { italic: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const AVISO_ESTIMATIVA =
  'Estimativas a partir de leituras periódicas da vitrine pública do Marketplace; não são dados oficiais da CAIXA.';
