import { FRANQUIA_FIM, FRANQUIA_INICIO } from '../dominio/constantes';
import type { ModalidadeSlug } from '../dominio/modalidades';
import type { LotericaRef } from '../dominio/tipos';
import { diaSP, noDiaSP, somarDias } from '../tempo/fuso';
import { centavos, media } from '../util/estatistica';
import type { AberturaInfo } from './semanal';

/**
 * Listas ELITE e TOP do Raio-X (refeitas toda manhã):
 * - "noite de abertura" = as aberturas de um dia (21:45; domingo 11:45), sem a Loteca;
 * - a lotérica "abriu" na noite se pôs ao menos 1 bolão nas 2 PRIMEIRAS HORAS depois do T0 da noite;
 * - também conta a noite em que ela já tinha usado 90% da franquia ANTES do T0 (marcada com *);
 * - Elite = abriu em TODAS as últimas 7 noites; Top = em pelo menos 4 das 7 (inclui a Elite).
 * Para cada uma: franquia média que ainda resta (estimada) e fila média por modalidade.
 * A franquia de outra lotérica não é pública: o limite estimado é o maior entre o padrão
 * (R$ 8.000) e o maior uso diário visto no período.
 */
export interface BolaoParaElite {
  lotericaCodigo: string;
  /** `${modalidade}-${concurso}`, o mesmo id das aberturas. */
  aberturaId: string;
  modalidade: ModalidadeSlug;
  entrouEm: Date;
  /** Valor do bolão sem tarifa (o que consome a franquia). */
  valor: number;
}

export interface NoiteElite {
  dia: string;
  t0: Date;
  aberturas: string[];
}

export interface PresencaNoite {
  dia: string;
  presente: boolean;
  /** Contou porque já tinha usado 90% da franquia antes da abertura (*). */
  porFranquia: boolean;
}

export interface LinhaElite {
  loterica: LotericaRef;
  presencas: number;
  noites: PresencaNoite[];
  /** Franquia média que ainda restava no fim do dia (estimada). */
  franquiaMediaRestante: number;
  limiteEstimado: number;
  /** Bolões (filas) por abertura, em média, por modalidade, nas noites em que abriu. */
  filaMedia: Partial<Record<ModalidadeSlug, number>>;
}

export interface ListasEliteTop {
  referencia: Date;
  noites: NoiteElite[];
  elite: LinhaElite[];
  top: LinhaElite[];
}

/** "Toda manhã": as listas valem a partir das 06:00 (SP) do dia. */
export function referenciaDaManha(agora: Date): Date {
  const hoje = noDiaSP(diaSP(agora), 6, 0);
  return agora.getTime() >= hoje.getTime() ? hoje : noDiaSP(somarDias(diaSP(agora), -1), 6, 0);
}

export function listasEliteTop(o: {
  aberturas: readonly AberturaInfo[];
  boloes: readonly BolaoParaElite[];
  lotericas: ReadonlyMap<string, LotericaRef>;
  agora: Date;
  noites?: number;
  minimoTop?: number;
  janelaMin?: number;
  limiarFranquia?: number;
  franquiaPadrao?: number;
}): ListasEliteTop {
  const nNoites = o.noites ?? 7;
  const minimoTop = o.minimoTop ?? 4;
  const janela = (o.janelaMin ?? 120) * 60_000;
  const limiar = o.limiarFranquia ?? 0.9;
  const padrao = o.franquiaPadrao ?? 8000;
  const referencia = referenciaDaManha(o.agora);

  const porDia = new Map<string, NoiteElite>();
  for (const a of o.aberturas) {
    if (a.modalidade === 'loteca') continue;
    const dia = diaSP(a.t0);
    const n = porDia.get(dia) ?? { dia, t0: a.t0, aberturas: [] };
    if (a.t0.getTime() < n.t0.getTime()) n.t0 = a.t0;
    n.aberturas.push(a.id);
    porDia.set(dia, n);
  }
  const noites = [...porDia.values()]
    .filter((n) => n.t0.getTime() + janela <= referencia.getTime())
    .sort((a, b) => b.t0.getTime() - a.t0.getTime())
    .slice(0, nNoites);

  // uso da franquia por lotérica e dia (05:00 a 23:00) e antes do T0 de cada noite
  const usoDia = new Map<string, number>();
  for (const b of o.boloes) {
    const dia = diaSP(b.entrouEm);
    const ini = noDiaSP(dia, FRANQUIA_INICIO.hora, FRANQUIA_INICIO.minuto).getTime();
    const fim = noDiaSP(dia, FRANQUIA_FIM.hora, FRANQUIA_FIM.minuto).getTime();
    const t = b.entrouEm.getTime();
    if (t >= ini && t < fim) usoDia.set(`${b.lotericaCodigo}|${dia}`, (usoDia.get(`${b.lotericaCodigo}|${dia}`) ?? 0) + b.valor);
  }
  const limite = new Map<string, number>();
  for (const [k, v] of usoDia) {
    const cod = k.slice(0, k.indexOf('|'));
    limite.set(cod, Math.max(limite.get(cod) ?? padrao, v));
  }

  const porLoterica = new Map<string, BolaoParaElite[]>();
  for (const b of o.boloes) {
    const l = porLoterica.get(b.lotericaCodigo);
    if (l) l.push(b);
    else porLoterica.set(b.lotericaCodigo, [b]);
  }

  const linhas: LinhaElite[] = [];
  for (const [codigo, bs] of porLoterica) {
    const loterica = o.lotericas.get(codigo);
    if (!loterica) continue;
    const lim = limite.get(codigo) ?? padrao;
    const filas = new Map<ModalidadeSlug, number[]>();
    const presencasNoite: PresencaNoite[] = noites.map((n) => {
      const ini = n.t0.getTime();
      const naJanela = bs.filter((b) => n.aberturas.includes(b.aberturaId) && b.entrouEm.getTime() >= ini && b.entrouEm.getTime() <= ini + janela);
      const presente = naJanela.length > 0;
      if (presente) {
        const porAbertura = new Map<string, { m: ModalidadeSlug; n: number }>();
        for (const b of naJanela) porAbertura.set(b.aberturaId, { m: b.modalidade, n: (porAbertura.get(b.aberturaId)?.n ?? 0) + 1 });
        for (const { m, n: q } of porAbertura.values()) filas.set(m, [...(filas.get(m) ?? []), q]);
      }
      const inicioFranquia = noDiaSP(n.dia, FRANQUIA_INICIO.hora, FRANQUIA_INICIO.minuto).getTime();
      const antes = bs.filter((b) => b.entrouEm.getTime() >= inicioFranquia && b.entrouEm.getTime() < ini).reduce((s, b) => s + b.valor, 0);
      return { dia: n.dia, presente, porFranquia: !presente && antes >= limiar * lim };
    });
    const presencas = presencasNoite.filter((p) => p.presente || p.porFranquia).length;
    if (presencas < Math.min(minimoTop, noites.length)) continue;
    linhas.push({
      loterica,
      presencas,
      noites: presencasNoite,
      franquiaMediaRestante: centavos(media(noites.map((n) => Math.max(0, lim - (usoDia.get(`${codigo}|${n.dia}`) ?? 0)))) ?? lim),
      limiteEstimado: centavos(lim),
      filaMedia: Object.fromEntries([...filas.entries()].map(([m, v]) => [m, Math.round((media(v) ?? 0) * 10) / 10])),
    });
  }
  linhas.sort((a, b) => b.presencas - a.presencas || a.loterica.nome.localeCompare(b.loterica.nome));
  return {
    referencia,
    noites,
    elite: noites.length ? linhas.filter((l) => l.presencas === noites.length) : [],
    top: linhas,
  };
}
