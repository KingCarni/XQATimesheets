import { brandingStyleVars } from "@/lib/branding/css";
import { getTenantBrandingFromHost } from "@/lib/branding/tenant";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Brand the public auth pages to the tenant when the request is on a tenant
  // host; falls back to the MyHourVault palette on the platform root.
  const branding = await getTenantBrandingFromHost();
  const brandVars = brandingStyleVars(branding?.primaryColor, branding?.accentColor);

  return (
    <main
      className="from-xqa-navy via-xqa-navy-2 to-xqa-blue flex min-h-full flex-1 items-center justify-center bg-gradient-to-br p-6"
      style={brandVars}
    >
      {children}
    </main>
  );
}
