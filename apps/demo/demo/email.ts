import { avisar } from './aviso';

/** Substitui apps/web/lib/email.ts: na demonstração nenhum e-mail sai do navegador. */
export interface Email {
  para: string;
  assunto: string;
  texto: string;
  html?: string;
}

export const modoEmail = (): 'console' | 'smtp' => 'console';

export async function enviarEmail(e: Email): Promise<{ modo: 'console' | 'smtp' }> {
  avisar(`Demonstração: o e-mail "${e.assunto}" para ${e.para} não foi enviado de verdade.`);
  return { modo: 'console' };
}

export const mostrarLinkNaTela = () => false;
