"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";

export function ShareButtons({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href.split("?")[0];
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; } catch { /* cancelado */ }
    }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt("Copie o link:", url); }
  }
  return (
    <button type="button" onClick={share} className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50">
      <Share2 className="size-4" aria-hidden />{copied ? "Link copiado" : "Compartilhar"}
    </button>
  );
}
