import { diaSP, dividirFranquia, otimizarFormato, somarDias, type ModalidadeSlug } from '@radar/core';
import type { FonteDadosRaioX } from './dados';
import { fonteMercado } from './mercado';
import { minhaLoterica } from './minha';

/**
 * Sugestões para a lotérica do dono: divisão da franquia de um dia (amanhã por padrão) entre as
 * loterias e o otimizador de formato/cota/cotas, com base nas últimas `dias` semanas da UF.
 */
export async function sugestoesParaLoja(
  fonte: FonteDadosRaioX,
  o: { loja?: string | null; dia?: string | null; limite?: number | null; dias?: number; modalidade?: ModalidadeSlug | null; valorMaximo?: number | null } = {},
) {
  const loterica = await minhaLoterica(fonte, o.loja);
  const m = fonteMercado(fonte);
  const agora = m.agora();
  const hoje = diaSP(agora);
  const dia = o.dia && /^\d{4}-\d{2}-\d{2}$/.test(o.dia) ? o.dia : somarDias(hoje, 1);
  const dias = o.dias ?? 21;
  const desde = somarDias(hoje, -dias);
  const limite = o.limite ?? loterica.franquiaLimite ?? Number(process.env.RADAR_FRANQUIA_LIMITE ?? 8000);
  const historico = await m.historico(new Date(agora.getTime() - (dias + 1) * 86_400_000), agora);
  const uf = loterica.uf || 'SP';
  const franquia = dividirFranquia(historico, { dia, uf, limite, desde });
  const modalidades = o.modalidade ? [o.modalidade] : franquia.linhas.map((l) => l.modalidade);
  const otimizador = modalidades.map((modalidade) => ({
    modalidade,
    opcoes: otimizarFormato(historico, { modalidade, uf, desde, limite: 8, ...(o.valorMaximo ? { valorMaximo: o.valorMaximo } : {}) }),
  }));
  return { loterica, dia, desde, dias, uf, franquia, otimizador };
}
