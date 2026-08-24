import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Tipe tautan email yang berujung pada pembuatan/penggantian kata sandi.
// Undangan dan pemulihan sandi sama-sama harus mendarat di halaman
// pengisian sandi baru, bukan langsung di dashboard.
const PERLU_SANDI: EmailOtpType[] = ["invite", "recovery"];

/**
 * Alamat halaman sandi untuk kasus gagal.
 *
 * `sebab` dan `pesan` ikut dibawa. Tanpa keduanya layar gagal hanya bisa
 * bilang "kedaluwarsa", padahal tiga hal yang sangat berbeda berujung ke
 * sini: Supabase menolak token di /auth/v1/verify (otp_expired — tautan
 * sudah dipakai atau lewat masa berlaku), verifyOtp gagal, atau penukaran
 * kode PKCE gagal (code_verifier tidak ada karena tautan dibuka di
 * browser atau perangkat lain). Perbaikannya beda-beda, jadi jangan
 * disamarkan jadi satu pesan.
 */
function halamanSandi(
  type: string | null,
  gagal?: { sebab?: string | null; pesan?: string | null }
) {
  const tipe = type === "invite" ? "invite" : "recovery";
  const url = new URLSearchParams({ tipe });
  if (gagal) {
    url.set("status", "kedaluwarsa");
    if (gagal.sebab) url.set("sebab", gagal.sebab);
    if (gagal.pesan) url.set("pesan", gagal.pesan);
  }
  return `/reset-password?${url.toString()}`;
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
  const error = searchParams.get("error");
  const errorCode = searchParams.get("error_code");
  const errorDescription = searchParams.get("error_description");

  const tujuan =
    next ?? (type && PERLU_SANDI.includes(type as EmailOtpType) ? halamanSandi(type) : "/dashboard");

  const ke = (path: string) => NextResponse.redirect(new URL(path, request.url));

  // Supabase sudah menolak tokennya sendiri sebelum sampai ke sini. Pada alur
  // PKCE sebabnya datang sebagai query (bukan fragment) dan tanpa `type`.
  if (error || errorCode || errorDescription) {
    return ke(
      halamanSandi(type, {
        sebab: errorCode ?? error,
        pesan: errorDescription,
      })
    );
  }

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error: gagal } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    return ke(gagal ? halamanSandi(type, { sebab: "verify_otp", pesan: gagal.message }) : tujuan);
  }

  if (code) {
    const { error: gagal } = await supabase.auth.exchangeCodeForSession(code);
    if (gagal) {
      return ke(halamanSandi(type, { sebab: "exchange_code", pesan: gagal.message }));
    }
    // Kode tanpa `type` hanya muncul dari tautan yang mendarat di Site URL
    // polos, yaitu undangan yang dikirim dari Supabase Dashboard. Permintaan
    // reset dari halaman masuk selalu menyertakan type=recovery sendiri.
    // Keduanya butuh halaman sandi, bukan dashboard: akun undangan belum
    // punya kata sandi sama sekali.
    return ke(next ?? halamanSandi(type ?? "invite"));
  }

  // Tidak ada parameter yang terbaca server. Kemungkinan token dikirim sebagai
  // fragment (#access_token=...) yang memang hanya ada di sisi browser.
  // Fragment ikut terbawa melewati redirect, jadi biarkan halaman tujuan
  // (client component) yang memprosesnya.
  return ke(tujuan);
}
