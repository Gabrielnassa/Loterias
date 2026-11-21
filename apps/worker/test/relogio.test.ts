import { createSocket } from 'node:dgram';
import { describe, expect, it } from 'vitest';
import { consultarNtp, escreverTimestampNtp, Relogio } from '../src/relogio';

describe('relógio por NTP', () => {
  it('calcula o deslocamento com um servidor SNTP local adiantado 1,5 s', async () => {
    const servidor = createSocket('udp4');
    servidor.on('message', (msg, rinfo) => {
      const r = Buffer.alloc(48);
      r[0] = 0x24; // LI 0, VN 4, Mode 4 (servidor)
      const agora = Date.now() + 1500;
      escreverTimestampNtp(r, 32, agora);
      escreverTimestampNtp(r, 40, agora);
      servidor.send(r, rinfo.port, rinfo.address);
      void msg;
    });
    await new Promise<void>((ok) => servidor.bind(0, '127.0.0.1', ok));
    const porta = servidor.address().port;
    try {
      const m = await consultarNtp('127.0.0.1', porta);
      expect(m.offsetMs).toBeGreaterThan(1400);
      expect(m.offsetMs).toBeLessThan(1600);
      const r = new Relogio();
      await r.sincronizar('127.0.0.1', porta);
      expect(r.agora().getTime() - Date.now()).toBeGreaterThan(1400);
    } finally {
      servidor.close();
    }
  });

  it('sem resposta: rejeita por timeout (o worker segue com o relógio do sistema)', async () => {
    const mudo = createSocket('udp4');
    await new Promise<void>((ok) => mudo.bind(0, '127.0.0.1', ok));
    try {
      await expect(consultarNtp('127.0.0.1', mudo.address().port, 200)).rejects.toThrow(/sem resposta/);
    } finally {
      mudo.close();
    }
  });
});
