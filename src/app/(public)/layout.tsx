import { SiteFrame } from "@/components/site-frame";
import { UpdateStamp } from "@/components/update-stamp";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface-raised focus:px-4 focus:py-2 focus:text-sm focus:text-foreground"
      >
        Skip to content
      </a>
      <SiteFrame updated={<UpdateStamp />}>{children}</SiteFrame>
    </>
  );
}
