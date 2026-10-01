import Link from "next/link";

export default function AdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="border-b border-border bg-surface-raised">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <p className="meta-label">Admin</p>
            <p className="text-sm text-text-secondary">
              Protected area — human review gate
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <Link href="/admin" className="text-teal-blue hover:underline">
              Dashboard
            </Link>
            <form action="/api/admin/logout" method="post">
              <button
                type="submit"
                className="text-text-muted hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
      {children}
    </>
  );
}
