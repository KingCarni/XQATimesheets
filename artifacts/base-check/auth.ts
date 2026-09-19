import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

/**
 * Cross-subdomain session cookies for the tenant model.
 *
 * Tenancy is host-based (`hourops.ca`, `xqa.hourops.ca`, `<slug>.hourops.ca`),
 * so a session created on one host must be readable on the others. That only
 * works if the session cookie's `Domain` is the shared parent (e.g.
 * `.hourops.ca`). This is configured ENTIRELY through `AUTH_COOKIE_DOMAIN`:
 *   - unset (local dev, `localhost`, preview): omit the cookie overrides
 *     completely, so Auth.js uses its default host-only cookies — dev is never
 *     affected, and `<slug>.localhost` is tested per-host.
 *   - set to `.hourops.ca` in production: the session, callback, and CSRF
 *     cookies are shared across every tenant subdomain.
 *
 * Note the CSRF cookie uses the `__Secure-` prefix (not `__Host-`) because
 * `__Host-` forbids a `Domain` attribute, which we require here. All three are
 * `Secure` + `SameSite=Lax`, which is correct for top-level cross-subdomain
 * navigation over HTTPS.
 */
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN;
const crossSubdomainCookies = cookieDomain
  ? {
      sessionToken: {
        name: "__Secure-authjs.session-token",
        options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: true, domain: cookieDomain },
      },
      callbackUrl: {
        name: "__Secure-authjs.callback-url",
        options: { sameSite: "lax" as const, path: "/", secure: true, domain: cookieDomain },
      },
      csrfToken: {
        name: "__Secure-authjs.csrf-token",
        options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: true, domain: cookieDomain },
      },
    }
  : undefined;

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  // Required when the app is served from multiple hosts/subdomains.
  trustHost: true,
  ...(crossSubdomainCookies ? { cookies: crossSubdomainCookies } : {}),
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      // Public routes reachable without a session: the marketing landing page,
      // sign-in, company creation, the invitation acceptance flow (where the
      // account is created), and public org branding (logos on those pages).
      const publicPaths = ["/", "/login", "/signup", "/accept-invite", "/api/org-logo"];
      const isPublic = publicPaths.includes(nextUrl.pathname);

      if (isLoggedIn && (nextUrl.pathname === "/login" || nextUrl.pathname === "/signup")) {
        return Response.redirect(new URL("/my-timesheet", nextUrl));
      }

      if (!isPublic) return isLoggedIn;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.users.findUnique({
          where: { email: parsed.data.email },
          select: {
            id: true,
            email: true,
            password_hash: true,
            is_active: true,
          },
        });

        if (!user?.is_active || !user.password_hash) return null;

        const valid = await verifyPassword(parsed.data.password, user.password_hash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
        };
      },
    }),
  ],
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
