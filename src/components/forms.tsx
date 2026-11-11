"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, Notice, cn } from "./ui";

export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> } | null;
export type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function SubmitButton({ children, variant = "primary", className, s, pendingText = "Processando…", name, value }: { children: ReactNode; variant?: "primary" | "secondary" | "navy" | "danger" | "ghost"; className?: string; s?: "sm" | "md" | "lg"; pendingText?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} s={s} disabled={pending} className={className} name={name} value={value} aria-busy={pending}>
      {pending ? pendingText : children}
    </Button>
  );
}

export function ActionForm({ action, children, className, resetOnSuccess = false, encType }: { action: FormAction; children: ReactNode; className?: string; resetOnSuccess?: boolean; encType?: string }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && resetOnSuccess) ref.current?.reset(); }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} encType={encType}>
      {children}
      <FormMessage state={state} />
    </form>
  );
}

export function FormMessage({ state, className }: { state: ActionState; className?: string }) {
  if (!state) return null;
  if (state.error || state.fieldErrors)
    return (
      <Notice tone="red" className={cn("mt-4", className)} title={state.error ?? "Revise os campos"}>
        {state.fieldErrors && (
          <ul className="list-disc pl-5">
            {Object.entries(state.fieldErrors).map(([k, v]) => <li key={k}>{v}</li>)}
          </ul>
        )}
      </Notice>
    );
  if (state.message) return <Notice tone="green" className={cn("mt-4", className)}>{state.message}</Notice>;
  return null;
}

export function ConfirmButton({ children, message, variant = "secondary", s = "sm" }: { children: ReactNode; message: string; variant?: "secondary" | "danger" | "primary"; s?: "sm" | "md" }) {
  return (
    <Button type="submit" variant={variant} s={s} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>
      {children}
    </Button>
  );
}
