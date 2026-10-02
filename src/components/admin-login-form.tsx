"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/admin/login/actions";

export function AdminLoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, null);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <label className="block">
        <span className="meta-label">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          className="mt-2 w-full border border-border bg-surface-dark px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-teal-blue"
          required
        />
      </label>
      {state?.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-teal-blue px-4 py-2 text-sm font-medium text-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
