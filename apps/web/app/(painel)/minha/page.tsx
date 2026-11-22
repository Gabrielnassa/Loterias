import { redirect } from 'next/navigation';
import { TELAS } from '@radar/core';
import { contexto } from '@/lib/contexto';

/** /minha abre a 1ª tela da Minha lotérica liberada para a pessoa (Bolões, sem contas). */
export default async function Minha() {
  const ctx = await contexto();
  const tela = ctx ? TELAS.find((t) => t.grupo === 'Minha lotérica' && ctx.telas.includes(t.id)) : TELAS.find((t) => t.id === 'minha-boloes');
  redirect(tela?.rotas[0] ?? '/sem-permissao');
}
