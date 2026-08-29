export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="from-xqa-navy via-xqa-navy-2 to-xqa-blue flex min-h-full flex-1 items-center justify-center bg-gradient-to-br p-6">
      {children}
    </main>
  );
}
