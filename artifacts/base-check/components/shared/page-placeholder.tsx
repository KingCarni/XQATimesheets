import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Temporary scaffold placeholder. Each of these maps to a backlog ticket and
 * will be replaced by the real screen as that ticket is built.
 */
export function PagePlaceholder({
  title,
  ticket,
  description,
}: {
  title: string;
  ticket: string;
  description: string;
}) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>
            This screen is scaffolded. Implementation tracked by{" "}
            <span className="font-mono">{ticket}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          The route, layout, and role gating are wired up. Build out the UI here next.
        </CardContent>
      </Card>
    </div>
  );
}
