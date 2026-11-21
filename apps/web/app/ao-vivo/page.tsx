import { AoVivoPainel } from '@/components/AoVivoPainel';
import { FormFiltros, Seletor } from '@/components/FormFiltros';
import { fonteDeDados } from '@/lib/fonte-dados';
import { aoVivo, locais } from '@/lib/servico';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ao vivo na abertura' };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function AoVivo({ searchParams }: Props) {
  const sp = await searchParams;
  const fonte = fonteDeDados();
  const minha = await fonte.minhaLoterica();
  const uf = sp.uf ?? minha?.uf ?? 'SP';
  const destaque = sp.destaque ?? minha?.codigoCaixa ?? '';
  const { ufs } = await locais(fonte);
  const inicial = await aoVivo(fonte, { uf, destaque });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ao vivo na abertura</h1>
        <p className="text-sm text-zinc-500">Ordem de chegada do 1º bolão de cada lotérica na UF, atualizada a cada 5 s.</p>
      </div>
      <section className="cartao">
        <FormFiltros>
          <Seletor nome="uf" rotulo="UF" valor={uf} opcoes={ufs.map((u) => [u, u] as [string, string])} />
          <label className="flex flex-col gap-1">
            <span className="rotulo">Destacar (código)</span>
            <input name="destaque" defaultValue={destaque} className="campo tabular w-32" />
          </label>
        </FormFiltros>
      </section>
      <AoVivoPainel uf={uf} destaque={destaque} inicial={JSON.parse(JSON.stringify(inicial))} />
    </div>
  );
}
