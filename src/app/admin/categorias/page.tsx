import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardHeader, Input, PageHeader } from "@/components/ui";
import { saveCategoryAction } from "../actions";
import { adminRead } from "../db";

export const metadata = { title: "Categorias" };
interface Cat { id: string; slug: string; name: string; keywords: string[]; icon: string | null; sort_order: number; active: boolean; n: number }

function Row({ c }: { c?: Cat }) {
  return (
    <ActionForm action={saveCategoryAction} className="grid items-center gap-2 px-5 py-3 sm:grid-cols-[8rem_12rem_1fr_6rem_4rem_4rem_auto]">
      <input type="hidden" name="id" value={c?.id ?? ""} />
      <Input name="slug" defaultValue={c?.slug} placeholder="slug" required />
      <Input name="name" defaultValue={c?.name} placeholder="Nome" required />
      <Input name="keywords" defaultValue={c?.keywords.join(", ")} placeholder="palavras-chave separadas por vírgula" />
      <Input name="icon" defaultValue={c?.icon ?? ""} placeholder="ícone" />
      <Input name="sort_order" type="number" defaultValue={c?.sort_order ?? 50} />
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={c?.active ?? true} />Ativa</label>
      <SubmitButton s="sm" variant="secondary">Salvar</SubmitButton>
    </ActionForm>
  );
}

export default async function Categories() {
  const cats = await adminRead((tx) => tx.many<Cat>("SELECT c.*, (SELECT count(*)::int FROM price_registration_atas a WHERE a.category_id = c.id) n FROM categories c ORDER BY sort_order"));
  return (
    <>
      <PageHeader title="Categorias" description="As palavras-chave alimentam a classificação automática (sempre marcada como sugerida). A moderação pode fixar a categoria de cada ata." />
      <Card><CardHeader title="Categorias cadastradas" />
        <div className="divide-y divide-slate-100">{cats.map((c) => <div key={c.id}><Row c={c} /><p className="-mt-2 px-5 pb-2 text-xs text-slate-500">{c.n} ata(s)</p></div>)}</div>
      </Card>
      <Card className="mt-6"><CardHeader title="Nova categoria" /><Row /></Card>
    </>
  );
}
