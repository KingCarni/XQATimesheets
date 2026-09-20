import { Suspense } from "react";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrgLogo } from "@/components/shared/org-logo";
import { getTenantBrandingFromHost } from "@/lib/branding/tenant";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const branding = await getTenantBrandingFromHost();

  return (
    <Card className="w-full max-w-sm border-white/10 bg-white/95">
      <CardHeader className="items-center text-center">
        <div className="mb-2">
          <OrgLogo
            name={branding?.name ?? "MyHourVault"}
            hasLogo={Boolean(branding?.hasLogo)}
            src={branding ? `/api/org-logo?slug=${encodeURIComponent(branding.slug)}` : "/api/org-logo"}
            imgClassName="h-11 w-auto max-w-[12rem]"
            textClassName="text-2xl"
          />
        </div>
        <CardTitle>{branding ? "Sign in" : "Sign in to MyHourVault"}</CardTitle>
        <CardDescription>
          {branding ? `Welcome back to ${branding.name}.` : "Sign in to log and review time."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <p className="text-muted-foreground text-center text-sm">
          New to MyHourVault?{" "}
          <Link href="/signup" className="text-xqa-blue font-medium hover:underline">
            Create a company
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
