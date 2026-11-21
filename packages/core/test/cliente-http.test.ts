import { describe, expect, it } from 'vitest';
import {
  BloqueadoPelaFonteError,
  ClienteHttpEducado,
  FonteIndisponivelError,
  FormatoInesperadoError,
  LimiteDeRequisicoesError,
  lerRetryAfter,
} from '../fonte';

type Resp = { status: number; corpo?: string; tipo?: string; headers?: Record<string, string> } | Error;

function montar(respostas: Resp[]) {
  let relogio = 0;
  const esperas: number[] = [];
  const chamadas: { url: string; headers: Record<string, string> }[] = [];
  const fila = [...respostas];
  const fetchFalso = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, headers: init.headers as Record<string, string> });
    const r = fila.shift();
    if (!r) throw new Error('sem resposta configurada');
    if (r instanceof Error) throw r;
    return new Response(r.corpo ?? '{}', {
      status: r.status,
      headers: { 'content-type': r.tipo ?? 'application/json', ...r.headers },
    });
  }) as unknown as typeof fetch;
  const cliente = new ClienteHttpEducado({
    fetch: fetchFalso,
    dormir: async (ms) => {
      esperas.push(ms);
      relogio += ms;
    },
    agora: () => relogio,
    aleatorio: () => 0.5,
    intervaloMinimoMs: 250,
  });
  return { cliente, esperas, chamadas };
}

describe('cliente HTTP educado', () => {
  it('200 com JSON', async () => {
    const { cliente } = montar([{ status: 200, corpo: '{"ok":true}' }]);
    const r = await cliente.obter('https://exemplo.invalid/a', { esperaJson: true });
    expect(r.json()).toEqual({ ok: true });
  });

  it('respeita o intervalo mínimo entre requisições', async () => {
    const { cliente, esperas } = montar([{ status: 200 }, { status: 200 }]);
    await cliente.obter('https://exemplo.invalid/1');
    await cliente.obter('https://exemplo.invalid/2');
    expect(esperas).toEqual([250]);
  });

  it('5xx: backoff exponencial com jitter e nova tentativa', async () => {
    const { cliente, esperas, chamadas } = montar([{ status: 503 }, { status: 502 }, { status: 200 }]);
    await cliente.obter('https://exemplo.invalid/x');
    expect(chamadas).toHaveLength(3);
    // aleatorio = 0,5 => espera = teto/2 + 0,5 x teto/2 = 0,75 x teto (1 s, 2 s); o intervalo mínimo já passou
    expect(esperas).toEqual([750, 1500]);
  });

  it('desiste com FonteIndisponivelError após as tentativas', async () => {
    const { cliente, chamadas } = montar([{ status: 500 }, new TypeError('rede'), { status: 500 }, { status: 500 }]);
    await expect(cliente.obter('https://exemplo.invalid/x')).rejects.toThrow(FonteIndisponivelError);
    expect(chamadas).toHaveLength(4);
  });

  it('429: respeita Retry-After e dobra o intervalo mínimo', async () => {
    const { cliente, esperas } = montar([{ status: 429, headers: { 'retry-after': '7' } }, { status: 200 }]);
    await cliente.obter('https://exemplo.invalid/x');
    expect(esperas[0]).toBe(7000);
    expect(cliente.intervaloVigenteMs).toBe(450); // 500 após o 429, −10% após o sucesso
  });

  it('429 persistente vira LimiteDeRequisicoesError', async () => {
    const { cliente } = montar(Array.from({ length: 4 }, () => ({ status: 429 })));
    await expect(cliente.obter('https://exemplo.invalid/x')).rejects.toThrow(LimiteDeRequisicoesError);
  });

  it('403 para na hora, sem nova tentativa (não burlar bloqueio)', async () => {
    const { cliente, chamadas } = montar([{ status: 403 }, { status: 200 }]);
    await expect(cliente.obter('https://exemplo.invalid/x')).rejects.toThrow(BloqueadoPelaFonteError);
    expect(chamadas).toHaveLength(1);
  });

  it('página de captcha no lugar do JSON = bloqueio', async () => {
    const { cliente } = montar([{ status: 200, tipo: 'text/html', corpo: '<html><div class="g-recaptcha"></div></html>' }]);
    await expect(cliente.obter('https://exemplo.invalid/x', { esperaJson: true })).rejects.toThrow(BloqueadoPelaFonteError);
  });

  it('HTML comum no lugar do JSON = formato inesperado', async () => {
    const { cliente } = montar([{ status: 200, tipo: 'text/html', corpo: '<html>manutenção</html>' }]);
    await expect(cliente.obter('https://exemplo.invalid/x', { esperaJson: true })).rejects.toThrow(FormatoInesperadoError);
  });

  it('User-Agent genérico, sem dados pessoais', async () => {
    const { cliente, chamadas } = montar([{ status: 200 }]);
    await cliente.obter('https://exemplo.invalid/x');
    expect(chamadas[0]!.headers['user-agent']).toMatch(/^radar-loterico-coletor\//);
    expect(chamadas[0]!.headers['user-agent']).not.toMatch(/@/);
  });

  it('Retry-After em segundos ou data HTTP', () => {
    expect(lerRetryAfter('3', 0)).toBe(3000);
    expect(lerRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(lerRetryAfter('lixo', 0)).toBeUndefined();
    expect(lerRetryAfter(null, 0)).toBeUndefined();
  });
});
