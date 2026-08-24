import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  const isResetPasswordPage = request.nextUrl.pathname.startsWith("/reset-password");
  const isAuthCallback = request.nextUrl.pathname.startsWith("/auth/");

  // Tautan dari email (undangan, reset sandi) datang tanpa sesi. Kalau
  // dilempar ke /login seperti rute lain, tokennya hilang sebelum sempat
  // ditukar jadi sesi. Rute inilah yang membuat sesinya.
  if (isAuthCallback) {
    return supabaseResponse;
  }

  // Halaman reset-password punya alurnya sendiri (session sementara dari
  // link email), jadi dilewati dari logic redirect login/dashboard biasa.
  if (isResetPasswordPage) {
    return supabaseResponse;
  }

  // Rute API harus menjawab dengan status, bukan dilempar ke halaman login.
  // Kalau di-redirect, fetch() akan mengikuti redirect dan menerima HTML
  // dengan status 200 — pemanggilnya mengira berhasil padahal tidak.
  if (!user && request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Perlu masuk terlebih dahulu." }, { status: 401 });
  }

  // Belum login & bukan di halaman login -> redirect ke login
  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Sudah login & masih di halaman login -> redirect ke dashboard
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
