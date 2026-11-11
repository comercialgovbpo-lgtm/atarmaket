"use client";

import { useState } from "react";
import { isValidCnpj, onlyDigits } from "@/lib/validators";
import { Input } from "./ui";

const mask = (v: string) => {
  const d = onlyDigits(v).slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
};

/** CNPJ com máscara, validação de dígitos e pré-preenchimento a partir da base pública da plataforma. */
export function CnpjInput({ name = "cnpj", kind, fillTarget }: { name?: string; kind: "supplier" | "government"; fillTarget?: string }) {
  const [v, setV] = useState("");
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  async function check(val: string) {
    const d = onlyDigits(val);
    if (d.length < 14) { setMsg(null); return; }
    if (!isValidCnpj(d)) { setMsg({ t: "CNPJ inválido (dígitos verificadores não conferem).", ok: false }); return; }
    setMsg({ t: "CNPJ válido.", ok: true });
    try {
      const r = await fetch(`/api/cnpj/${d}?tipo=${kind}`);
      if (r.ok) {
        const j = (await r.json()) as { name?: string; registered?: boolean };
        if (j.registered) setMsg({ t: "Este CNPJ já possui conta na plataforma.", ok: false });
        else if (j.name) {
          setMsg({ t: `Encontrado na base pública: ${j.name}`, ok: true });
          const el = fillTarget ? (document.querySelector(`[name="${fillTarget}"]`) as HTMLInputElement | null) : null;
          if (el && !el.value) el.value = j.name;
        }
      }
    } catch { /* consulta opcional */ }
  }
  return (
    <>
      <Input name={name} inputMode="numeric" placeholder="00.000.000/0000-00" value={v} required
        onChange={(e) => { const m = mask(e.target.value); setV(m); void check(m); }} aria-invalid={msg ? !msg.ok : undefined} />
      {msg && <span className={`mt-1 block text-xs ${msg.ok ? "text-ok-700" : "text-red-600"}`}>{msg.t}</span>}
    </>
  );
}
