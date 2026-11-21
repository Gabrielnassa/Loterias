import { BloqueadoPelaFonteError, FormatoInesperadoError } from './erros';

/**
 * Saúde da fonte (SPEC, Riscos): alerta após 3 falhas seguidas ou mudança de formato.
 * Bloqueio (401/403/captcha) também alerta na hora: o coletor deve parar, nunca burlar.
 * Emite no máximo 1 alerta por sequência de falhas; um sucesso zera a sequência.
 */
export type MotivoAlerta = 'falhas_seguidas' | 'formato_mudou' | 'bloqueado';

export interface Alerta {
  motivo: MotivoAlerta;
  falhasSeguidas: number;
  mensagem: string;
}

export class MonitorSaudeFonte {
  private falhas = 0;
  private alertou = false;

  constructor(private readonly limiteFalhas = 3) {}

  get falhasSeguidas(): number {
    return this.falhas;
  }

  registrarSucesso(): void {
    this.falhas = 0;
    this.alertou = false;
  }

  /** Retorna o alerta a disparar (ou null). */
  registrarFalha(erro: unknown): Alerta | null {
    this.falhas++;
    if (this.alertou) return null;
    const msg = erro instanceof Error ? erro.message : String(erro);
    let motivo: MotivoAlerta | null = null;
    if (erro instanceof BloqueadoPelaFonteError) motivo = 'bloqueado';
    else if (erro instanceof FormatoInesperadoError) motivo = 'formato_mudou';
    else if (this.falhas >= this.limiteFalhas) motivo = 'falhas_seguidas';
    if (!motivo) return null;
    this.alertou = true;
    return { motivo, falhasSeguidas: this.falhas, mensagem: msg };
  }
}
