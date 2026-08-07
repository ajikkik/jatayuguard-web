import { redirect } from "next/navigation";

// Route "/" tidak punya tampilan sendiri — ia hanya pintu masuk.
// User yang belum login sudah dicegat lebih dulu oleh proxy.ts dan
// dilempar ke /login, jadi yang sampai ke sini pasti sudah login.
export default function RootPage() {
  redirect("/dashboard");
}
