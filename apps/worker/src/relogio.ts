import { createSocket } from 'node:dgram';

/**
 * Relógio do coletor corrigido por NTP (SPEC: "relógio por NTP"). A precisão do first_seen_at
 * depende dele: o agendador dispara as leituras nos slots T0 − 60 s, T0 − 55 s, ..., T0, ...
 * Se o NTP falhar, segue com o relógio do sistema (e loga o aviso).
 */
export interface FonteDeTempo {
  agora(): Date;
}

const NTP_EPOCA_S = 2_208_988_800; // 1900-01-01 -> 1970-01-01

function lerTimestampNtp(buf: Buffer, offset: number): number {
  const segundos = buf.readUInt32BE(offset);
  const fracao = buf.readUInt32BE(offset + 4);
  return (segundos - NTP_EPOCA_S) * 1000 + (fracao / 2 ** 32) * 1000;
}

export function escreverTimestampNtp(buf: Buffer, offset: number, ms: number): void {
  const s = Math.floor(ms / 1000);
  buf.writeUInt32BE(s + NTP_EPOCA_S, offset);
  buf.writeUInt32BE(Math.floor(((ms - s * 1000) / 1000) * 2 ** 32), offset + 4);
}

export interface MedicaoNtp {
  offsetMs: number;
  rttMs: number;
  servidor: string;
}

/** Consulta SNTP (RFC 4330): offset = ((T2 − T1) + (T3 − T4)) / 2. */
export function consultarNtp(servidor: string, porta = 123, timeoutMs = 2000, agora: () => number = Date.now): Promise<MedicaoNtp> {
  return new Promise((resolve, reject) => {
    const sock = createSocket('udp4');
    const pacote = Buffer.alloc(48);
    pacote[0] = 0x23; // LI = 0, VN = 4, Mode = 3 (cliente)
    let t1 = 0;
    const timer = setTimeout(() => {
      sock.close();
      reject(new Error(`NTP sem resposta de ${servidor} em ${timeoutMs} ms`));
    }, timeoutMs);
    sock.on('error', (e) => {
      clearTimeout(timer);
      sock.close();
      reject(e);
    });
    sock.on('message', (msg) => {
      const t4 = agora();
      clearTimeout(timer);
      sock.close();
      if (msg.length < 48) return reject(new Error('resposta NTP curta'));
      const modo = (msg[0] ?? 0) & 0x07;
      if (modo !== 4) return reject(new Error(`resposta NTP com modo ${modo}`));
      const t2 = lerTimestampNtp(msg, 32);
      const t3 = lerTimestampNtp(msg, 40);
      resolve({ offsetMs: (t2 - t1 + (t3 - t4)) / 2, rttMs: t4 - t1 - (t3 - t2), servidor });
    });
    t1 = agora();
    sock.send(pacote, porta, servidor, (e) => {
      if (e) {
        clearTimeout(timer);
        sock.close();
        reject(e);
      }
    });
  });
}

export class Relogio implements FonteDeTempo {
  private offsetMs = 0;
  ultimaMedicao: MedicaoNtp | null = null;

  agora(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  get deslocamentoMs(): number {
    return this.offsetMs;
  }

  async sincronizar(servidor: string, porta = 123): Promise<MedicaoNtp> {
    const m = await consultarNtp(servidor, porta);
    this.offsetMs = m.offsetMs;
    this.ultimaMedicao = m;
    return m;
  }
}

/** Relógio manual para testes e simulação acelerada. */
export class RelogioManual implements FonteDeTempo {
  constructor(private ms: number) {}
  agora(): Date {
    return new Date(this.ms);
  }
  avancar(ms: number): void {
    this.ms += ms;
  }
  definir(d: Date): void {
    this.ms = d.getTime();
  }
}
