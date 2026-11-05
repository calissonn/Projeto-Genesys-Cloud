import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Command Center',
  description: 'Empresa virtual de agentes de IA com supervisão humana',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b1020' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
