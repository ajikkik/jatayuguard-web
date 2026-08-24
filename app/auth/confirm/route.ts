import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Tipe tautan email yang berujung pada pembuatan/penggantian kata sandi.
// Undangan dan pemulihan sandi sama-sama harus mendarat di halaman
// pengisian sandi baru, bukan langsung di dashboard.
const PERLU_SANDI: EmailOtpType[] = ["invite", "recovery"];

function halamanSandi(type: string | null, status?: string) {
  const tipe = type === "invite" ? "invite" : "recovery";
  const suffix = status ? `&status=${status}` : "";
  return `/reset-password?tipe=${tipe}${suffix}`;
}

/**
 * Titik pendaratan semua tautan email Supabase (undangan, reset sandi,
 * konfirmasi email).
 *
 * Tanpa rute ini, tautan email mendarat di halaman biasa yang sudah dijaga
 * proxy: proxy melihat belum ada sesi, melempar ke /login, dan token di URL
 * ikut hilang — persis gejala "Accept invitation cuma membuka halaman login".
 *
 * Dua bentuk token ditangani:
 * - token_hash + type  -> template email memakai {{ .TokenHash }} (disarankan,
 *   satu-satunya bentuk yang bisa diverifikasi di server untuk undangan).
 * - code               -> alur PKCE, dipakai saat permintaan reset dimulai
 *   dari browser (code_verifier tersimpan di cookie, terbaca dari server).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const next = searchParams.get("next");
  const adaError = searchParams.get("error") ?? searchParams.get("error_description");

  const tujuan =
    next ?? (type && PERLU_SANDI.includes(type as EmailOtpType) ? halamanSandi(type) : "/dashboard");

  const ke = (path: string) => NextResponse.redirect(new URL(path, request.url));

  if (adaError) {
    return ke(halamanSandi(type, "kedaluwarsa"));
  }

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    return ke(error ? halamanSandi(type, "kedaluwarsa") : tujuan);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return ke(error ? halamanSandi(type, "kedaluwarsa") : tujuan);
  }

  // Tidak ada parameter yang terbaca server. Kemungkinan token dikirim sebagai
  // fragment (#access_token=...) yang memang hanya ada di sisi browser.
  // Fragment ikut terbawa melewati redirect, jadi biarkan halaman tujuan
  // (client component) yang memprosesnya.
  return ke(tujuan);
}
