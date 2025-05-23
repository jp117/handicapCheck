import NextAuth from 'next-auth/next'
import GoogleProvider from 'next-auth/providers/google'
import { createClient } from '@supabase/supabase-js'
import type { User } from 'next-auth'

interface AppUser extends User {
  email?: string;
  name?: string;
  isApproved?: boolean;
  isAdmin?: boolean;
  hasGmailRefreshToken?: boolean;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role for server-side upserts
)

const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    })
  ],
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async signIn(params: any) {
      const { user, account } = params;
      const typedUser = user as AppUser;
      if (!typedUser.email) return false;

      // Check if user exists and is approved
      const { data: existingUser } = await supabase
        .from('users')
        .select('is_approved')
        .eq('email', typedUser.email)
        .single();

      // If user exists but is not approved, deny access
      if (existingUser && !existingUser.is_approved) {
        return false;
      }

      // Upsert user into Supabase with refresh token
      const upsertData: Record<string, unknown> = {
        email: typedUser.email,
        name: typedUser.name,
        google_id: account?.providerAccountId,
      };
      if (account?.refresh_token) {
        upsertData.gmail_refresh_token = account.refresh_token;
      }
      await supabase.from('users').upsert(upsertData, { onConflict: 'email' });

      return true;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session(params: any) {
      const { session } = params;
      const userObj = session.user as AppUser;
      if (userObj?.email) {
        // Get user's approval status
        const { data: userData } = await supabase
          .from('users')
          .select('is_approved, is_admin')
          .eq('email', userObj.email)
          .single();

        // Add approval status to session
        userObj.isApproved = userData?.is_approved ?? false;
        userObj.isAdmin = userData?.is_admin ?? false;
      }
      return session;
    }
  }
}

export default NextAuth(authOptions) 