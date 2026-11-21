import { ehModalidade, type ModalidadeSlug } from '@radar/core';
import { arteBoloes, artePremiado, arteResultado, arteSaiuAqui, type Marca, type TipoArte } from './artes';
import type { FonteDadosRaioX } from './dados';
import type { FontePostgresRaioX } from './dados-postgres';
import { fmtDataLonga } from './formato';
import { conferenciaMkp, minhaLoterica } from './minha';
import { boloesDoSite, sitesConhecidos } from './site';

const NOME_FAIXA: Partial<Record<ModalidadeSlug, Record<number, string>>> = {
  'mega-sena': { 6: 'Sena', 5: 'Quina', 4: 'Quadra' },
  'dupla-sena': { 6: 'Sena', 5: 'Quina', 4: 'Quadra', 3: 'Terno' },
  quina: { 5: 'Quina', 4: 'Quadra', 3: 'Terno', 2: 'Duque' },
};

/** Resultado real de demonstração (Mega-Sena 3.088, API oficial, 21/11/2026) quando não há banco. */
const RESULTADO_DEMO = { modalidade: 'mega-sena' as const, concurso: 3088, data: 'qui., 19/11/2026', dezenas: [10, 21, 24, 28, 34, 44], destaque: 'Acumulou! 15 quinas e 2.750 quadras' };
const PREMIO_DEMO = { modalidade: 'mega-sena' as const, concurso: 3088, descricao: 'Quadra', valor: 730.43 };

function descreverPremio(modalidade: ModalidadeSlug, faixas: { acertos: number | null; quantidade: number; descricao: string }[]): string {
  const nomes = NOME_FAIXA[modalidade];
  return faixas
    .map((f) => {
      const nome = f.acertos !== null && nomes?.[f.acertos] ? nomes[f.acertos]! : f.descricao;
      return f.quantidade > 1 ? `${f.quantidade} ${nome.toLowerCase()}s` : nome;
    })
    .join(' e ');
}

/** Monta a arte pedida para a lotérica do dono. `demonstracao` = dados de exemplo (sem banco ou sem prêmio). */
export async function dadosDaArte(fonte: FonteDadosRaioX, tipo: TipoArte, o: { loja?: string | null; modalidade?: string | null } = {}) {
  const loterica = await minhaLoterica(fonte, o.loja);
  const site = (await sitesConhecidos(fonte)).find((s) => s.loterica.codigoCaixa === loterica.codigoCaixa);
  const marca: Marca = { nome: loterica.nome, whatsapp: site?.whatsapp ?? null, instagram: site?.instagram ?? null, endereco: site?.endereco ?? null, cidadeUf: `${loterica.cidade}/${loterica.uf}` };
  const sql = fonte.tipo === 'postgres' ? (fonte as FontePostgresRaioX).sql : null;
  if (tipo === 'resultado') {
    const mod: ModalidadeSlug = o.modalidade && ehModalidade(o.modalidade) ? o.modalidade : 'mega-sena';
    if (sql) {
      const [r] = await sql<{ numero: number; data_apuracao: string | Date; dezenas: number[]; trevos: number[] | null; time_coracao: string | null; mes_sorte: number | null; acumulado: boolean; ganhadores: number | null; valor: string | null }[]>`
        select c.numero, r.data_apuracao, r.dezenas, r.trevos, r.time_coracao, r.mes_sorte, r.acumulado, ra.ganhadores, ra.valor_premio as valor
        from resultados r join concursos c on c.id = r.concurso_id join modalidades m on m.id = c.modalidade_id
        left join rateios ra on ra.concurso_id = r.concurso_id and ra.faixa = 1
        where m.slug = ${mod} order by r.data_apuracao desc, c.numero desc limit 1`;
      if (r) {
        const data = typeof r.data_apuracao === 'string' ? r.data_apuracao.slice(0, 10) : r.data_apuracao.toISOString().slice(0, 10);
        const destaque = r.acumulado || !r.ganhadores ? 'Acumulou!' : `${r.ganhadores} ganhador${r.ganhadores > 1 ? 'es' : ''} de ${Number(r.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
        const extra = r.trevos?.length ? `Trevos ${r.trevos.join(' e ')}` : r.time_coracao ? `Time do Coração: ${r.time_coracao}` : r.mes_sorte ? `Mês da Sorte: ${r.mes_sorte}` : null;
        return { demonstracao: false, no: arteResultado({ modalidade: mod, concurso: r.numero, data: fmtDataLonga(`${data}T15:00:00Z`), dezenas: r.dezenas, destaque, extra }, marca) };
      }
    }
    return { demonstracao: true, no: arteResultado(RESULTADO_DEMO, marca) };
  }
  if (tipo === 'boloes') {
    const itens = site ? (await boloesDoSite(fonte, site)).slice(0, 6).map((b) => ({ modalidade: b.modalidade, concurso: b.concurso, formato: b.formato, valorCota: b.valorCota, restam: b.disponiveis })) : [];
    return { demonstracao: fonte.tipo !== 'postgres', no: arteBoloes({ itens }, marca) };
  }
  // premiado e "Saiu aqui!": o maior prêmio dos bolões da lotérica nos últimos 30 dias
  let premio: { modalidade: ModalidadeSlug; concurso: number; descricao: string; valor: number } | null = null;
  if (sql) {
    const c = await conferenciaMkp(fonte, { dias: 30, loja: loterica.codigoCaixa }).catch(() => null);
    const l = c?.linhas.find((x) => x.premioTotal > 0);
    if (l) premio = { modalidade: l.modalidade, concurso: l.concurso, descricao: descreverPremio(l.modalidade, l.faixas), valor: l.premioTotal };
  }
  const d = premio ?? PREMIO_DEMO;
  return { demonstracao: !premio, no: tipo === 'premiado' ? artePremiado(d, marca) : arteSaiuAqui(d, marca) };
}
