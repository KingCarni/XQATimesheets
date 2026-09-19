import { z } from "zod";

/**
 * Centralised, validated environment access.
 *
 * Public (NEXT_PUBLIC_*) vars are safe in the browser bundle. Server secrets
 * must only ever be read on the server.
 */

const publicSchema = z.object({});

const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_UNPOOLED: z.string().url(),
  AUTH_SECRET: z.string().min(32),
});

function parse<T extends z.ZodTypeAny>(schema: T, source: Record<string, unknown>): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Invalid or missing environment variables: ${missing}. ` +
        `Copy .env.example to .env.local and fill in your Neon/Auth.js values.`,
    );
  }
  return result.data;
}

export const publicEnv = parse(publicSchema, {});

/** Server-only secrets. Call from server code paths only. */
export function serverEnv() {
  return parse(serverSchema, {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    AUTH_SECRET: process.env.AUTH_SECRET,
  });
}
