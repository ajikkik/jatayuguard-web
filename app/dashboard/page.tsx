"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";

type Device = {
  id: string;
  device_id: string;
  nama: string;
  batas_suhu: number;
  batas_kelembapan: number;
  last_seen: string | null;
};

type Reading = {
  device_id: string;
  suhu: number;
  kelembapan: number;
  risk_index: number;
  status: string;
  created_at: string;
};

const SEGEL_CLASS: Record<string, string> = {
  AMAN: "segel-aman",
  WASPADA: "segel-waspada",
  BAHAYA: "segel-bahaya",
};

const LABEL_STATUS: Record<string, string> = {
  AMAN: "Kondisi aman",
  WASPADA: "Perlu diawasi",
  BAHAYA: "Kondisi kritis",
};

function isOnline(lastSeen: string | null) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
}

export default function DashboardPage() {
  const supabase = createClient();
  const [devices, setDevices] = useState<Device[]>([]);
  const [latestReadings, setLatestReadings] = useState<Record<string, Reading>>({});
  const [loading, setLoading] = useState(true);

  async function muatData() {
    const { data: devicesData } = await supabase
      .from("devices")
      .select("id, device_id, nama, batas_suhu, batas_kelembapan, last_seen")
      .order("nama");

    if (devicesData) setDevices(devicesData);

    const { data: readingsData } = await supabase
      .from("readings")
      .select("device_id, suhu, kelembapan, risk_index, status, created_at")
      .order("created_at", { ascending: false });

    if (readingsData) {
      const latest: Record<string, Reading> = {};
      for (const r of readingsData) {
        if (!latest[r.device_id]) latest[r.device_id] = r;
      }
      setLatestReadings(latest);
    }
    setLoading(false);
  }

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const jumlahKritis = devices.filter(
    (d) => latestReadings[d.device_id]?.status === "BAHAYA"
  ).length;

  return (
    <div className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-10 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-6">
          <div>
            <p className="label-arsip mb-2">Ruang Pemantauan</p>
            <h1
              style={{ fontFamily: "var(--font-display)" }}
              className="text-[32px] font-medium tracking-tight text-[var(--tinta)]"
            >
              JatayuGuard
            </h1>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <ThemeToggle />
            <Link
              href="/profile"
              className="border border-[var(--line)] px-4 py-2 text-sm text-[var(--tinta)] transition hover:border-[var(--soga)] hover:text-[var(--soga)]"
            >
              Profil saya
            </Link>
            <button
              onClick={handleLogout}
              className="border border-[var(--line)] px-4 py-2 text-sm text-[var(--tinta)] transition hover:border-[var(--soga)] hover:text-[var(--soga)]"
            >
              Keluar
            </button>
          </div>
        </div>

        {/* Ringkasan singkat - bukan dashboard stat card generik, lebih seperti catatan status */}
        {!loading && devices.length > 0 && (
          <p className="mb-8 text-sm text-[var(--tinta-soft)]">
            Memantau <strong className="text-[var(--tinta)]">{devices.length}</strong> alat.{" "}
            {jumlahKritis > 0 ? (
              <span className="text-[var(--bata)]">
                {jumlahKritis} alat dalam kondisi kritis — perlu perhatian segera.
              </span>
            ) : (
              "Semua dalam kondisi terpantau baik."
            )}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-[var(--tinta-soft)]">Memuat data…</p>
        ) : devices.length === 0 ? (
          <div className="kartu-kain px-8 py-12 text-center">
            <p className="text-[var(--tinta-soft)]">
              Belum ada alat terdaftar. Nyalakan perangkat dan hubungkan ke WiFi
              — alat akan terdaftar otomatis di sini.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {devices.map((device) => {
              const reading = latestReadings[device.device_id];
              const online = isOnline(device.last_seen);
              const segelClass = reading ? SEGEL_CLASS[reading.status] : "segel-aman";

              return (
                <Link
                  key={device.id}
                  href={`/device/${device.device_id}`}
                  className="kartu-kain group flex flex-col px-6 py-6 transition hover:border-[var(--soga)]"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className={`segel-status ${segelClass}`} />
                      <span className="label-arsip">
                        {reading ? LABEL_STATUS[reading.status] : "Belum ada data"}
                      </span>
                    </div>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        online ? "bg-[var(--indigo)]" : "bg-[var(--line)]"
                      }`}
                      title={online ? "Online" : "Offline"}
                    />
                  </div>

                  <h2
                    style={{ fontFamily: "var(--font-display)" }}
                    className="mb-4 text-xl font-medium text-[var(--tinta)] transition group-hover:text-[var(--soga)]"
                  >
                    {device.nama || device.device_id}
                  </h2>

                  {reading ? (
                    <div className="mt-auto grid grid-cols-2 gap-px border border-[var(--line)] bg-[var(--line)] text-sm">
                      <div className="bg-[var(--kain)] px-3 py-2.5">
                        <p className="label-arsip mb-1 !text-[10px]">Suhu</p>
                        <p className="font-medium text-[var(--tinta)]">{reading.suhu}°C</p>
                      </div>
                      <div className="bg-[var(--kain)] px-3 py-2.5">
                        <p className="label-arsip mb-1 !text-[10px]">Kelembapan</p>
                        <p className="font-medium text-[var(--tinta)]">{reading.kelembapan}%</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-auto text-sm text-[var(--tinta-soft)]">Menunggu data pertama…</p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
