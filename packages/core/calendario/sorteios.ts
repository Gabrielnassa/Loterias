import { MODALIDADES, SLUGS_MODALIDADE, type ModalidadeSlug } from '../dominio/modalidades';
import { isodowDoDia, lerDia, noDiaSP, somarDias } from '../tempo/fuso';

/**
 * Calendário de sorteios (referência): dias da semana de cada modalidade conforme as páginas
 * oficiais (21/11/2026), sorteios a partir das 21h e, no domingo, das 11h; a abertura dos bolões do
 * concurso seguinte é 45 min depois (21:45 / 11:45). Feriados e concursos especiais mudam datas:
 * conferir no calendário oficial da CAIXA. Loteca: concurso semanal, apostas até sábado 14h.
 * Mega da Virada: 31/12.
 */
export interface SorteioDoDia {
  modalidade: ModalidadeSlug;
  sorteioEm: Date;
  /** Abertura dos bolões do concurso seguinte. */
  aberturaEm: Date;
  especial?: string;
}

export interface DiaDoCalendario {
  dia: string;
  diaSemana: number;
  sorteios: SorteioDoDia[];
  /** Avisos do dia (ex.: fim das apostas da Loteca). */
  avisos: string[];
}

export function sorteiosDoDia(dia: string): DiaDoCalendario {
  const dow = isodowDoDia(dia);
  const domingo = dow === 7;
  const hora = domingo ? 11 : 21;
  const { mes, dia: d } = lerDia(dia);
  const sorteios: SorteioDoDia[] = [];
  for (const slug of SLUGS_MODALIDADE) {
    const m = MODALIDADES[slug];
    if (!m.diasSorteio.includes(dow)) continue;
    sorteios.push({ modalidade: slug, sorteioEm: noDiaSP(dia, hora, 0), aberturaEm: noDiaSP(dia, hora, 45) });
  }
  const avisos: string[] = [];
  if (mes === 12 && d === 31) {
    // Mega da Virada: o sorteio regular da Mega dá lugar ao especial
    const sem = sorteios.filter((s) => s.modalidade !== 'mega-sena');
    sorteios.length = 0;
    sorteios.push(...sem, { modalidade: 'mega-sena', sorteioEm: noDiaSP(dia, 20, 0), aberturaEm: noDiaSP(somarDias(dia, 1), 11, 45), especial: 'Mega da Virada' });
  }
  if (dow === 6) avisos.push('Loteca: apostas até 14h');
  return { dia, diaSemana: dow, sorteios: sorteios.sort((a, b) => a.sorteioEm.getTime() - b.sorteioEm.getTime() || a.modalidade.localeCompare(b.modalidade)), avisos };
}

/** Os dias do mês (YYYY, 1..12) com os sorteios. */
export function calendarioDoMes(ano: number, mes: number): DiaDoCalendario[] {
  const primeiro = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const out: DiaDoCalendario[] = [];
  for (let dia = primeiro; lerDia(dia).mes === mes; dia = somarDias(dia, 1)) out.push(sorteiosDoDia(dia));
  return out;
}
