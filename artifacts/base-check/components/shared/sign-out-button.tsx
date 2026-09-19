import { signOut } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button
        type="submit"
        variant="outline"
        size="sm"
        className="w-full border-white/10 bg-white/6 text-white hover:bg-white/12"
      >
        Sign out
      </Button>
    </form>
  );
}
