-- ======================================================
-- RATA-RATA PEMBACAAN PER ALAT
--
-- Dashboard perlu rata-rata suhu/kelembapan/UV tiap alat untuk rentang
-- 24 jam, 7 hari, dan 30 hari. Menariknya sebagai baris mentah ke browser
-- tidak masuk akal: 30 hari x banyak alat bisa puluhan ribu baris hanya
-- untuk menghasilkan tiga angka per alat. Agregasi dikerjakan di Postgres,
-- satu perjalanan, dan hasilnya beberapa baris saja.
--
-- SECURITY INVOKER (bawaan): RLS "tim baca semua reading" tetap berlaku,
-- jadi fungsi ini tidak membocorkan apa pun yang tidak bisa dibaca user.
--
-- avg() mengabaikan NULL per kolom. Itu memang yang diinginkan: alat yang
-- sensor UV-nya mati tetap punya rata-rata suhu yang sah.
-- ======================================================

create or replace function public.rata_rata_pembacaan(sejak timestamptz)
returns table (
  device_id text,
  rata_suhu numeric,
  rata_kelembapan numeric,
  rata_uv numeric,
  jumlah bigint
)
language sql
stable
as $$
  select
    r.device_id::text,
    avg(r.suhu)::numeric,
    avg(r.kelembapan)::numeric,
    avg(r.nilai_uv)::numeric,
    count(*)::bigint
  from public.readings r
  where r.created_at >= sejak
  group by r.device_id;
$$;

grant execute on function public.rata_rata_pembacaan(timestamptz) to authenticated;

-- Tanpa indeks ini, rentang 30 hari memaksa sequential scan seluruh tabel
-- readings — yang tumbuh terus setiap alat mengirim data.
create index if not exists readings_device_waktu_idx
  on public.readings (device_id, created_at desc);
