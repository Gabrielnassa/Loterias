export function AvisoDados({ simulado }: { simulado: boolean }) {
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      {simulado ? (
        <>
          <strong>Dados simulados</strong> (lotéricas fictícias, seed de demonstração), gerados pelas mesmas regras do coletor, até o coletor real ter histórico.{' '}
        </>
      ) : null}
      Vendas, sobras, horários e colocações são <strong>estimativas</strong> a partir de leituras periódicas da vitrine pública; não são dados oficiais da CAIXA.
    </div>
  );
}
