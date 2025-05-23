import { google } from 'googleapis';

export interface GmailUser {
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