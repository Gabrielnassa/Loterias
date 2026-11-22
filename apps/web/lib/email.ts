/**
 * E-mails do sistema (link de acesso, convite, resumo semanal). RADAR_EMAIL = console (padrão: escreve
 * no log do servidor) ou smtp (SMTP_URL, ex.: smtps://usuario:senha@smtp.exemplo.com:465, e
 * EMAIL_REMETENTE). Nenhuma credencial no repositório: só variáveis de ambiente.
 */
export interface Email {
  para: string;
  assunto: string;
  texto: string;
  html?: string;
}

export function modoEmail(): 'console' | 'smtp' {
  return process.env.RADAR_EMAIL === 'smtp' && process.env.SMTP_URL ? 'smtp' : 'console';
}

let transporte: { sendMail(m: Record<string, unknown>): Promise<unknown> } | null = null;

export async function enviarEmail(e: Email): Promise<{ modo: 'console' | 'smtp' }> {
  if (modoEmail() === 'smtp') {
    if (!transporte) {
      const nodemailer = await import('nodemailer');
      transporte = nodemailer.createTransport(process.env.SMTP_URL!);
    }
    await transporte.sendMail({ from: process.env.EMAIL_REMETENTE ?? 'Radar Lotérico <nao-responda@radar.local>', to: e.para, subject: e.assunto, text: e.texto, ...(e.html ? { html: e.html } : {}) });
    return { modo: 'smtp' };
  }
  console.info(`[email] para ${e.para}: ${e.assunto}\n${e.texto}`);
  return { modo: 'console' };
}

/**
 * Só para desenvolvimento local, sem SMTP: mostra o link de acesso na própria tela. Exige
 * RADAR_EMAIL_LINK_NA_TELA=1 e nunca vale em produção (quem pedisse o link de outra pessoa entraria).
 */
export function mostrarLinkNaTela(): boolean {
  return modoEmail() === 'console' && process.env.RADAR_EMAIL_LINK_NA_TELA === '1' && process.env.NODE_ENV !== 'production';
}
