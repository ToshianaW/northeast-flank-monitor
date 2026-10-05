export const metadata = {
  title: {
    default: "Admin",
    template: "%s · Admin · Northeast Flank Monitor",
  },
  robots: { index: false, follow: false },
  // Not indexed, so no canonical or Open Graph inherited from the public root.
  alternates: { canonical: null },
  openGraph: null,
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex flex-1 flex-col">{children}</div>;
}
