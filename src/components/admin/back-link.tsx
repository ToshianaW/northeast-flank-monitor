import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-1.5 text-xs text-teal-blue hover:underline"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      {label}
    </Link>
  );
}
