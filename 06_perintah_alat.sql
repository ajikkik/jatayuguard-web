-- ======================================================
-- ANTREAN PERINTAH UNTUK ALAT
--
-- Alat berada di balik NAT jaringan pengguna: tidak ada alamat
-- yang bisa dihubungi dari luar, dan tidak boleh ada port yang
-- dibuka hanya demi satu tombol. Jadi arah komunikasinya dibalik.
-- Bot menuliskan perintah ke tabel ini, dan alat yang menjemput
-- perintahnya sendiri pada siklus upload berikutnya.
--
-- Konsekuensinya perintah bersifat ASINKRON. Alat yang sedang
-- mati atau kehilangan internet tidak menolak perintah; perintah
-- itu hanya menunggu sampai alat kembali. Karena itu setiap baris
-- membawa riwayat waktunya sendiri, supaya bot bisa menjawab
-- "sudah dikerjakan" atau "masih menunggu" dengan jujur.
--
-- Jenis perintah sengaja dibatasi CHECK, bukan dibiarkan bebas.
-- Tabel ini dibaca alat memakai kunci anon yang tertanam di
-- firmware dan karenanya bukan rahasia; daftar tertutup memastikan
-- kolom ini tidak bisa berkembang menjadi saluran perintah bebas.
-- ======================================================

create table if not exists public.perintah_alat (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,

  -- Untuk saat ini hanya reset WiFi. Menambah jenis baru berarti
  -- menambah penanganannya di firmware lebih dulu, bukan sebaliknya.
  jenis text not null check (jenis in ('reset_wifi')),

  -- menunggu   : sudah ditulis bot, belum dijemput alat
  -- dieksekusi : alat sudah menjemput dan sedang/akan restart
  -- selesai    : alat sudah kembali online sesudah dikonfigurasi ulang
  -- dibatalkan : dibatalkan pengguna sebelum dijemput alat
  status text not null default 'menunggu'
    check (status in ('menunggu', 'dieksekusi', 'selesai', 'dibatalkan')),

  -- Siapa yang meminta. Perintah ini memutus alat dari jaringan
  -- dan menuntut seseorang datang ke lokasi, jadi jejaknya wajib ada.
  diminta_oleh uuid references auth.users (id) on delete set null,
  chat_id text,

  created_at timestamptz not null default now(),
  diambil_at timestamptz,
  selesai_at timestamptz
);

create index if not exists perintah_alat_device_idx
  on public.perintah_alat (device_id, status);

-- Satu alat hanya boleh punya satu perintah yang menunggu. Tanpa ini,
-- pengguna yang mengetik command dua kali karena bot terasa lambat akan
-- membuat alat mereset WiFi, dikonfigurasi ulang, lalu langsung mereset
-- lagi begitu online — persis saat orangnya sudah pulang dari lokasi.
create unique index if not exists perintah_alat_satu_menunggu
  on public.perintah_alat (device_id)
  where status = 'menunggu';

alter table public.perintah_alat enable row level security;

-- ------------------------------------------------------
-- ALAT (role anon, kunci tertanam di firmware)
-- ------------------------------------------------------
-- Alat hanya perlu membaca perintah yang belum tuntas dan menandai
-- kemajuannya. Ia TIDAK diberi hak INSERT: hanya bot (service role,
-- yang melewati RLS) yang boleh menerbitkan perintah. Kalau tidak,
-- siapa pun yang membaca kunci anon di firmware bisa memerintahkan
-- setiap alat memutus dirinya dari jaringan.
drop policy if exists "alat baca perintahnya" on public.perintah_alat;
-- 'selesai' ikut terbaca bukan karena alat membutuhkannya untuk bekerja,
-- melainkan karena PostgREST menerapkan policy SELECT pada baris yang
-- dikembalikan sebuah UPDATE. Tanpa ini, alat yang melapor "sudah selesai"
-- menerima array kosong dan tidak bisa membedakan laporan yang berhasil
-- dari yang gagal.
create policy "alat baca perintahnya"
  on public.perintah_alat for select
  to anon
  using (status in ('menunggu', 'dieksekusi', 'selesai'));

-- Perpindahan status dibatasi searah: menunggu -> dieksekusi -> selesai.
-- Alat tidak bisa menghidupkan kembali perintah yang sudah tuntas atau
-- dibatalkan, sehingga satu perintah tidak bisa dieksekusi dua kali.
drop policy if exists "alat tandai kemajuan perintah" on public.perintah_alat;
create policy "alat tandai kemajuan perintah"
  on public.perintah_alat for update
  to anon
  using (status in ('menunggu', 'dieksekusi'))
  with check (status in ('dieksekusi', 'selesai'));

-- ------------------------------------------------------
-- TIM (authenticated), mengikuti model tim di 03_update_rls_tim.sql
-- ------------------------------------------------------
drop policy if exists "tim lihat semua perintah" on public.perintah_alat;
create policy "tim lihat semua perintah"
  on public.perintah_alat for select
  to authenticated
  using (true);

drop policy if exists "tim buat perintah" on public.perintah_alat;
create policy "tim buat perintah"
  on public.perintah_alat for insert
  to authenticated
  with check (diminta_oleh = (select auth.uid()));

drop policy if exists "tim batalkan perintah" on public.perintah_alat;
create policy "tim batalkan perintah"
  on public.perintah_alat for update
  to authenticated
  using (true)
  with check (true);
