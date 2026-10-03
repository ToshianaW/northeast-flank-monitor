import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { DigestView } from "@/components/digest-view";
import { PageShell } from "@/components/page-shell";
import { collectDigestRefs } from "@/lib/digest-refs";
import {
  DIGEST_SECTIONS,
  getPublishedDigestByDate,
  listPublishedEventHeadlines,
} from "@/lib/digests";

export const metadata = { title: "Daily digest" };

export default async function DigestByDatePage({
  params,
}: PageProps<"/digest/[date]">) {
  await connection();
  const { date } = await params;
  const digest = await getPublishedDigestByDate(date);
  if (!digest) notFound();
  const eventHeadlines = await listPublishedEventHeadlines(
    collectDigestRefs(Object.values(digest.sections)),
  );

  return (
    <PageShell>
      <Link
        href="/digest"
        className="mb-6 inline-flex items-center gap-1.5 text-sm link"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Latest digest
      </Link>
      <div className="max-w-4xl">
        <DigestView digest={digest} sections={DIGEST_SECTIONS} eventHeadlines={eventHeadlines} />
      </div>
    </PageShell>
  );
}
