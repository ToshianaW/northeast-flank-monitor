import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { DigestView } from "@/components/digest-view";
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
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href="/digest"
        className="mb-6 inline-flex items-center gap-1.5 text-sm link"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Latest digest
      </Link>
      <DigestView digest={digest} sections={DIGEST_SECTIONS} eventHeadlines={eventHeadlines} />
    </div>
  );
}
