import { ehModalidade } from '@radar/core';
import { erro } from '@/lib/api';
import type { Coluna } from '@/lib/exportar';
import { responderTabela } from '@/lib/exportar-mercado';
import { fonteDeDados } from '@/lib/fonte-dados';
import { NOME_MODALIDADE } from '@/lib/formato';
import { MinhaIndisponivel } from '@/lib/minha';
import { sugestoesParaLoja } from '@/lib/sugestoes';

export const dynamic = 'force-dynamic';

type Linha = Awaited<ReturnType<typeof sugestoesParaLoja>>['franquia']['linhas'][number];
const R = '#,##0.00';
const COLUNAS: Coluna<Linha>[] = [
  { titulo: 'Loteria', valor: (l) => NOME_MODALIDADE[l.modalidade] },
  { titulo: 'Sugerido (R$)', valor: (l) => l.valorSugerido, formato: R },
  { titulo: 'Formato', valor: (l) => l.recomendacao?.formato ?? '' },
  { titulo: 'Bolões', valor: (l) => l.boloes },
  { titulo: 'Cota (R$)', valor: (l) => l.recomendacao?.valorCota ?? null, formato: R },
  { titulo: 'Lucro esperado (R$)', valor: (l) => l.lucroEsperado, formato: R },
  { titulo: 'Chance de prejuízo', valor: (l) => l.recomendacao?.chanceDePrejuizo ?? null, formato: '0%' },
  { titulo: 'Procura na UF por dia (R$)', valor: (l) => l.procuraPorDia, formato: R },
  { titulo: 'Inserido na UF por dia (R$)', valor: (l) => l.ofertaPorDia, formato: R },
  { titulo: 'Motivo', valor: (l) => l.motivo, largura: 60 },
];

/** GET /api/minha/sugestoes?loja=&dia=2026-11-22&limite=8000&modalidade=&max=&formato=: franquia + otimizador. */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  try {
    const mod = s.get('modalidade');
    const d = await sugestoesParaLoja(fonteDeDados(), {
      loja: s.get('loja'),
      dia: s.get('dia'),
      limite: s.get('limite') ? Number(s.get('limite')) : null,
      modalidade: mod && ehModalidade(mod) ? mod : null,
      valorMaximo: s.get('max') ? Number(s.get('max')) : null,
    });
    return responderTabela(req, { nome: `sugestoes-${d.loterica.codigoCaixa}-${d.dia}`, aba: 'Franquia', colunas: COLUNAS, linhas: d.franquia.linhas, dados: d });
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return erro(e.message, 409);
    throw e;
  }
}
