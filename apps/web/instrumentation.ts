/** Pré-aquece a fonte de dados na partida do servidor (o histórico simulado leva ~2 s para gerar). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { fonteDeDados } = await import('./lib/dados');
    await fonteDeDados().aberturas();
  }
}
