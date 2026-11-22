import { BASE } from './preparar';

const ARTES: [string, string, string][] = [
  ['resultado', 'Resultado do sorteio', 'Com a marca da lotérica, logo depois do sorteio'],
  ['boloes', 'Bolões disponíveis', 'Os bolões à venda, com o valor da cota'],
  ['premiado', 'Bolão premiado', 'O maior prêmio dos bolões da lotérica'],
  ['saiu-aqui', 'Saiu aqui!', 'Para comemorar o prêmio na lotérica'],
];

/** Mídias na demonstração: as artes foram geradas no build (no sistema completo, sob demanda). */
export default function MidiasDemo() {
  return (
    <div className="space-y-4">
      <p className="cartao text-sm">
        No sistema completo, estas artes são geradas na hora pelo servidor com a marca da sua lotérica (Satori). Aqui, foram geradas no build da
        demonstração, com dados de exemplo.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {ARTES.map(([tipo, titulo, desc]) => (
          <figure key={tipo} className="cartao space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE}/artes/${tipo}.png`} alt={titulo} width={540} height={540} className="h-auto w-full rounded-lg" loading="lazy" />
            <figcaption className="flex items-center justify-between gap-2">
              <span>
                <strong>{titulo}</strong>
                <span className="block text-xs text-zinc-500">{desc}</span>
              </span>
              <a className="botao" href={`${BASE}/artes/${tipo}.png`} download={`arte-${tipo}.png`}>
                Baixar PNG
              </a>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
