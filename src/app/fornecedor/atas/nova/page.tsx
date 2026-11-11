import { FileUp, PencilLine } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Notice, PageHeader } from "@/components/ui";
import { AtaHeaderForm } from "../header-form";
import { uploadExtractAction } from "../../actions";

export const metadata = { title: "Cadastrar ata" };

export default function NewAta() {
  const llm = Boolean(process.env.ANTHROPIC_API_KEY);
  return (
    <>
      <PageHeader title="Cadastrar ata" description="Envie o PDF para preenchimento automático ou cadastre os dados manualmente. Em ambos os casos, você revisa tudo antes de enviar para validação." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <FileUp className="size-6 text-brand-600" aria-hidden />
          <h2 className="mt-3 font-semibold text-navy-900">Enviar PDF da ata</h2>
          <p className="mt-1 text-sm text-slate-600">
            {llm ? "Extração com IA: número da ata, pregão, órgão, CNPJs, objeto, datas, vigência, itens, quantidades e preços (inclusive documentos digitalizados)." : "Extração básica por padrões de texto. Configure a integração de IA para extração completa de itens e OCR."}
          </p>
          <ActionForm action={uploadExtractAction} className="mt-4 space-y-3">
            <input type="file" name="file" accept="application/pdf" required className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-brand-700" />
            <SubmitButton pendingText="Processando documento… (pode levar até 1 minuto)">Enviar e extrair dados</SubmitButton>
          </ActionForm>
          <Notice tone="amber" className="mt-4">Dados extraídos automaticamente nunca são considerados validados: revise e corrija cada campo antes do envio.</Notice>
        </Card>
        <Card className="p-6">
          <PencilLine className="size-6 text-brand-600" aria-hidden />
          <h2 className="mt-3 font-semibold text-navy-900">Cadastro manual</h2>
          <p className="mt-1 text-sm text-slate-600">Preencha a identificação; na próxima etapa inclua itens e anexe o documento.</p>
          <div className="mt-4"><AtaHeaderForm /></div>
        </Card>
      </div>
    </>
  );
}
