import { Indisponivel } from '@/components/Indisponivel';
import { fonteDeDados } from '@/lib/fonte-dados';
import { minhaLoterica, MinhaIndisponivel } from '@/lib/minha';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mídias' };

const ARTES: [string, string, string][] = [
  ['resultado', 'Resultado do sorteio', 'Com a sua marca, logo depois do sorteio'],
  ['boloes', 'Bolões disponíveis', 'Os bolões à venda agora, com o valor da cota'],
  ['premiado', 'Bolão premiado', 'O maior prêmio dos seus bolões nos últimos 30 dias'],
  ['saiu-aqui', 'Saiu aqui!', 'Para comemorar o prêmio na lotérica'],
];

export default async function Midias({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  let loja;
  try {
    loja = await minhaLoterica(fonteDeDados(), sp.loja ?? null);
  } catch (e) {
    if (e instanceof MinhaIndisponivel) return <Indisponivel mensagem={e.message} />;
    throw e;
  }
  const modalidade = sp.modalidade ?? 'mega-sena';
  const q = (tipo: string) => `/api/artes/${tipo}?loja=${loja.codigoCaixa}${tipo === 'resultado' ? `&modalidade=${modalidade}` : ''}`;
  return (
    <div className="space-y-4">
      <form method="get" className="cartao flex flex-wrap items-end gap-3">
        <input type="hidden" name="loja" value={loja.codigoCaixa} />
        <label className="flex flex-col gap-1">
          <span className="rotulo">Resultado de</span>
          <select name="modalidade" defaultValue={modalidade} className="campo">
            {['mega-sena', 'lotofacil', 'quina', 'dupla-sena', 'lotomania', 'timemania', 'dia-de-sorte', 'mais-milionaria', 'super-sete'].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <button className="botao" type="submit">
          Gerar
        </button>
        <p className="text-xs text-zinc-500">A marca (nome, WhatsApp, Instagram, endereço) vem da configuração do seu site. Sem banco ou sem prêmio no período, as artes usam dados de demonstração.</p>
      </form>
      <div className="grid gap-4 md:grid-cols-2">
        {ARTES.map(([tipo, titulo, desc]) => (
          <figure key={tipo} className="cartao space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${q(tipo)}&tamanho=540`} alt={titulo} width={540} height={540} className="h-auto w-full rounded-lg" loading="lazy" />
            <figcaption className="flex items-center justify-between gap-2">
              <span>
                <strong>{titulo}</strong>
                <span className="block text-xs text-zinc-500">{desc}</span>
              </span>
              <a className="botao" href={`${q(tipo)}&baixar=1`}>
                Baixar PNG
              </a>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
