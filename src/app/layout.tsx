import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Northeast Flank Monitor",
    template: "%s · Northeast Flank Monitor",
  },
  description:
    "Open-source monitoring of military activity across NATO's northeastern flank. Observe behavior. Track the baseline. Compare historically.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-grid flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="border-t border-border bg-surface-dark/60">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>
              Similarity is not trajectory. This site does not predict intent or
              conflict.
            </p>
            <p className="font-mono">Step 1.1 scaffold</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
