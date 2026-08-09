-- ======================================================
-- MULTI CHAT ID TELEGRAM PER AKUN
--
-- Sebelumnya satu akun hanya punya satu tujuan notifikasi
-- (profiles.telegram_chat_id), sehingga satu orang tidak bisa
-- menerima peringatan di dua perangkat/akun Telegram, dan sebuah
-- grup tidak bisa ditambahkan berdampingan dengan chat pribadi.
--
-- Tabel ini menggantikan kolom itu. Kolom lamanya SENGAJA tidak
-- dihapus di migrasi ini: kalau ada deployment yang belum
-- diperbarui, ia masih bisa membaca kolom lama sampai semua
-- edge function selesai di-deploy. Hapus manual setelah itu.
-- ======================================================

create table if not exists public.telegram_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  chat_id text not null,
  -- Nama bebas dari pengguna ("HP saya", "Grup Gudang"). Tanpa ini
  -- daftar berisi beberapa deretan angka yang mustahil dibedakan.
  label text,
  created_at timestamptz not null default now(),

  -- Unik SECARA GLOBAL, bukan hanya per user. Bot Telegram memetakan
  -- chat_id yang masuk kembali ke satu akun; kalau dua akun mendaftarkan
  -- chat yang sama, pemetaan itu jadi ambigu dan perintah bot akan
  -- menjawab data milik akun yang salah.
  unique (chat_id)
);

create index if not exists telegram_chats_user_id_idx
  on public.telegram_chats (user_id);

-- Pindahkan chat ID yang sudah terdaftar supaya tidak ada notifikasi
-- yang berhenti diam-diam saat fungsi beralih ke tabel baru.
insert into public.telegram_chats (user_id, chat_id, label)
select id, telegram_chat_id, 'Telegram utama'
from public.profiles
where telegram_chat_id is not null
  and btrim(telegram_chat_id) <> ''
on conflict (chat_id) do nothing;

alter table public.telegram_chats enable row level security;

-- SELECT terbuka untuk seluruh tim, mengikuti model tim yang sudah
-- dipakai devices/readings/profiles (lihat 03_update_rls_tim.sql):
-- tim perlu tahu siapa saja yang menerima peringatan.
drop policy if exists "tim lihat semua chat telegram" on public.telegram_chats;
create policy "tim lihat semua chat telegram"
  on public.telegram_chats for select
  to authenticated
  using (true);

-- Menulis tetap per-user. Seorang anggota tim tidak boleh menambah,
-- mengganti label, atau menghapus tujuan notifikasi orang lain.
drop policy if exists "user tambah chat telegram sendiri" on public.telegram_chats;
create policy "user tambah chat telegram sendiri"
  on public.telegram_chats for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "user ubah chat telegram sendiri" on public.telegram_chats;
create policy "user ubah chat telegram sendiri"
  on public.telegram_chats for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "user hapus chat telegram sendiri" on public.telegram_chats;
create policy "user hapus chat telegram sendiri"
  on public.telegram_chats for delete
  to authenticated
  using (user_id = (select auth.uid()));
