"use client";
export function ClearCompare() {
  return <button type="button" className="h-10 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100" onClick={() => { try { localStorage.removeItem("am_compare"); } catch {} window.location.href = "/orgao/comparar"; }}>Limpar seleção</button>;
}
