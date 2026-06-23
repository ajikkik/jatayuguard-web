"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    AMAN: "bg-emerald-950 text-emerald-400 border-emerald-800",
    WASPADA: "bg-amber-950 text-amber-400 border-amber-800",
    BAHAYA: "bg-red-950 text-red-400 border-red-800",
  };
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${
        styles[status] || styles.AMAN
      }`}
    >
      {status}
    </span>
  );
}

function isOnline(lastSeen: string | null) {
  if (!lastSeen) return false;
  const diffMs = Date.now() - new Date(lastSeen).getTime();
  return diffMs < 2 * 60 * 1000; // dianggap online jika last_seen < 2 menit lalu
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

    // Ambil reading terbaru untuk tiap device
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

    // Realtime: dengarkan insert baru di tabel readings
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

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-sky-400">JatayuGuard</h1>
            <p className="text-sm text-slate-400">Monitoring suhu &amp; kelembapan</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/profile"
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
            >
              Profil saya
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
            >
              Keluar
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-slate-400">Memuat data device...</p>
        ) : devices.length === 0 ? (
          <p className="text-slate-400">
            Belum ada device terdaftar. Nyalakan ESP8266 dan hubungkan ke WiFi
            untuk mendaftarkannya otomatis.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {devices.map((device) => {
              const reading = latestReadings[device.device_id];
              const online = isOnline(device.last_seen);

              return (
                <Link
                  key={device.id}
                  href={`/device/${device.device_id}`}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-sky-700"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-semibold">{device.nama || device.device_id}</h2>
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        online ? "bg-emerald-500" : "bg-slate-600"
                      }`}
                      title={online ? "Online" : "Offline"}
                    />
                  </div>

                  {reading ? (
                    <>
                      <div className="mb-3 flex items-center justify-between">
                        <StatusBadge status={reading.status} />
                        <span className="text-xs text-slate-500">
                          Risk: {reading.risk_index}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg bg-slate-800 px-3 py-2">
                          <p className="text-xs text-slate-400">Suhu</p>
                          <p className="font-semibold">{reading.suhu}°C</p>
                        </div>
                        <div className="rounded-lg bg-slate-800 px-3 py-2">
                          <p className="text-xs text-slate-400">Kelembapan</p>
                          <p className="font-semibold">{reading.kelembapan}%</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">Belum ada data masuk</p>
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
