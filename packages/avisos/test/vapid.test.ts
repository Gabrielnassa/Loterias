import webpush from 'web-push';
import { describe, expect, it } from 'vitest';
import { gerarParVapid } from '@radar/db/config-sistema';

describe('chaves VAPID geradas pelo container migrate', () => {
  it('o web-push aceita o par e assina o cabeçalho de autorização', () => {
    const p = gerarParVapid();
    expect(() => webpush.setVapidDetails('mailto:teste@exemplo.com', p.publica, p.privada)).not.toThrow();
    const h = webpush.getVapidHeaders('https://fcm.googleapis.com', 'mailto:teste@exemplo.com', p.publica, p.privada, 'aes128gcm');
    expect(h.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    expect(h.Authorization).toContain(`k=${p.publica}`);
  });
});
