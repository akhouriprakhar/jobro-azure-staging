import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AuthGuard from './components/auth/AuthGuard';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'JOBRO Platform',
  description: 'Enterprise multimodal AI interview intelligence platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans text-[#2C3454]`}>
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
