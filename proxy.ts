import NextAuth from "next-auth";

import { authConfig } from "@/auth";

const authProxy = NextAuth(authConfig).auth;

export default authProxy;

export const config = {
  matcher: [
    /*
     * Run on all routes except Auth.js endpoints, Next internals, and static
     * assets. Server code still performs authoritative authorization.
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
