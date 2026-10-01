import { AdminLoginForm } from "@/components/admin-login-form";

export const metadata = { title: "Admin login" };

export default function AdminLoginPage() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <p className="meta-label mb-3">Admin</p>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-text-secondary">
        Protected route stub for step 1.1. Set{" "}
        <code className="font-mono text-xs text-text-muted">ADMIN_PASSWORD</code>{" "}
        in the environment (default:{" "}
        <code className="font-mono text-xs text-text-muted">changeme</code>).
      </p>
      <AdminLoginForm />
    </section>
  );
}
