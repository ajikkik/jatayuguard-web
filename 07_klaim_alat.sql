-- ======================================================
-- KLAIM ALAT: MENGISI owner_id TANPA MENGETIK UUID
--
-- Tiga edge function sudah bergantung pada devices.owner_id:
-- notify-telegram menolak mengirim peringatan untuk alat yang
-- owner_id-nya null, check-offline-devices melewatinya, dan
-- bot-commands memfilter semua perintah dengan kolom itu.
-- Sampai migrasi ini tidak ada satu pun antarmuka yang
-- mengisinya, jadi kolom itu harus disunting tangan di table
-- editor Supabase — dan alat yang terlewat diam sepenuhnya.
--
-- Alat TIDAK boleh menentukan owner-nya sendiri. Kunci anon
-- tertanam di firmware dan karenanya bukan rahasia; kalau alat
-- yang mengirim owner_id, siapa pun yang membaca kunci itu bisa
-- memindahkan alat orang lain ke akunnya.
--
-- Karena itu arahnya dibalik. Alat hanya menyetor SATU kode
-- klaim enam digit yang diturunkan dari chip-nya sendiri dan
-- ditampilkan di portal WiFi serta LCD-nya. Yang mengklaim
-- adalah orang yang sudah masuk ke dashboard dan bisa membaca
-- kode itu — artinya orang yang benar-benar memegang alatnya.
-- ======================================================

alter table public.devices
  add column if not exists claim_code text,
  add column if not exists claimed_at timestamptz;

-- Nama tampilan penanggung jawab. Tanpa ini daftar alat hanya
-- bisa memajang UUID, yang tidak berarti apa-apa bagi siapa pun.
alter table public.profiles
  add column if not exists nama text;

create index if not exists devices_owner_idx
  on public.devices (owner_id);

-- ------------------------------------------------------
-- 1. ALAT MENYETOR KODE KLAIM (role anon)
-- ------------------------------------------------------
-- Dipanggil firmware sesudah registrasi. Bukan lewat UPDATE
-- langsung ke tabel, karena itu menuntut policy UPDATE untuk
-- anon pada devices — dan policy sekasar itu ikut membuka
-- kolom ambang batas serta nama alat bagi siapa pun yang
-- memegang kunci anon.
--
-- Alat yang SUDAH punya penanggung jawab tidak bisa lagi
-- mengganti kodenya. Kalau bisa, seseorang yang tahu device_id
-- sebuah alat dapat menyetor kode karangannya sendiri lalu
-- mengklaim alat itu dari jauh.
create or replace function public.daftar_kode_klaim(p_device_id text, p_kode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kode is null or length(btrim(p_kode)) < 4 then
    raise exception 'kode klaim tidak sah';
  end if;

  update public.devices
     set claim_code = btrim(p_kode)
   where device_id = p_device_id
     and owner_id is null
     and claim_code is distinct from btrim(p_kode);
end $$;

revoke all on function public.daftar_kode_klaim(text, text) from public;
grant execute on function public.daftar_kode_klaim(text, text) to anon, authenticated;

-- ------------------------------------------------------
-- 2. PENGGUNA MENGKLAIM ALAT (role authenticated)
-- ------------------------------------------------------
-- owner_id diambil dari auth.uid(), tidak pernah dari parameter.
-- Pemanggil tidak punya cara menyebut akun selain akunnya sendiri.
create or replace function public.klaim_alat(p_device_id text, p_kode text)
returns public.devices
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.devices;
begin
  if auth.uid() is null then
    raise exception 'Harus masuk lebih dulu untuk mengklaim alat.';
  end if;

  -- Membuka gerbang trigger di bawah. Parameter ketiga true berarti
  -- setelan ini hanya hidup selama transaksi ini.
  perform set_config('jatayu.klaim', 'on', true);

  update public.devices
     set owner_id = auth.uid(),
         claimed_at = now()
   where device_id = p_device_id
     and owner_id is null
     and claim_code is not null
     and upper(btrim(claim_code)) = upper(btrim(p_kode))
  returning * into d;

  -- Ketiga sebabnya sengaja dijawab dengan satu kalimat yang sama.
  -- Membedakan "kode salah" dari "alat tidak ada" memberi tahu orang
  -- luar alat mana yang terdaftar dan belum diklaim.
  if not found then
    raise exception 'ID alat tidak ditemukan, kode klaim salah, atau alat sudah punya penanggung jawab.';
  end if;

  return d;
end $$;

revoke all on function public.klaim_alat(text, text) from public;
grant execute on function public.klaim_alat(text, text) to authenticated;

-- ------------------------------------------------------
-- 3. MELEPAS ALAT (role authenticated)
-- ------------------------------------------------------
-- Hanya penanggung jawabnya sendiri. Sesudah dilepas, alat
-- kembali bisa diklaim dengan kode yang sama - kode itu turunan
-- chip, bukan sesuatu yang berubah tiap klaim.
create or replace function public.lepas_alat(p_device_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  jumlah int;
begin
  if auth.uid() is null then
    raise exception 'Harus masuk lebih dulu.';
  end if;

  perform set_config('jatayu.klaim', 'on', true);

  update public.devices
     set owner_id = null,
         claimed_at = null
   where device_id = p_device_id
     and owner_id = auth.uid();

  get diagnostics jumlah = row_count;

  if jumlah = 0 then
    raise exception 'Alat itu bukan tanggung jawabmu.';
  end if;
end $$;

revoke all on function public.lepas_alat(text) from public;
grant execute on function public.lepas_alat(text) to authenticated;

-- ------------------------------------------------------
-- 4. GERBANG owner_id
-- ------------------------------------------------------
-- 03_update_rls_tim.sql memberi setiap anggota tim hak UPDATE
-- penuh atas semua device. Tanpa penjaga ini, klaim lewat fungsi
-- di atas hanya jadi anjuran: satu PATCH biasa ke PostgREST
-- masih bisa memindahkan alat ke akun mana pun tanpa kode.
--
-- Policy tim yang lain sengaja dibiarkan utuh. Nama alat dan
-- ambang batas memang urusan bersama; yang dijaga hanya kolom
-- yang menentukan ke mana peringatan dikirim.
create or replace function public.jaga_owner_alat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is not distinct from old.owner_id then
    return new;
  end if;

  -- Bot dan cron berjalan dengan service_role dan memang perlu
  -- bisa merapikan kepemilikan tanpa lewat sesi pengguna.
  if coalesce(auth.role(), current_user) = 'service_role' then
    return new;
  end if;

  if current_setting('jatayu.klaim', true) = 'on' then
    return new;
  end if;

  raise exception 'owner_id hanya boleh diubah lewat klaim_alat() atau lepas_alat().';
end $$;

drop trigger if exists devices_jaga_owner on public.devices;
create trigger devices_jaga_owner
  before update on public.devices
  for each row execute function public.jaga_owner_alat();

-- ------------------------------------------------------
-- 5. DAFTAR PENANGGUNG JAWAB YANG BISA DIBACA TIM
-- ------------------------------------------------------
-- auth.users tidak boleh dibaca role authenticated, jadi email
-- pemilik tidak bisa diambil langsung dari klien. View ini
-- membuka persis satu hal: siapa nama penanggung jawab tiap alat.
create or replace view public.alat_penanggung_jawab
with (security_invoker = true) as
select
  d.device_id,
  d.owner_id,
  d.claimed_at,
  d.claim_code is not null as punya_kode,
  p.nama as nama_penanggung_jawab
from public.devices d
left join public.profiles p on p.id = d.owner_id;

grant select on public.alat_penanggung_jawab to authenticated;
