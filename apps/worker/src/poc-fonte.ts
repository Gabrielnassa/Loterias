/**
 * Prova de conceito da Fase 0: baixa 3 páginas da fonte configurada e mostra o que veio.
 *   FONTE=fixture pnpm poc:fonte            (funciona hoje, com as fixtures sintéticas)
 *   FONTE=caixa   pnpm poc:fonte            (depois que o adaptador da CAIXA for mapeado)
 * Respeita o ClienteHttpEducado (intervalo mínimo, backoff, para em 401/403/captcha).
 */
import { formatarCodigoBolao, horaSP, type ModalidadeSlug } from '@radar/core';
import { varrerConcurso } from '@radar/core/fonte';
import { lerConfig } from './config';
import { criarFonte } from './fonte';
import { Relogio } from './relogio';

async function poc() {
  const cfg = lerConfig({ ...process.env, FILA: 'memoria', REPOSITORIO: 'memoria', FONTE: process.env.FONTE ?? 'fixture' });
  const relogio = new Relogio();
  const { fonte } = criarFonte(cfg, relogio);
  const abertos = await fonte.concursosAbertos();
  console.log(`fonte: ${fonte.nome} — concursos abertos:`, abertos.map((c) => `${c.modalidade} ${c.concurso}`).join(', ') || 'nenhum');
  const alvo = process.env.POC_MODALIDADE
    ? { modalidade: process.env.POC_MODALIDADE as ModalidadeSlug, concurso: Number(process.env.POC_CONCURSO) }
    : abertos[0];
  if (!alvo) return;
  const leitura = await varrerConcurso(fonte, alvo, { maxPaginas: 3 });
  console.log(`${alvo.modalidade} ${alvo.concurso}: ${leitura.paginasLidas} página(s), ${leitura.itens.length} bolões, completa=${leitura.completa}`);
  for (const b of leitura.itens.slice(0, 10)) {
    console.log(
      `  #${String(b.posicaoObservada).padStart(3)} ${formatarCodigoBolao({ jogos: b.jogos, dezenas: b.dezenas, cotas: b.cotasTotal }).padEnd(12)}` +
        ` ${String(b.cotasDisponiveis).padStart(3)}/${String(b.cotasTotal).padEnd(3)} R$ ${b.valorCotaBase.toFixed(2).padStart(8)}` +
        `  ${b.loterica.nome} (${b.loterica.cidade}/${b.loterica.uf})  visto ${horaSP(b.vistoEm)}`,
    );
  }
}

poc().catch((e) => {
  console.error(`${e?.name ?? 'Erro'}: ${e?.message ?? e}`);
  process.exit(1);
});
