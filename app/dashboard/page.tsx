"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AppHeader from "@/components/AppHeader";
import KartuAlat from "@/components/KartuAlat";
import BarisAlat from "@/components/BarisAlat";
import UnduhCsv from "@/components/UnduhCsv";
import { AreaRangka, RangkaBarisAlat, RangkaKartuAlat } from "@/components/Rangka";
import { waktuRelatif } from "@/lib/format";
import { RENTANG_RATA, type KunciRentangRata, type RataAlat } from "@/lib/rata";
import {
  kondisiAlat,
  perluPerhatian,
  PERINGKAT,
  type KondisiAlat,
} from "@/lib/status";
import type { Device, Reading } from "@/lib/types";

type StatusKoneksi = "menyambung" | "terhubung" | "terputus";
type Tampilan = "kartu" | "baris";

// Di atas jumlah ini, membandingkan antar-alat lebih berguna daripada
// memberi tiap alat kartunya sendiri, jadi tampilan beralih ke baris.
const AMBANG_TAMPILAN_BARIS = 6;

// Seberapa sering tampilan dihitung ulang supaya status online bisa LURUH
// sendiri jadi "diam" saat alat berhenti mengirim, dan supaya label
// "5 menit lalu" ikut bertambah. Tanpa ini tidak ada yang memicu render
// baru ketika data justru berhenti datang.
const INTERVAL_SEGAR_MS = 30 * 1000;

// Rata-rata tidak ikut pembaruan realtime: satu pembacaan baru hampir tidak
// menggeser rata-rata 24 jam, apalagi 30 hari. Menghitung ulang tiap
// pembacaan masuk hanya membebani database tanpa mengubah angka yang
// terlihat, jadi cukup disegarkan berkala.
const INTERVAL_RATA_MS = 5 * 60 * 1000;

export default function DashboardPage() {
  const supabase = createClient();
  const [devices, setDevices] = useState<Device[]>([]);
  const [latestReadings, setLatestReadings] = useState<Record<string, Reading>>({});
  const [loading, setLoading] = useState(true);
  const [errorMuat, setErrorMuat] = useState<string | null>(null);
  const [koneksi, setKoneksi] = useState<StatusKoneksi>("menyambung");
  const [tampilanManual, setTampilanManual] = useState<Tampilan | null>(null);
  const [rentangRata, setRentangRata] = useState<KunciRentangRata>("24j");
  const [rataRata, setRataRata] = useState<Record<string, RataAlat>>({});
  const [memuatRata, setMemuatRata] = useState(true);
  const [errorRata, setErrorRata] = useState<string | null>(null);
  const nomorRata = useRef(0);

  // Dipakai hanya untuk memaksa render ulang berkala (lihat INTERVAL_SEGAR_MS).
  const [, setDetak] = useState(0);

  const muatData = useCallback(async () => {
    const { data: devicesData, error: devicesError } = await supabase
      .from("devices")
      .select("id, device_id, nama, batas_suhu, batas_kelembapan, batas_uv, last_seen")
      .order("nama");

    if (devicesError) {
      setErrorMuat("Gagal memuat daftar alat. Periksa koneksi internetmu.");
      setLoading(false);
      return;
    }

    const daftarAlat = devicesData ?? [];
    setDevices(daftarAlat);

    // Ambil SATU pembacaan terbaru per alat, bukan menarik seluruh tabel
    // readings lalu memfilternya di browser. Tabel readings tumbuh terus
    // seiring waktu, jadi query tanpa batas akan makin lambat tiap hari.
    const hasil = await Promise.all(
      daftarAlat.map((device) =>
        supabase
          .from("readings")
          .select("device_id, suhu, kelembapan, nilai_uv, risk_index, status, created_at")
          .eq("device_id", device.device_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      )
    );

    if (hasil.some((r) => r.error)) {
      setErrorMuat("Gagal memuat pembacaan terbaru. Periksa koneksi internetmu.");
      setLoading(false);
      return;
    }

    const latest: Record<string, Reading> = {};
    for (const { data } of hasil) {
      if (data) latest[data.device_id] = data as Reading;
    }
    setLatestReadings(latest);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rata-rata dihitung di server (agregasi Postgres) supaya browser tidak
  // perlu menarik ribuan baris hanya untuk beberapa angka per alat.
  const muatRata = useCallback(async (kunci: KunciRentangRata) => {
    // Rentang 30 hari lebih lambat daripada 24 jam. Kalau user berpindah
    // cepat, jawaban lama bisa tiba belakangan dan menimpa yang baru —
    // angka 30 hari tampil di bawah tombol "24 jam". Hanya permintaan
    // terakhir yang boleh menulis hasil.
    const nomor = ++nomorRata.current;
    setMemuatRata(true);
    setErrorRata(null);
    try {
      const res = await fetch(`/api/rata-rata?rentang=${kunci}`);
      const badan = await res.json().catch(() => null);
      if (nomor !== nomorRata.current) return;
      if (!res.ok) {
        setErrorRata(badan?.error ?? "Gagal memuat rata-rata pembacaan.");
        setRataRata({});
      } else {
        setRataRata(badan.rata ?? {});
      }
    } catch {
      if (nomor !== nomorRata.current) return;
      setErrorRata("Gagal memuat rata-rata pembacaan. Periksa koneksi internetmu.");
      setRataRata({});
    }
    if (nomor === nomorRata.current) setMemuatRata(false);
  }, []);

  useEffect(() => {
    muatData();

    const channel = supabase
      .channel("readings-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "readings" },
        (payload) => {
          const r = payload.new as Reading;
          setLatestReadings((prev) => ({ ...prev, [r.device_id]: r }));
        }
      )
      // Kalau websocket putus, dashboard tetap memajang angka lama seolah
      // masih langsung. Untuk alat pemantauan itu berbahaya, jadi keadaan
      // sambungan harus kelihatan.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setKoneksi("terhubung");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setKoneksi("terputus");
        }
      });

    const interval = setInterval(() => setDetak((d) => d + 1), INTERVAL_SEGAR_MS);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muatData]);

  useEffect(() => {
    muatRata(rentangRata);
    const interval = setInterval(() => muatRata(rentangRata), INTERVAL_RATA_MS);
    return () => clearInterval(interval);
  }, [rentangRata, muatRata]);

  // Kondisi diturunkan sekali di sini, lalu dipakai untuk pengurutan,
  // ringkasan, dan tiap kartu/baris — supaya semuanya tidak bisa berbeda.
  const daftar = devices
    .map((device) => {
      const reading = latestReadings[device.device_id];
      const kondisi: KondisiAlat = kondisiAlat(
        reading?.status,
        reading?.created_at ?? device.last_seen
      );
      // Alat yang diam tetap dapat rata-rata. Alat yang mati tidak menulis
      // baris apa pun, jadi rata-ratanya otomatis hanya mencakup waktu saat
      // alat masih hidup — bukan rentang penuh yang tertulis di tombol.
      // Kartu dan barisnya menuliskan perbedaan itu.
      return { device, reading, kondisi, rata: rataRata[device.device_id] };
    })
    .sort((a, b) => {
      const beda = PERINGKAT[a.kondisi] - PERINGKAT[b.kondisi];
      if (beda !== 0) return beda;
      return (a.device.nama || a.device.device_id).localeCompare(
        b.device.nama || b.device.device_id,
        "id"
      );
    });

  const mendesak = daftar.filter((d) => perluPerhatian(d.kondisi));
  const kritis = mendesak.filter((d) => d.kondisi === "BAHAYA");
  const diam = mendesak.filter((d) => d.kondisi === "DIAM" || d.kondisi === "KOSONG");

  const tampilan: Tampilan =
    tampilanManual ?? (devices.length > AMBANG_TAMPILAN_BARIS ? "baris" : "kartu");

  return (
    <div className="min-h-dvh px-6 py-6 sm:px-10">
      <div className="mx-auto max-w-5xl">
        <AppHeader eyebrow="Ruang Pemantauan" judul="JatayuGuard" />

        <main id="konten">
          {!loading && !errorMuat && devices.length > 0 && (
            <>
              {mendesak.length > 0 ? (
                // Saat ada yang mendesak, keadaan itu mengambil bobot penuh —
                // bukan satu kalimat kecil yang menyatu dengan sekelilingnya.
                <div
                  role="status"
                  className="mb-4 border-l-[3px] border-[var(--bata)] bg-[var(--bata-bg)] px-5 py-4"
                >
                  <p className="text-[15px] font-medium text-[var(--bata)]">
                    {kritis.length > 0 && (
                      <>
                        {kritis.length} alat dalam kondisi kritis
                        {diam.length > 0 && ", "}
                      </>
                    )}
                    {diam.length > 0 && (
                      <>
                        {diam.length} alat berhenti mengirim data
                      </>
                    )}
                    .
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-[var(--tinta-soft)]">
                    {mendesak.map(({ device, reading, kondisi }) => (
                      <li key={device.id}>
                        <span className="text-[var(--tinta)]">
                          {device.nama || device.device_id}
                        </span>{" "}
                        {kondisi === "BAHAYA"
                          ? "melewati ambang batas."
                          : reading
                          ? `terakhir mengirim ${waktuRelatif(reading.created_at)}.`
                          : "belum pernah mengirim data."}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mb-4 text-sm text-[var(--tinta-soft)]">
                  Memantau <strong className="text-[var(--tinta)]">{devices.length}</strong> alat.
                  Semua mengirim data dan berada dalam batas.
                </p>
              )}

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[var(--tinta-soft)]" aria-live="polite">
                  {koneksi === "terhubung" ? (
                    `Memantau ${devices.length} alat · pembaruan langsung aktif`
                  ) : koneksi === "menyambung" ? (
                    "Menyambungkan pembaruan langsung…"
                  ) : (
                    <span className="text-[var(--bata)]">
                      Pembaruan langsung terputus — angka mungkin tidak terbaru.{" "}
                      <button
                        onClick={() => window.location.reload()}
                        className="underline hover:text-[var(--soga)]"
                      >
                        Muat ulang
                      </button>
                    </span>
                  )}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="label-arsip mr-1 !text-[10px]">Rata-rata</span>
                  {(Object.keys(RENTANG_RATA) as KunciRentangRata[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setRentangRata(k)}
                      aria-pressed={rentangRata === k}
                      className={`inline-flex h-9 items-center border px-3 text-xs transition ${
                        rentangRata === k
                          ? "border-[var(--soga)] text-[var(--soga)]"
                          : "border-[var(--line)] text-[var(--tinta-soft)] hover:border-[var(--soga)] hover:text-[var(--soga)]"
                      }`}
                    >
                      {RENTANG_RATA[k].label}
                    </button>
                  ))}

                  <UnduhCsv preset="30h" />

                  {(["kartu", "baris"] as Tampilan[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTampilanManual(t)}
                      aria-pressed={tampilan === t}
                      className={`inline-flex h-9 items-center border px-3 text-xs transition ${
                        tampilan === t
                          ? "border-[var(--soga)] text-[var(--soga)]"
                          : "border-[var(--line)] text-[var(--tinta-soft)] hover:border-[var(--soga)] hover:text-[var(--soga)]"
                      }`}
                    >
                      {t === "kartu" ? "Kartu" : "Baris"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kegagalan menghitung rata-rata TIDAK boleh terlihat sebagai
                  "alat ini memang tidak punya rata-rata". Selama tidak ada
                  angka, alasannya harus tertulis. */}
              {errorRata ? (
                <p role="alert" className="mb-4 text-xs text-[var(--bata)]">
                  {errorRata}{" "}
                  <button
                    onClick={() => muatRata(rentangRata)}
                    className="underline hover:text-[var(--soga)]"
                  >
                    Coba lagi
                  </button>
                </p>
              ) : memuatRata && Object.keys(rataRata).length === 0 ? (
                <p className="mb-4 text-xs text-[var(--tinta-soft)]" aria-live="polite">
                  Menghitung rata-rata {RENTANG_RATA[rentangRata].label} terakhir…
                </p>
              ) : null}
            </>
          )}

          {loading ? (
            // Rangka mengikuti tampilan yang sedang dipilih, jadi susunannya
            // tidak berubah begitu data datang.
            <AreaRangka>
              {tampilan === "kartu" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <RangkaKartuAlat key={i} />
                  ))}
                </div>
              ) : (
                <div className="kartu-kain divide-y divide-[var(--line-halus)]">
                  {[0, 1, 2].map((i) => (
                    <RangkaBarisAlat key={i} />
                  ))}
                </div>
              )}
            </AreaRangka>
          ) : errorMuat ? (
            // Kegagalan query HARUS dibedakan dari "belum ada alat". Sebelumnya
            // keduanya terlihat sama, sehingga koneksi putus tampil sebagai
            // "belum ada alat terdaftar" — menyesatkan untuk alat pemantauan.
            <div className="kartu-kain px-8 py-12 text-center" role="alert">
              <p className="mb-5 text-[var(--bata)]">{errorMuat}</p>
              <button
                onClick={() => {
                  setLoading(true);
                  setErrorMuat(null);
                  muatData();
                }}
                className="border border-[var(--line)] inline-flex h-11 items-center px-5 text-sm text-[var(--tinta)] transition hover:border-[var(--soga)] hover:text-[var(--soga)]"
              >
                Coba lagi
              </button>
            </div>
          ) : devices.length === 0 ? (
            <div className="kartu-kain px-8 py-12 text-center">
              <p className="text-[var(--tinta-soft)]">
                Belum ada alat terdaftar. Nyalakan perangkat dan hubungkan ke WiFi
                — alat akan terdaftar otomatis di sini.
              </p>
            </div>
          ) : tampilan === "kartu" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {daftar.map(({ device, reading, kondisi, rata }) => (
                <KartuAlat
                  key={device.id}
                  device={device}
                  reading={reading}
                  kondisi={kondisi}
                  rata={rata}
                  labelRentang={RENTANG_RATA[rentangRata].label}
                />
              ))}
            </div>
          ) : (
            <div className="kartu-kain divide-y divide-[var(--line-halus)]">
              {daftar.map(({ device, reading, kondisi, rata }) => (
                <BarisAlat
                  key={device.id}
                  device={device}
                  reading={reading}
                  kondisi={kondisi}
                  rata={rata}
                  labelRentang={RENTANG_RATA[rentangRata].label}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
