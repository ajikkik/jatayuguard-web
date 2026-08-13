import type { NextConfig } from "next";

const securityHeaders = [
  {
    // Mencegah halaman dibuka dalam <iframe> oleh situs lain (anti clickjacking)
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Mencegah browser "menebak" tipe file yang salah (anti MIME-sniffing)
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Kontrol info apa yang dikirim browser saat pindah ke situs lain
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Matikan akses ke fitur browser yang tidak dipakai (kamera, mic, lokasi)
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    // Paksa browser selalu pakai HTTPS untuk domain ini (1 tahun)
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Hanya berlaku di `next dev`. Tanpa ini, membuka dev server lewat IP
  // jaringan (misal dari HP di WiFi yang sama) membuat Next memblokir
  // aset dev-nya sendiri: React tidak pernah hydrate, form login jatuh ke
  // submit HTML biasa, dan halaman cuma memuat ulang tanpa pesan apa pun.
  allowedDevOrigins: ["192.168.137.1"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;