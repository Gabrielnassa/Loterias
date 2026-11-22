import type { FonteDeMembros } from '@radar/avisos/memoria';
import type { RepositorioContasMemoria } from '@/lib/contas/memoria';

/** Quem está em cada conta, para o repositório de avisos em memória (dev sem banco e demonstração). */
export function membrosDaMemoria(contas: RepositorioContasMemoria): FonteDeMembros {
  return {
    membros: async (contaId) => (await contas.membros(contaId)).map((m) => ({ usuarioId: m.usuarioId, papel: m.papel, telas: m.telas, lojas: m.lojas })),
    contasComLoja: async (codigo) => contas.estado.lojas.filter((l) => l.codigo === codigo).map((l) => l.contaId),
    usuariosComConta: async () => [...new Map(contas.estado.membros.map((m) => [m.usuarioId, { usuarioId: m.usuarioId, contaId: m.contaId }])).values()],
  };
}
