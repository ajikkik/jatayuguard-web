"use client";

import { useState } from "react";
import { IkonMata, IkonMataTutup } from "@/components/Ikon";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (nilai: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  required?: boolean;
  petunjuk?: string;
  /** Elemen kecil di kanan label, mis. tautan "Lupa kata sandi?". */
  aksiLabel?: React.ReactNode;
};

/**
 * Kolom kata sandi dengan tombol lihat/sembunyikan.
 *
 * Tanpa ini user mengetik sandi buta — penyebab kesalahan ketik yang
 * paling sering, apalagi pada form yang minta konfirmasi dua kali.
 */
export default function KolomSandi({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  required,
  petunjuk,
  aksiLabel,
}: Props) {
  const [terlihat, setTerlihat] = useState(false);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={id} className="label-arsip block">
          {label}
        </label>
        {aksiLabel}
      </div>

      <div className="relative">
        <input
          id={id}
          type={terlihat ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-describedby={petunjuk ? `${id}-petunjuk` : undefined}
          className="h-12 w-full border border-[var(--line)] bg-[var(--input-bg)] pl-4 pr-14 text-[15px] text-[var(--tinta)] outline-none transition focus:border-[var(--soga)]"
        />
        <button
          type="button"
          onClick={() => setTerlihat((t) => !t)}
          aria-label={terlihat ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
          aria-pressed={terlihat}
          className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-[var(--tinta-soft)] transition hover:text-[var(--soga)]"
        >
          {terlihat ? <IkonMataTutup /> : <IkonMata />}
        </button>
      </div>

      {petunjuk && (
        <p id={`${id}-petunjuk`} className="mt-2 text-xs text-[var(--tinta-soft)]">
          {petunjuk}
        </p>
      )}
    </div>
  );
}
