import { Suspense, type ReactNode } from 'react';
import { SeletorLoja } from '@/components/SeletorLoja';
import { fonteDeDados } from '@/lib/fonte-dados';

const ABAS: [string, string][] = [
  ['/minha/boloes', 'Bolões MKP'],
  ['/minha/financeiro', 'Financeiro MKP'],
  ['/minha/conferencia', 'Conferência MKP'],
  ['/minha/posicao', 'Posição na abertura'],
  ['/minha/sugestoes', 'Sugestões'],
  ['/minha/simulador', 'Simulador de posição'],
  ['/minha/cronometro', 'Cronômetro'],
  ['/minha/site', 'Meu site'],
  ['/minha/midias', 'Mídias'],
];

export default async function LayoutMinha({ children }: { children: ReactNode }) {
  const lojas = await fonteDeDados()
    .minhasLotericas()
    .catch(() => []);
  return (
    <div className="space-y-6">
      <Suspense>
        <SeletorLoja lojas={lojas} abas={ABAS} />
      </Suspense>
      {children}
    </div>
  );
}
