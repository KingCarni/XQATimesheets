export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="from-xqa-navy via-xqa-navy-2 to-xqa-blue flex min-h-full flex-1 justify-center bg-gradient-to-br p-4 sm:p-8">
      <div className="w-full max-w-3xl">{children}</div>
    </main>
  );
}
