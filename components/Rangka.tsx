// Rangka muat: bentuk kasar isi yang sedang diambil.
//
// Sengaja MENIRU tata letak yang akan menggantikannya — tinggi baris,
// jumlah kartu, posisi kolom. Rangka yang bentuknya asal justru membuat
// halaman melompat saat data datang, persis masalah yang mau dihindari.

type Props = {
  className?: string;
};

/** Satu bidang berkilau. Ukurannya diatur lewat className pemanggil. */
export function Rangka({ className }: Props) {
  return <div className={`rangka ${className ?? ""}`} aria-hidden="true" />;
}

/** Rangka satu kartu alat di ruang pemantauan. */
export function RangkaKartuAlat() {
  return (
    <div className="kartu-kain flex flex-col px-5 py-4">
      <div className="mb-3 flex items-center gap-2.5">
        <Rangka className="h-3 w-3 rounded-full" />
        <Rangka className="h-2.5 w-24" />
      </div>

      <Rangka className="mb-2 h-5 w-3/4" />
      <Rangka className="mb-3 h-3 w-1/2" />

      {/* Petak ukuran meniru grid nilai: tiga kolom bergaris seperti
          kartu sungguhan, supaya tingginya sudah benar sejak awal. */}
      <div className="mt-auto grid grid-cols-3 gap-px border border-[var(--line)] bg-[var(--line)]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-[var(--permukaan)] px-3 py-2">
            <Rangka className="mb-1.5 h-2.5 w-10" />
            <Rangka className="mb-1 h-4 w-14" />
            <Rangka className="h-2.5 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Rangka satu baris alat pada tampilan daftar. */
export function RangkaBarisAlat() {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <Rangka className="h-3 w-3 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <Rangka className="mb-2 h-4 w-40 max-w-full" />
        <Rangka className="h-2.5 w-28 max-w-full" />
      </div>
      <Rangka className="hidden h-4 w-16 sm:block" />
      <Rangka className="hidden h-4 w-16 sm:block" />
    </div>
  );
}

/** Rangka kepala halaman: eyebrow, judul, dan tautan kembali. */
function RangkaKepala() {
  return (
    <div className="mb-8">
      <Rangka className="mb-3 h-2.5 w-32" />
      <Rangka className="mb-4 h-7 w-56 max-w-full" />
      <Rangka className="h-px w-full" />
    </div>
  );
}

/** Rangka halaman catatan alat: konfigurasi, filter, dua grafik. */
export function RangkaHalamanAlat() {
  return (
    <div className="min-h-dvh px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <RangkaKepala />

        <div className="kartu-kain mb-8 px-7 py-7">
          <Rangka className="mb-5 h-2.5 w-24" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i}>
                <Rangka className="mb-2 h-2.5 w-20" />
                <Rangka className="h-11 w-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Rangka className="h-2.5 w-16" />
          {[0, 1, 2].map((i) => (
            <Rangka key={i} className="h-11 w-20" />
          ))}
        </div>

        {/* Grafik adalah bagian paling tinggi di halaman ini. Kalau
            rangkanya lebih pendek, halaman melompat saat data datang. */}
        <div className="kartu-kain px-7 py-7">
          <Rangka className="mb-6 h-2.5 w-32" />
          {[0, 1].map((i) => (
            <div key={i} className="mb-8 last:mb-0">
              <Rangka className="mb-3 h-2.5 w-24" />
              <Rangka className="h-40 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Rangka halaman profil: keterangan akun dan dua kartu pengaturan. */
export function RangkaProfil() {
  return (
    <div className="min-h-dvh px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-lg">
        <RangkaKepala />

        <Rangka className="mb-8 h-3.5 w-64 max-w-full" />

        {[0, 1].map((kartu) => (
          <div key={kartu} className="kartu-kain mb-6 px-7 py-7">
            <Rangka className="mb-3 h-2.5 w-40" />
            <Rangka className="mb-6 h-3 w-full" />

            <div className="space-y-4">
              {[0, 1].map((i) => (
                <div key={i}>
                  <Rangka className="mb-2 h-2.5 w-24" />
                  <Rangka className="h-11 w-full" />
                </div>
              ))}
            </div>

            <Rangka className="mt-5 h-11 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Pembungkus daftar rangka. role="status" membuat pembaca layar tetap
 * mendengar "Memuat…" — rangka visual saja tidak mengabarkan apa pun
 * kepada orang yang tidak melihatnya.
 */
export function AreaRangka({
  children,
  label = "Memuat data…",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
