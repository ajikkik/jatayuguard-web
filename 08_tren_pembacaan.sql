-- ======================================================
-- TREN PEMBACAAN PER ALAT (GRAFIK)
--
-- Grafik di halaman alat sebelumnya menarik 1.500 baris TERBARU lalu
-- meringkasnya di browser. Begitu alat mengirim lebih dari 1.500 pembacaan,
-- grafik 24 jam / 7 hari / 30 hari menampilkan potongan yang sama persis:
-- beberapa jam terakhir saja. Pilihan rentangnya jadi tidak berarti.
--
-- Perbaikannya: ember waktu dihitung di Postgres. Rentang dibagi menjadi
-- sejumlah ember dengan lebar sama, tiap ember dirata-ratakan, dan hanya
-- ember berisi data yang dikembalikan. Berapa pun banyaknya baris dalam
-- rentang, yang dikirim ke browser tetap sebanyak ember — dan titiknya
-- membentang di SELURUH rentang, bukan di ujungnya saja.
--
-- SECURITY INVOKER (bawaan): RLS pada readings tetap berlaku.
--
-- avg() mengabaikan NULL per kolom, jadi alat yang sensor UV-nya mati
-- tetap punya tren suhu yang sah.
-- ======================================================

create or replace function public.tren_pembacaan(
  p_device text,
  p_sejak timestamptz,
  p_sampai timestamptz,
  p_jumlah_ember integer
)
returns table (
  no_ember integer,
  waktu timestamptz,
  rata_suhu numeric,
  rata_kelembapan numeric,
  rata_uv numeric,
  jumlah bigint
)
language sql
stable
as $$
  with p as (
    select
      extract(epoch from p_sejak) as e0,
      -- Rentang nol lebar akan membagi dengan nol; dorong minimal 1 detik.
      greatest(extract(epoch from p_sampai), extract(epoch from p_sejak) + 1) as e1,
      least(greatest(coalesce(p_jumlah_ember, 240), 1), 1000) as n
  ),
  b as (
    select
      least(
        floor((extract(epoch from r.created_at) - p.e0) / ((p.e1 - p.e0) / p.n))::integer,
        p.n - 1
      ) as idx,
      r.created_at,
      r.suhu,
      r.kelembapan,
      r.nilai_uv
    from public.readings r, p
    where r.device_id = p_device
      and r.created_at >= p_sejak
      and r.created_at <= p_sampai
  )
  select
    b.idx,
    -- Waktu ember diwakili pembacaan TERAKHIR di dalamnya, sama seperti
    -- peringkasan lama di browser, supaya label sumbu tidak menunjuk ke
    -- saat yang tidak pernah ada pembacaannya.
    max(b.created_at),
    avg(b.suhu)::numeric,
    avg(b.kelembapan)::numeric,
    avg(b.nilai_uv)::numeric,
    count(*)::bigint
  from b
  group by b.idx
  order by b.idx;
$$;

grant execute on function public.tren_pembacaan(text, timestamptz, timestamptz, integer) to authenticated;

-- Indeks yang sama dipakai fungsi ini; dibuat di 05_rata_rata_pembacaan.sql
-- dan diulang di sini supaya file ini bisa dijalankan sendiri.
create index if not exists readings_device_waktu_idx
  on public.readings (device_id, created_at desc);
