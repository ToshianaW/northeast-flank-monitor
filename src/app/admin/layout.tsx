export const metadata = {
  title: {
    default: "Admin",
    template: "%s · Admin · Northeast Flank Monitor",
  },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex flex-1 flex-col">{children}</div>;
}
