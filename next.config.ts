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