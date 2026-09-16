import { cn } from "@/lib/utils";

/**
 * Renders an organization's logo image when one has been uploaded, otherwise a
 * text wordmark of the org name. Uses a plain <img> because the source is a
 * dynamic API route (`/api/org-logo`) serving bytes from the database.
 */
export function OrgLogo({
  name,
  hasLogo,
  src = "/api/org-logo",
  imgClassName,
  textClassName,
}: {
  name: string;
  hasLogo: boolean;
  src?: string;
  imgClassName?: string;
  textClassName?: string;
}) {
  if (hasLogo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={cn("h-9 w-auto object-contain", imgClassName)} />;
  }
  return <span className={cn("text-lg font-semibold tracking-tight", textClassName)}>{name}</span>;
}
