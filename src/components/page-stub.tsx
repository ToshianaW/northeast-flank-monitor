import { PageShell } from "@/components/page-shell";

type PageStubProps = {
  title: string;
  eyebrow?: string;
  description: string;
};

/** A public page that is listed in the navigation but not built yet. */
export function PageStub({ title, eyebrow, description }: PageStubProps) {
  return (
    <PageShell eyebrow={eyebrow} title={title} intro={<p>{description}</p>}>
      <p className="text-base text-text-secondary">Not built yet.</p>
    </PageShell>
  );
}
