"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  id: number;
  suhu: number;
  kelembapan: number;
  nilai_ldr: number;
  risk_index: number;
  status: string;
  created_at: string;
};

const SEGEL_CLASS: Record<string, string> = {
  AMAN: "segel-aman",
  WASPADA: "segel-waspada",
  BAHAYA: "segel-bahaya",
};

export default function DeviceDetailPage() {
  const params = useParams<{ deviceId: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [device, setDevice] = useState<Device | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tersimpan, setTersimpan] = useState(false);

  const [namaInput, setNamaInput] = useState("");
  const [batasSuhuInput, setBatasSuhuInput] = useState("");
  const [batasHumInput, setBatasHumInput] = useState("");

  async function muatData() {
    const { data: deviceData } = await supabase
      .from("devices")
      .select("id, device_id, nama, batas_suhu, batas_kelembapan, last_seen")
      .eq("device_id", params.deviceId)
      .single();

    if (deviceData) {
      setDevice(deviceData);
      setNamaInput(deviceData.nama || "");
      setBatasSuhuInput(String(deviceData.batas_suhu));
      setBatasHumInput(String(deviceData.batas_kelembapan));
    }

    const { data: readingsData } = await supabase
      .from("readings")
      .select("id, suhu, kelembapan, nilai_ldr, risk_index, status, created_at")
      .eq("device_id", params.deviceId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (readingsData) setReadings(readingsData);
    setLoading(false);
  }

  useEffect(() => {
    muatData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.deviceId]);

  async function handleSimpan(e: React.FormEvent) {
    e.preventDefault();
    if (!device) return;
    setSaving(true);
    setTersimpan(false);

    const { error } = await supabase
      .from("devices")
      .update({
        nama: namaInput,
        batas_suhu: parseFloat(batasSuhuInput),
        batas_kelembapan: parseFloat(batasHumInput),
      })
      .eq("device_id", device.device_id);

    setSaving(false);
    if (!error) {
      setTersimpan(true);
      muatData();
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--tinta-soft)]">
        Memuat…
      </div>
    );
  }

  if (!device) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-[var(--tinta-soft)]">
        <p>Alat tidak ditemukan.</p>
        <Link href="/dashboard" className="text-[var(--soga)] underline">
          Kembali ke ruang pemantauan
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-[var(--tinta-soft)] transition hover:text-[var(--soga)]"
          >
            ← Kembali
          </button>
          <ThemeToggle />
        </div>

        <p className="label-arsip mb-2">Catatan Alat · {device.device_id}</p>
        <h1
          style={{ fontFamily: "var(--font-display)" }}
          className="mb-10 text-[32px] font-medium tracking-tight text-[var(--tinta)]"
        >
          {device.nama || device.device_id}
        </h1>

        {/* Form konfigurasi */}
        <form onSubmit={handleSimpan} className="kartu-kain mb-8 px-7 py-7">
          <p className="label-arsip mb-5">Konfigurasi</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <label className="label-arsip mb-2 block !text-[10px]">Nama tampilan</label>
              <input
                value={namaInput}
                onChange={(e) => setNamaInput(e.target.value)}
                className="w-full border border-[var(--line)] bg-[var(--input-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--soga)]"
              />
            </div>
            <div>
              <label className="label-arsip mb-2 block !text-[10px]">Batas suhu (°C)</label>
              <input
                type="number"
                step="0.1"
                value={batasSuhuInput}
                onChange={(e) => setBatasSuhuInput(e.target.value)}
                className="w-full border border-[var(--line)] bg-[var(--input-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--soga)]"
              />
            </div>
            <div>
              <label className="label-arsip mb-2 block !text-[10px]">Batas kelembapan (%)</label>
              <input
                type="number"
                step="0.1"
                value={batasHumInput}
                onChange={(e) => setBatasHumInput(e.target.value)}
                className="w-full border border-[var(--line)] bg-[var(--input-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--soga)]"
              />
            </div>
          </div>
          <p className="mt-4 text-xs text-[var(--tinta-soft)]">
            Perubahan diterapkan saat alat menyala ulang atau menyambung WiFi kembali.
          </p>
          <div className="mt-5 flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-[var(--soga)] px-5 py-2.5 text-sm font-medium text-[var(--kain)] transition hover:bg-[var(--soga-deep)] disabled:opacity-50"
            >
              {saving ? "Menyimpan…" : "Simpan perubahan"}
            </button>
            {tersimpan && (
              <span className="text-sm text-[var(--indigo)]">Tersimpan.</span>
            )}
          </div>
        </form>

        {/* Riwayat */}
        <div className="kartu-kain px-7 py-7">
          <p className="label-arsip mb-5">Riwayat pembacaan</p>
          {readings.length === 0 ? (
            <p className="text-sm text-[var(--tinta-soft)]">Belum ada data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left">
                    <th className="label-arsip py-2.5 pr-4 !text-[10px]">Waktu</th>
                    <th className="label-arsip py-2.5 pr-4 !text-[10px]">Suhu</th>
                    <th className="label-arsip py-2.5 pr-4 !text-[10px]">Kelembapan</th>
                    <th className="label-arsip py-2.5 pr-4 !text-[10px]">Risiko</th>
                    <th className="label-arsip py-2.5 !text-[10px]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--line)]/60">
                      <td className="py-2.5 pr-4 text-[var(--tinta-soft)]">
                        {new Date(r.created_at).toLocaleString("id-ID")}
                      </td>
                      <td className="py-2.5 pr-4 text-[var(--tinta)]">{r.suhu}°C</td>
                      <td className="py-2.5 pr-4 text-[var(--tinta)]">{r.kelembapan}%</td>
                      <td className="py-2.5 pr-4 text-[var(--tinta)]">{r.risk_index}</td>
                      <td className="py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span className={`segel-status ${SEGEL_CLASS[r.status]}`} />
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
