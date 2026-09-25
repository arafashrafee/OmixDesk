export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="min-h-full bg-[#fafafa]">{children}</main>;
}
