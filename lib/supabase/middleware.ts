import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";
import type { AppRole } from "@/types/domain";
import { isRouteAllowed, LOGIN_PATH, DEFAULT_AUTHED_PATH } from "@/lib/permissions/routes";

const PUBLIC_PATHS = [LOGIN_PATH, "/auth/callback"];

/**
 * Refreshes the Supabase session cookie and enforces coarse route protection:
 *  - unauthenticated users are bounced to the login page
 *  - authenticated users hitting a role-gated route they lack access to are
 *    redirected to their default landing page
 *
 * Fine-grained authorization still lives in each page/action and in RLS.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() revalidates the token; do not trust getSession() alone.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (user) {
    // Signed-in users should not sit on the login page.
    if (pathname === LOGIN_PATH) {
      const url = request.nextUrl.clone();
      url.pathname = DEFAULT_AUTHED_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }

    const role = (user.app_metadata?.role as AppRole | undefined) ?? "employee";
    if (!isRouteAllowed(pathname, role)) {
      const url = request.nextUrl.clone();
      url.pathname = DEFAULT_AUTHED_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
