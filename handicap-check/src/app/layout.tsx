

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from './providers'
import AuthNav from '@/components/AuthNav'
import { google } from 'googleapis';
import Link from 'next/link';

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
            <nav className="bg-white shadow-sm">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                  <div className="flex">
                    <div className="flex-shrink-0 flex items-center space-x-6">
                      <Link href="/" className="text-xl font-bold text-gray-900 hover:text-indigo-600 transition-colors">Handicap Check</Link>
                      <Link href="/tournament-check" className="text-gray-700 hover:text-indigo-600 font-medium transition-colors">Tournament Check</Link>
                      <Link href="/score-check" className="text-gray-700 hover:text-indigo-600 font-medium transition-colors">Score Check</Link>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <AuthNav />
                  </div>
                </div>
              </div>
            </nav>
            <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </Providers>
      </body>
    </html>
  );
}

interface GmailUser {
  accessToken?: string;
  refreshToken: string;
  expiryDate?: number;
}

export async function getGmailClient(user: GmailUser) {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXTAUTH_URL // or your redirect URI
  );

  oAuth2Client.setCredentials({
    access_token: user.accessToken,      // optional, will be refreshed if expired
    refresh_token: user.refreshToken,    // required for refresh
    expiry_date: user.expiryDate,        // optional
  });

  // googleapis will auto-refresh the access token if needed
  return google.gmail({ version: 'v1', auth: oAuth2Client });
}
