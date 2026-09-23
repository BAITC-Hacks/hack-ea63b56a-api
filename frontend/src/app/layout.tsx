import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HackAlem — подбор подрядчиков",
  description: "Подберите подрядчиков для мероприятия по условиям заказа.",
  icons: {
    icon: [{ url: "/brand-mark.svg", type: "image/svg+xml" }],
    shortcut: "/brand-mark.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
