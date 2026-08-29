import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const isOnLogin = nextUrl.pathname === "/login";
      const isProtected = nextUrl.pathname !== "/login";

      if (isOnLogin && isLoggedIn) {
        return Response.redirect(new URL("/my-timesheet", nextUrl));
      }

      if (isProtected) return isLoggedIn;
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
