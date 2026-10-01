import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { DigestView } from "@/components/digest-view";
import { DIGEST_SECTIONS, getPublishedDigestByDate } from "@/lib/digests";

export const metadata = { title: "Daily digest" };

export default async function DigestByDatePage({
  params,
}: PageProps<"/digest/[date]">) {
  await connection();
  const { date } = await params;
  const digest = await getPublishedDigestByDate(date);
  if (!digest) notFound();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href="/digest"
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-teal-blue hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Latest digest
      </Link>
      <DigestView digest={digest} sections={DIGEST_SECTIONS} />
    </div>
  );
}
