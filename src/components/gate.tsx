import { FEATURE_LABELS } from "@/lib/plans";
import { LinkButton, Notice } from "./ui";

export function UpgradeNotice({ feature, href }: { feature: string; href: string }) {
  return (
    <Notice tone="blue" title={`${FEATURE_LABELS[feature] ?? "Recurso"} não incluído no plano atual`}>
      <p>Este recurso faz parte dos planos pagos. A busca básica continua pública e gratuita.</p>
      <LinkButton href={href} s="sm" className="mt-3">Ver planos</LinkButton>
    </Notice>
  );
}
