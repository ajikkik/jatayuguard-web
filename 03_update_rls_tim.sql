-- ======================================================
-- UPDATE RLS: dari model "per-owner" menjadi model "tim"
-- Semua user yang sudah login (authenticated) bisa melihat
-- dan mengatur SEMUA device, bukan hanya device miliknya sendiri.
-- ======================================================

-- Hapus policy lama yang membatasi per-owner
drop policy if exists "user lihat device miliknya" on public.devices;
drop policy if exists "user klaim device tanpa owner" on public.devices;
drop policy if exists "user baca reading device miliknya" on public.readings;

-- ------------------------------------------------------
-- DEVICES: semua user login bisa lihat & edit semua device
-- ------------------------------------------------------
create policy "tim lihat semua device"
  on public.devices for select
  to authenticated
  using (true);

create policy "tim update semua device"
  on public.devices for update
  to authenticated
  using (true)
  with check (true);

create policy "tim insert device baru"
  on public.devices for insert
  to authenticated
  with check (true);

-- ------------------------------------------------------
-- READINGS: semua user login bisa lihat semua reading
-- ------------------------------------------------------
create policy "tim baca semua reading"
  on public.readings for select
  to authenticated
  using (true);

-- ------------------------------------------------------
-- PROFILES: tetap per-user (tiap orang chat_id sendiri),
-- TAPI tim perlu bisa lihat semua chat_id supaya bisa kelola siapa
-- dapat notif untuk device mana. Tambahkan policy select untuk semua tim.
-- ------------------------------------------------------
create policy "tim lihat semua profile"
  on public.profiles for select
  to authenticated
  using (true);
