import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from './providers'
import ResponsiveNav from '@/components/ResponsiveNav';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Handicap Check",
  description: "Golf handicap checking and management system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <main className="min-h-screen bg-gray-50">
            <ResponsiveNav />
            <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </Providers>
      </body>
    </html>
  );
}
