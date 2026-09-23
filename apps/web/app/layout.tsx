import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  description: 'Объяснимый подбор event-подрядчиков по вашим условиям',
  title: 'Evently — умный подбор подрядчиков'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
