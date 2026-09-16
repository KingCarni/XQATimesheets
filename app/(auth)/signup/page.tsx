import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <Card className="w-full max-w-md border-white/10 bg-white/95">
      <CardHeader className="items-center text-center">
        <CardTitle>Create your workspace</CardTitle>
        <CardDescription>Set up HourOps for your company in a couple of minutes.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SignupForm />
        <p className="text-muted-foreground text-center text-sm">
          Already have a workspace?{" "}
          <Link href="/login" className="text-xqa-blue font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
