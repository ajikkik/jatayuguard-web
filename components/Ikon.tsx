// Satu set ikon garis dengan bahasa visual yang sama: viewBox 24,
// stroke 2, ujung membulat. Sebelumnya navigasi memakai karakter teks
// "←" sementara tombol tema memakai SVG, jadi tebal dan gayanya tidak
// pernah cocok.

type Props = {
  ukuran?: number;
  className?: string;
};

function Dasar({
  ukuran = 16,
  className,
  children,
}: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={ukuran}
      height={ukuran}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function IkonPanahKiri(p: Props) {
  return (
    <Dasar {...p}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </Dasar>
  );
}

export function IkonOrang(p: Props) {
  return (
    <Dasar {...p}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Dasar>
  );
}

export function IkonKeluar(p: Props) {
  return (
    <Dasar {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </Dasar>
  );
}

export function IkonUnduh(p: Props) {
  return (
    <Dasar {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </Dasar>
  );
}

/** Panah bawah penanda "ada pilihan di balik tombol ini". */
export function IkonChevronBawah(p: Props) {
  return (
    <Dasar {...p}>
      <path d="m6 9 6 6 6-6" />
    </Dasar>
  );
}

export function IkonKirim(p: Props) {
  return (
    <Dasar {...p}>
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </Dasar>
  );
}

export function IkonMata(p: Props) {
  return (
    <Dasar {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </Dasar>
  );
}

export function IkonMataTutup(p: Props) {
  return (
    <Dasar {...p}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-6.5 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" />
      <path d="M9.9 9.9a3 3 0 1 0 4.2 4.2" />
    </Dasar>
  );
}

export function IkonMatahari(p: Props) {
  return (
    <Dasar {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </Dasar>
  );
}

export function IkonBulan(p: Props) {
  return (
    <Dasar {...p}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </Dasar>
  );
}
