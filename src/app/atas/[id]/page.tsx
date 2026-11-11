import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ExternalLink, FileText, Heart, Lock } from "lucide-react";
import { DataNotice, LegalNotice, OriginBadge, StatusBadge, ValidityBadge } from "@/components/ata-bits";
import { CompareToggle } from "@/components/compare";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ShareButtons } from "@/components/share";
import { Badge, Card, CardHeader, Dl, Field, Input, LinkButton, Notice, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { getCurrentUser, userDb } from "@/lib/auth/session";
import { systemDb } from "@/lib/db";
import { ADHESION_CHECKLIST, CHECK_LEVEL_LABEL, evaluateAdhesion } from "@/lib/atas/compliance";
import { getAtaDetail } from "@/lib/atas/queries";
import { SPHERE_LABEL, STATUS_INFO, ataLabel, type AtaStatus } from "@/lib/atas/status";
import { brl, dateBR, dateTimeBR, formatCnpj, num } from "@/lib/format";
import { parseBrNumber, uuidSchema } from "@/lib/validators";
import { contactRequestAction, toggleFavoriteAction } from "@/app/orgao/actions";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ item?: string; qtd?: string; enviado?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return {};
  const d = await userDb((tx) => tx.one<{ ata_number: string; object: string }>("SELECT ata_number, object FROM price_registration_atas WHERE id = $1", [id]));
  return d ? { title: `Ata nº ${d.ata_number}`, description: d.object.slice(0, 160) } : {};
}

const LINK_LABEL: Record<string, string> = {
  informado_fornecedor: "Informado pelo fornecedor",
  vinculo_unico_fonte: "Contratação com ata única (fonte)",
  nao_vinculado: "Vínculo com esta ata não informado pela fonte",
};

export default async function AtaPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();
  const user = await getCurrentUser();
  const data = await userDb(async (tx) => {
    const d = await getAtaDetail(tx, id);
    if (!d) return null;
    let fav = false;
    let requesterSphere: string | null = null;
    if (user) fav = Boolean(await tx.one("SELECT 1 FROM favorites WHERE user_id = $1 AND ata_id = $2", [user.id, id]));
    if (user?.activeOrg?.kind === "government")
      requesterSphere = (await tx.one<{ sphere: string | null }>("SELECT sphere FROM organizations WHERE id = $1", [user.activeOrg.organization_id]))?.sphere ?? null;
    return { ...d, fav, requesterSphere };
  });
  if (!data) notFound();
  const { ata, supplier, items, documents, history, changes, assessments } = data;
  const isPublic = STATUS_INFO[ata.status as AtaStatus]?.public;
  if (isPublic) void systemDb(async (tx) => {
    await tx.exec("INSERT INTO ata_view_events(ata_id, viewer_kind) VALUES ($1,$2)", [id, user ? (user.platform_role === "admin" ? "admin" : user.activeOrg?.kind === "government" ? "orgao" : "fornecedor") : "anonimo"]);
    await tx.exec("UPDATE price_registration_atas SET views_count = views_count + 1 WHERE id = $1", [id]);
  }).catch(() => {});

  const isGov = user?.activeOrg?.kind === "government";
  const isSupplier = user?.activeOrg?.kind === "supplier";
  const selItem = items.find((i) => i.id === sp.item) ?? null;
  const checks = evaluateAdhesion({
    validityEnd: ata.validity_end, cancelled: ata.cancelled, status: ata.status, validityConfirmed: ata.validity_confirmed,
    sourceReportedAdhesion: ata.source_reported_adhesion, managingSphere: ata.manager_sphere, requesterSphere: data.requesterSphere,
    itemQuantity: selItem?.quantity ? Number(selItem.quantity) : null, intendedQuantity: parseBrNumber(sp.qtd),
  });
  const itemSuppliers = [...new Map(items.filter((i) => i.supplier_name).map((i) => [i.supplier_ni ?? i.supplier_name, i])).values()];
  const unlinked = items.some((i) => i.link_status === "nao_vinculado");
  const levelTone = { ok: "green", info: "blue", atencao: "amber", impeditivo: "red" } as const;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <nav className="text-sm text-slate-500" aria-label="Trilha"><Link href="/atas" className="hover:underline">Atas</Link> / Ata nº {ata.ata_number}</nav>
      {!isPublic && <Notice tone="amber" className="mt-3" title="Ata não publicada">Visível apenas para a empresa responsável e a administração ({STATUS_INFO[ata.status as AtaStatus]?.label}).</Notice>}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={ata.status} />
            <ValidityBadge end={ata.validity_end} cancelled={ata.cancelled} status={ata.status} />
            <OriginBadge origin={ata.origin} source={ata.source_name} />
            {ata.category_name && <Badge tone="gray">{ata.category_name}</Badge>}
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-navy-900">Ata de Registro de Preços nº {ataLabel(ata.ata_number, ata.year)}</h1>
          <p className="mt-1 text-slate-600">{ata.manager_name}{ata.city ? ` · ${ata.city}/${ata.state}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isGov && (
            <form action={toggleFavoriteAction}>
              <input type="hidden" name="ata_id" value={ata.id} />
              <SubmitButton variant="secondary" s="sm"><Heart className={`size-4 ${data.fav ? "fill-red-500 text-red-500" : ""}`} />{data.fav ? "Favoritada" : "Favoritar"}</SubmitButton>
            </form>
          )}
          {!user && <LinkButton href={`/entrar?next=/atas/${ata.id}`} variant="secondary" s="sm"><Heart className="size-4" />Favoritar</LinkButton>}
          <span className="rounded-lg border border-slate-300 px-3 py-1.5"><CompareToggle id={ata.id} /></span>
          <ShareButtons title={`Ata nº ${ata.ata_number} — ${ata.manager_name ?? ""}`} />
          {isPublic && <LinkButton href="#solicitar" s="sm">Solicitar informações</LinkButton>}
        </div>
      </div>

      <div className="mt-6"><LegalNotice /></div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Identificação" />
            <div className="space-y-4 p-5">
              <p className="text-sm leading-relaxed text-slate-800"><span className="font-medium">Objeto: </span>{ata.object}</p>
              <Dl items={[
                ["Número da ata", ata.ata_number],
                ["Processo administrativo", ata.process_number],
                ["Procedimento de origem", ata.procurement_reference ?? ata.modality],
                ["Órgão gerenciador", ata.manager_name ? <>{ata.manager_id ? <Link href={`/orgaos/${ata.manager_id}`} className="text-brand-700 hover:underline">{ata.manager_name}</Link> : ata.manager_name}<span className="block text-xs text-slate-500">{formatCnpj(ata.manager_cnpj)} · {SPHERE_LABEL[ata.manager_sphere ?? ""] ?? "Esfera não informada"}</span></> : null],
                ["Unidade / UASG", [ata.managing_unit_name, ata.uasg].filter(Boolean).join(" · ") || null],
                ["Data de assinatura", dateBR(ata.signature_date)],
                ["Início da vigência", dateBR(ata.validity_start)],
                ["Fim da vigência", dateBR(ata.validity_end)],
              ]} />
              {ata.source_reported_adhesion !== null && (
                <DataNotice>Campo “possibilidade de adesão” informado pelo órgão à fonte: <strong>{ata.source_reported_adhesion ? "sim" : "não"}</strong>. Não constitui autorização.</DataNotice>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={`Itens registrados (${items.length})`} description="Preços e quantidades homologados conforme a fonte. Quantidade registrada não é saldo disponível." />
            {unlinked && (
              <div className="px-5 pt-4"><Notice tone="amber">Esta contratação gerou mais de uma ata e a fonte pública não informa a qual ata cada item pertence. Os itens abaixo são da contratação de origem — confirme no documento original.</Notice></div>
            )}
            {items.length === 0 ? <p className="p-5 text-sm text-slate-500">Itens ainda não disponíveis para esta ata. Consulte o documento original.</p> : (
              <Table className="mt-2">
                <thead><tr><Th>Item</Th><Th>Código</Th><Th>Descrição</Th><Th>Unid.</Th><Th className="text-right">Qtd. registrada</Th><Th className="text-right">Valor unitário</Th><Th className="text-right">Valor total</Th><Th>Fornecedor</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((i) => (
                    <tr key={i.id}>
                      <Td className="tabular">{i.item_number ?? "—"}</Td>
                      <Td className="whitespace-nowrap text-xs">{i.catalog_code ? `${i.catalog_type ?? ""} ${i.catalog_code}` : "—"}</Td>
                      <Td className="min-w-64">{i.description}{i.link_status !== "informado_fornecedor" && <span className="mt-0.5 block text-[11px] text-slate-400">{LINK_LABEL[i.link_status]}</span>}</Td>
                      <Td className="text-xs">{i.unit ?? "—"}</Td>
                      <Td className="text-right tabular">{num(i.quantity)}</Td>
                      <Td className="text-right tabular font-medium text-slate-900">{brl(i.unit_price)}</Td>
                      <Td className="text-right tabular">{brl(i.total_price)}</Td>
                      <Td className="min-w-48 text-xs">{i.supplier_id ? <Link className="text-brand-700 hover:underline" href={`/fornecedores/${i.supplier_id}`}>{i.supplier_name}</Link> : i.supplier_name ?? "—"}{i.supplier_ni && <span className="block text-slate-400">{formatCnpj(i.supplier_ni)}</span>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card id="adesao">
            <CardHeader title="Apoio à conferência de adesão (art. 86 da Lei 14.133/2021)" description="Indicadores automáticos a partir dos dados disponíveis. Não substitui a instrução processual nem a análise jurídica." />
            <div className="space-y-4 p-5">
              {items.length > 0 && (
                <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3">
                  <Field label="Item de interesse" className="min-w-56 flex-1">
                    <Select name="item" defaultValue={sp.item ?? ""}><option value="">Selecione</option>{items.slice(0, 300).map((i) => <option key={i.id} value={i.id}>{i.item_number ?? "?"} — {i.description.slice(0, 70)}</option>)}</Select>
                  </Field>
                  <Field label="Quantidade pretendida" className="w-44"><Input name="qtd" defaultValue={sp.qtd} inputMode="decimal" /></Field>
                  <button className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium">Verificar limite</button>
                </form>
              )}
              <ul className="space-y-2">
                {checks.map((c) => (
                  <li key={c.id} className="flex gap-3 rounded-lg border border-slate-200 p-3">
                    <Badge tone={levelTone[c.level]} className="h-fit">{CHECK_LEVEL_LABEL[c.level]}</Badge>
                    <div className="text-sm">
                      <p className="font-medium text-slate-900">{c.title}{c.reference && <span className="ml-2 text-xs font-normal text-slate-500">{c.reference}</span>}</p>
                      <p className="text-slate-600">{c.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <details className="rounded-lg border border-slate-200 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-slate-900">Checklist de instrução processual do órgão não participante</summary>
                <ul className="mt-3 space-y-1.5 text-slate-700">
                  {ADHESION_CHECKLIST.map((c) => <li key={c.id} className="flex gap-2"><span aria-hidden>☐</span><span>{c.label} <span className="text-xs text-slate-500">({c.reference})</span></span></li>)}
                </ul>
              </details>
              {assessments.length > 0 && (
                <div className="rounded-lg border border-slate-200 p-3 text-sm">
                  <p className="font-medium text-slate-900">Análise de potencial de adesão registrada pela plataforma</p>
                  {assessments.filter((a) => a.scope === "plataforma").slice(0, 1).map((a, idx) => (
                    <div key={idx} className="mt-2 text-slate-700">
                      <p>Conclusão: <strong>{{ sem_impedimento_aparente: "Sem impedimento aparente", requer_analise_adicional: "Requer análise adicional", impedimento_identificado: "Impedimento identificado" }[a.conclusion]}</strong> · {dateBR(a.created_at)}</p>
                      {a.caveats && <p className="mt-1 text-slate-600">Ressalvas: {a.caveats}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {isPublic && (
            <Card id="solicitar">
              <CardHeader title="Solicitar informações ao fornecedor" description="Manifestação comercial: não representa adesão formal nem compromisso de contratação." />
              <div className="p-5">
                {isGov ? (
                  sp.enviado ? <Notice tone="green" title="Solicitação registrada">Acompanhe o andamento em <Link href="/orgao/solicitacoes" className="underline">Minhas solicitações</Link>.</Notice> : (
                    <ActionForm action={contactRequestAction} className="grid gap-4 sm:grid-cols-2">
                      <input type="hidden" name="ata_id" value={ata.id} />
                      <Field label="Órgão solicitante"><Input value={user!.activeOrg!.legal_name} disabled /></Field>
                      <Field label="Tipo"><Select name="kind" defaultValue="informacoes"><option value="informacoes">Solicitar informações</option><option value="interesse_comercial">Demonstrar interesse comercial</option></Select></Field>
                      <Field label="Item de interesse" className="sm:col-span-2">
                        <Select name="ata_item_id" defaultValue={sp.item ?? ""}><option value="">Ata completa</option>{items.slice(0, 300).map((i) => <option key={i.id} value={i.id}>{i.item_number ?? "?"} — {i.description.slice(0, 80)}{i.supplier_name ? ` (${i.supplier_name.slice(0, 30)})` : ""}</option>)}</Select>
                      </Field>
                      <Field label="Quantidade pretendida"><Input name="intended_quantity" inputMode="decimal" defaultValue={sp.qtd} /></Field>
                      <Field label="Responsável" required><Input name="contact_name" defaultValue={user!.full_name} required /></Field>
                      <Field label="E-mail institucional" required><Input name="contact_email" type="email" defaultValue={user!.email} required /></Field>
                      <Field label="Telefone"><Input name="contact_phone" type="tel" /></Field>
                      <Field label="Mensagem" required className="sm:col-span-2"><Textarea name="message" required minLength={10} maxLength={3000} placeholder="Descreva a necessidade, prazos e informações que deseja obter (ex.: disponibilidade, condições de entrega, documentação)." /></Field>
                      <label className="flex items-start gap-2 text-xs text-slate-600 sm:col-span-2"><input type="checkbox" name="ack" required className="mt-0.5" />Estou ciente de que esta solicitação não constitui adesão, autorização do órgão gerenciador ou compromisso de contratação.</label>
                      <div className="sm:col-span-2"><SubmitButton>Enviar solicitação</SubmitButton></div>
                    </ActionForm>
                  )
                ) : (
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                    <Lock className="size-4" aria-hidden />
                    <span>Disponível para órgãos públicos cadastrados.</span>
                    {!user && <LinkButton href={`/entrar?next=/atas/${ata.id}%23solicitar`} s="sm" variant="secondary">Entrar</LinkButton>}
                    {!user && <LinkButton href="/cadastro/orgao" s="sm">Cadastrar órgão</LinkButton>}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Fornecedor" />
            <div className="space-y-3 p-5 text-sm">
              {supplier ? (
                <>
                  <p className="font-medium text-slate-900">{supplier.legal_name}</p>
                  {supplier.trade_name && <p className="text-slate-600">{supplier.trade_name}</p>}
                  <p className="tabular text-slate-600">CNPJ {formatCnpj(supplier.cnpj)}</p>
                  {supplier.city && <p className="text-slate-600">{supplier.city}/{supplier.state}</p>}
                  <p>{ata.supplier_confirmed ? <Badge tone="green">Vínculo com a ata comprovado</Badge> : <Badge tone="gray">Vínculo não verificado pela plataforma</Badge>}</p>
                  {supplier.account_linked ? (
                    supplier.public_email || supplier.public_phone ? (
                      <p className="text-slate-700">Contato: {supplier.public_email}{supplier.public_phone ? ` · ${supplier.public_phone}` : ""}</p>
                    ) : <p className="text-xs text-slate-500">O fornecedor recebe solicitações pela plataforma.</p>
                  ) : <p className="text-xs text-slate-500">Fornecedor ainda sem conta na plataforma. Solicitações ficam registradas e o fornecedor é convidado a responder.</p>}
                  <LinkButton href={`/fornecedores/${supplier.id}`} variant="secondary" s="sm">Acessar fornecedor</LinkButton>
                </>
              ) : itemSuppliers.length ? (
                <>
                  <p className="text-slate-600">Fornecedores com itens homologados na contratação:</p>
                  <ul className="space-y-1">
                    {itemSuppliers.slice(0, 12).map((i) => (
                      <li key={i.id}>{i.supplier_id ? <Link className="text-brand-700 hover:underline" href={`/fornecedores/${i.supplier_id}`}>{i.supplier_name}</Link> : i.supplier_name}{i.supplier_ni && <span className="block text-xs text-slate-400">{formatCnpj(i.supplier_ni)}</span>}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-slate-500">Fornecedor da ata não confirmado.</p>
                </>
              ) : <p className="text-slate-500">Fornecedor não confirmado.</p>}
              {isSupplier && !ata.supplier_confirmed && (
                <Link href={`/fornecedor/reivindicar?ata=${ata.id}`} className="block text-xs font-medium text-brand-700 hover:underline">Esta ata é da sua empresa? Reivindique a titularidade</Link>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Documentação" />
            <ul className="divide-y divide-slate-100 text-sm">
              {documents.length === 0 && <li className="p-5 text-slate-500">Nenhum documento disponível.</li>}
              {documents.map((d) => (
                <li key={d.id} className="flex items-start gap-3 px-5 py-3">
                  <FileText className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
                  <div className="min-w-0">
                    <a href={d.external_url ?? `/api/documentos/${d.id}`} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-brand-700 hover:underline">{d.title}</a>
                    <p className="text-xs text-slate-500">{{ ata: "Ata", edital: "Edital", termo_aditivo: "Termo aditivo", evidencia: "Evidência", outro: "Anexo" }[d.kind]}{d.published_at_source ? ` · publicado em ${dateBR(d.published_at_source)}` : ""}{d.visibility === "private" ? " · restrito" : ""}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-100 p-5 text-sm">
              {ata.source_url && <a href={ata.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">Ver na fonte oficial <ExternalLink className="size-3.5" /></a>}
              {ata.proc_url && <a href={ata.proc_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 flex items-center gap-1 text-brand-700 hover:underline">Contratação de origem <ExternalLink className="size-3.5" /></a>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Rastreabilidade" />
            <div className="space-y-4 p-5">
              <Dl cols={1} items={[
                ["Fonte de origem", ata.source_name],
                ["Identificador externo", ata.external_id ? <span className="break-all font-mono text-xs">{ata.external_id}</span> : "—"],
                ["Data de coleta", dateTimeBR(ata.collected_at ?? ata.created_at)],
                ["Atualização na fonte", dateTimeBR(ata.source_updated_at)],
                ["Última sincronização", dateTimeBR(ata.last_synced_at)],
                ["Última alteração na plataforma", dateTimeBR(ata.updated_at)],
              ]} />
              <div className="flex flex-wrap gap-1.5 text-xs">
                <Badge tone={ata.documents_verified ? "green" : "gray"}>Documentos {ata.documents_verified ? "conferidos" : "não conferidos"}</Badge>
                <Badge tone={ata.validity_confirmed ? "green" : "gray"}>Vigência {ata.validity_confirmed ? "confirmada" : "não confirmada"}</Badge>
                <Badge tone={ata.availability_checked_at ? "green" : "gray"}>Disponibilidade {ata.availability_checked_at ? `consultada em ${dateBR(ata.availability_checked_at)}` : "não consultada"}</Badge>
              </div>
              {history.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-slate-900">Histórico de status ({history.length})</summary>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {history.map((h, i) => <li key={i}>{dateTimeBR(h.created_at)} — {STATUS_INFO[h.to_status as AtaStatus]?.label ?? h.to_status}{h.reason ? `: ${h.reason}` : ""}</li>)}
                  </ul>
                </details>
              )}
              {changes.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-slate-900">Histórico de alterações ({changes.length})</summary>
                  <ul className="mt-2 space-y-2 text-xs text-slate-600">
                    {changes.map((c, i) => (
                      <li key={i}>{dateTimeBR(c.created_at)} · {c.origin}: {Object.entries(c.changes).map(([k, v]) => `${k}: ${String(v.de ?? "—")} → ${String(v.para ?? "—")}`).join("; ").slice(0, 400)}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </Card>
          <DataNotice>Dados apresentados conforme a fonte. Saldo disponível, autorização para adesão e disponibilidade comercial dependem de confirmação específica junto ao órgão gerenciador e ao fornecedor.</DataNotice>
        </div>
      </div>
    </div>
  );
}
