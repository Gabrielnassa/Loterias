import type { FonteSimuladaRaioX } from '@/lib/dados';
import { assinaturaInicial } from '@radar/core';
import { estadoVazio, lerEstadoContas, RepositorioContasMemoria, type EstadoContas } from '@/lib/contas/memoria';
import { fonteDeDados } from './fonte-dados';

/**
 * Contas na demonstração: o mesmo repositório em memória do servidor, guardado no localStorage do
 * navegador (só desta pessoa; nada sai do aparelho). Começa com uma conta de exemplo: você é o
 * responsável, com uma sócia, um colaborador e um convite pendente. Todos FICTÍCIOS.
 */
const CHAVE = 'radar-demo-contas-v1';
let repo: RepositorioContasMemoria | null = null;
let sessao: { usuarioId: string; contaId: string } | null = null;

function salvar(e: EstadoContas) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ estado: e, sessao }));
  } catch {
    // sem localStorage (janela anônima): a demonstração segue só na memória
  }
}

async function semear(r: RepositorioContasMemoria): Promise<{ usuarioId: string; contaId: string }> {
  const lotericas = (fonteDeDados() as FonteSimuladaRaioX).historico().lotericas;
  const conta = await r.criarConta('Lotéricas da Demonstração');
  for (const l of lotericas.slice(0, 2)) await r.salvarLoja({ contaId: conta.id, codigo: l.codigoCaixa, nome: l.nome, franquiaLimite: 8000 });
  const agora = new Date();
  const voce = await r.criarUsuario({ email: 'voce@demonstracao.radar', nome: 'Você (demonstração)', emailVerificadoEm: agora });
  const socia = await r.criarUsuario({ email: 'socia@demonstracao.radar', nome: 'Sócia Exemplo', emailVerificadoEm: agora });
  const caixa = await r.criarUsuario({ email: 'caixa@demonstracao.radar', nome: 'Caixa Exemplo', emailVerificadoEm: agora });
  await r.salvarMembro({ contaId: conta.id, usuarioId: voce.id, papel: 'responsavel', telas: null, lojas: null });
  await r.salvarAssinatura(assinaturaInicial(conta.id, agora));
  await r.salvarMembro({ contaId: conta.id, usuarioId: socia.id, papel: 'socio', telas: null, lojas: null });
  await r.salvarMembro({ contaId: conta.id, usuarioId: caixa.id, papel: 'colaborador', telas: ['minha-boloes', 'minha-cronometro', 'gestao-caixa'], lojas: [lotericas[0]!.codigoCaixa] });
  await r.criarConvite({ contaId: conta.id, email: 'novo.colaborador@demonstracao.radar', papel: 'colaborador', telas: null, lojas: null, tokenHash: 'demo', criadoPor: voce.id, expiraEm: new Date(agora.getTime() + 7 * 86_400_000) });
  return { usuarioId: voce.id, contaId: conta.id };
}

export async function repositorioDemo(): Promise<{ repo: RepositorioContasMemoria; sessao: { usuarioId: string; contaId: string } }> {
  if (repo && sessao) return { repo, sessao };
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo) {
      const j = JSON.parse(salvo) as { estado: unknown; sessao: { usuarioId: string; contaId: string } };
      repo = new RepositorioContasMemoria(lerEstadoContas(JSON.stringify(j.estado)), salvar);
      sessao = j.sessao;
      if (await repo.membro(sessao.contaId, sessao.usuarioId)) return { repo, sessao };
    }
  } catch {
    // estado salvo ilegível: recomeça
  }
  repo = new RepositorioContasMemoria(estadoVazio(), salvar);
  sessao = await semear(repo);
  salvar(repo.estado);
  return { repo, sessao };
}

/** Recomeça a demonstração das contas do zero. */
export function zerarContasDemo() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    // nada a fazer
  }
  repo = null;
  sessao = null;
}
