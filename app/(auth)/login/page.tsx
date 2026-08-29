import { Suspense } from "react";
import Image from "next/image";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm border-white/10 bg-white/95">
      <CardHeader className="items-center text-center">
        <Image src="/xqa-logo.png" alt="XQA" width={156} height={65} className="mb-2 invert" priority />
        <CardTitle>Timesheets</CardTitle>
        <CardDescription>Sign in to log and review time.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
