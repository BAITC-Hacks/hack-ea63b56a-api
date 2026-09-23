import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HackAlem — подбор подрядчиков",
  description: "Подберите подрядчиков для мероприятия по условиям заказа.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
