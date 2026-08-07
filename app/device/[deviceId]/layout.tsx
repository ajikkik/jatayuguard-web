import type { Metadata } from "next";

export const metadata: Metadata = { title: "Catatan Alat" };

export default function DeviceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
