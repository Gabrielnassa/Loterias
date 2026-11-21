import { AVISO_ESTIMATIVA } from './exportar';
import { fonteDeDados } from './dados';

/** Resposta JSON da API com o aviso de que os números são estimativas. */
export function json(dados: unknown, status = 200): Response {
  const fonte = fonteDeDados();
  return Response.json(
    { fonte: fonte.tipo, aviso: AVISO_ESTIMATIVA, geradoEm: new Date().toISOString(), dados },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

export function erro(mensagem: string, status: number): Response {
  return Response.json({ erro: mensagem }, { status });
}

export function arquivo(conteudo: string | Buffer, nome: string, tipo: string): Response {
  return new Response(typeof conteudo === 'string' ? conteudo : new Uint8Array(conteudo), {
    headers: { 'content-type': tipo, 'content-disposition': `attachment; filename="${nome}"`, 'cache-control': 'no-store' },
  });
}

export const TIPO_CSV = 'text/csv; charset=utf-8';
export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
