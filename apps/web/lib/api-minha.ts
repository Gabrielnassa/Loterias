import { arquivo, erro, json, TIPO_CSV, TIPO_XLSX } from './api';
import { AVISO_ESTIMATIVA, paraCsv, paraXlsx, type Coluna } from './exportar';
import { MinhaIndisponivel } from './minha';

/** Responde JSON, CSV ou XLSX e trata "Minha lotérica indisponível" (sem banco/sem lotérica). */
export async function responder<T>(req: Request, gerar: () => Promise<{ linhas: T[] } & Record<string, unknown>>, exp: { nome: string; aba: string; colunas: Coluna<T>[] }) {
  try {
    const d = await gerar();
    const formato = new URL(req.url).searchParams.get('formato');
    if (formato === 'csv') return arquivo(paraCsv(exp.colunas, d.linhas), `${exp.nome}.csv`, TIPO_CSV);
    if (formato === 'xlsx') return arquivo(await paraXlsx(exp.aba, exp.colunas, d.linhas, AVISO_ESTIMATIVA), `${exp.nome}.xlsx`, TIPO_XLSX);
    return json(d);
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return erro(e.message, 409);
    throw e;
  }
}
