import { lerPreferencias, PREFERENCIAS_PADRAO, type PreferenciasAparelho } from '@radar/core';
import type { Aparelho, MembroDestino, Monitorada, Notificacao, RepositorioAvisos, ResultadoPush } from './tipos';

/** Estado serializável (a demonstração guarda no localStorage). */
export interface EstadoAvisos {
  monitoradas: Monitorada[];
  aparelhos: Aparelho[];
  notificacoes: Notificacao[];
  proximoId: number;
}

export const estadoAvisosVazio = (): EstadoAvisos => ({ monitoradas: [], aparelhos: [], notificacoes: [], proximoId: 1 });

const DATAS = new Set(['criadoEm', 'vistoEm', 'desativadoEm', 'lidaEm']);
export function lerEstadoAvisos(json: string): EstadoAvisos {
  return JSON.parse(json, (k, v) => (DATAS.has(k) && typeof v === 'string' ? new Date(v) : v)) as EstadoAvisos;
}

/** Quem está em cada conta e quais lojas cada conta tem (vem do repositório de contas). */
export interface FonteDeMembros {
  membros(contaId: string): Promise<MembroDestino[]>;
  contasComLoja(codigo: string): Promise<string[]>;
  usuariosComConta(): Promise<{ usuarioId: string; contaId: string }[]>;
}

const copia = <T>(x: T): T => ({ ...x });

export class RepositorioAvisosMemoria implements RepositorioAvisos {
  readonly tipo = 'memoria' as const;
  constructor(
    private readonly membros: FonteDeMembros,
    readonly estado: EstadoAvisos = estadoAvisosVazio(),
    private readonly aoMudar: (e: EstadoAvisos) => void = () => {},
  ) {}

  private mudou() {
    this.aoMudar(this.estado);
  }

  async monitoradas(contaId: string) {
    return this.estado.monitoradas.filter((m) => m.contaId === contaId).sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime()).map(copia);
  }
  async contasQueMonitoram(codigos?: readonly string[]) {
    const out = new Map<string, string[]>();
    for (const m of this.estado.monitoradas) {
      if (codigos && !codigos.includes(m.codigo)) continue;
      out.set(m.codigo, [...(out.get(m.codigo) ?? []), m.contaId]);
    }
    return out;
  }
  async monitorar(m: { contaId: string; codigo: string; apelido?: string | null }) {
    const atual = this.estado.monitoradas.find((x) => x.contaId === m.contaId && x.codigo === m.codigo);
    if (atual) atual.apelido = m.apelido ?? atual.apelido;
    else this.estado.monitoradas.push({ contaId: m.contaId, codigo: m.codigo, apelido: m.apelido ?? null, criadoEm: new Date() });
    this.mudou();
  }
  async deixarDeMonitorar(contaId: string, codigo: string) {
    this.estado.monitoradas = this.estado.monitoradas.filter((x) => !(x.contaId === contaId && x.codigo === codigo));
    this.mudou();
  }

  membrosDaConta(contaId: string) {
    return this.membros.membros(contaId);
  }
  contasComLoja(codigo: string) {
    return this.membros.contasComLoja(codigo);
  }
  usuariosComConta() {
    return this.membros.usuariosComConta();
  }

  async aparelhos(usuarioId: string) {
    return this.estado.aparelhos.filter((a) => a.usuarioId === usuarioId && !a.desativadoEm).map(copia);
  }
  async aparelhoPorEndpoint(endpoint: string) {
    const a = this.estado.aparelhos.find((x) => x.endpoint === endpoint);
    return a ? copia(a) : null;
  }
  async salvarAparelho(a: { usuarioId: string; endpoint: string; p256dh: string; auth: string; nome?: string | null; preferencias?: PreferenciasAparelho }) {
    const agora = new Date();
    let x = this.estado.aparelhos.find((y) => y.endpoint === a.endpoint);
    if (x) Object.assign(x, { usuarioId: a.usuarioId, p256dh: a.p256dh, auth: a.auth, nome: a.nome ?? x.nome, vistoEm: agora, falhas: 0, desativadoEm: null, ...(a.preferencias ? { preferencias: a.preferencias } : {}) });
    else {
      x = { id: globalThis.crypto.randomUUID(), usuarioId: a.usuarioId, endpoint: a.endpoint, p256dh: a.p256dh, auth: a.auth, nome: a.nome ?? null, preferencias: a.preferencias ?? { ...PREFERENCIAS_PADRAO }, criadoEm: agora, vistoEm: agora, falhas: 0, desativadoEm: null };
      this.estado.aparelhos.push(x);
    }
    this.mudou();
    return copia(x);
  }
  async preferenciasDoAparelho(id: string, usuarioId: string, p: PreferenciasAparelho) {
    const a = this.estado.aparelhos.find((x) => x.id === id && x.usuarioId === usuarioId);
    if (!a) return false;
    a.preferencias = lerPreferencias(p);
    this.mudou();
    return true;
  }
  async removerAparelho(id: string, usuarioId: string) {
    this.estado.aparelhos = this.estado.aparelhos.filter((x) => !(x.id === id && x.usuarioId === usuarioId));
    this.mudou();
  }
  async registrarEnvio(id: string, r: ResultadoPush, em: Date) {
    const a = this.estado.aparelhos.find((x) => x.id === id);
    if (!a) return;
    if (r === 'ok') Object.assign(a, { falhas: 0, vistoEm: em });
    else if (r === 'expirado') a.desativadoEm = em;
    else if (++a.falhas >= 10) a.desativadoEm = em;
    this.mudou();
  }

  async criarNotificacao(n: Omit<Notificacao, 'id' | 'lidaEm' | 'enviadas'>) {
    if (this.estado.notificacoes.some((x) => x.usuarioId === n.usuarioId && x.chave === n.chave)) return null;
    const nova: Notificacao = { ...n, id: String(this.estado.proximoId++), lidaEm: null, enviadas: 0 };
    this.estado.notificacoes.push(nova);
    // a central guarda as 300 mais recentes por pessoa
    const minhas = this.estado.notificacoes.filter((x) => x.usuarioId === n.usuarioId);
    if (minhas.length > 300) {
      const corte = new Set(minhas.sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime()).slice(0, minhas.length - 300).map((x) => x.id));
      this.estado.notificacoes = this.estado.notificacoes.filter((x) => !corte.has(x.id));
    }
    this.mudou();
    return copia(nova);
  }
  async notificacoes(usuarioId: string, limite = 50) {
    return this.estado.notificacoes
      .filter((x) => x.usuarioId === usuarioId)
      .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime() || Number(b.id) - Number(a.id))
      .slice(0, limite)
      .map(copia);
  }
  async naoLidas(usuarioId: string) {
    return this.estado.notificacoes.filter((x) => x.usuarioId === usuarioId && !x.lidaEm).length;
  }
  async marcarLidas(usuarioId: string, ids?: readonly string[]) {
    const agora = new Date();
    for (const n of this.estado.notificacoes) if (n.usuarioId === usuarioId && !n.lidaEm && (!ids || ids.includes(n.id))) n.lidaEm = agora;
    this.mudou();
  }
  async contarEnvio(notificacaoId: string, n: number) {
    const x = this.estado.notificacoes.find((y) => y.id === notificacaoId);
    if (x) x.enviadas += n;
    this.mudou();
  }
}
