/** Avisa a interface (faixa/toast) que algo precisa do servidor ou não sai do navegador. */
export function avisar(mensagem: string) {
  window.dispatchEvent(new CustomEvent('demo:aviso', { detail: mensagem }));
}
