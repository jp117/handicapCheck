import NextAuth from 'next-auth/next'
import GoogleProvider from 'next-auth/providers/google'
import { createClient } from '@supabase/supabase-js'

interface AppUser {
  email?: string;
  name?: string;
  isApproved?: boolean;
  isAdmin?: boolean;
  hasGmailRefreshToken?: boolean;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const authOptions = {
  providers: [
    GoogleProvider({
      id: 'google-admin',
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
      const typedUser = user as AppUser
      if (!typedUser.email) return false

      // Debug: log the account object
      console.log('ACCOUNT OBJECT:', account);

      // Fetch user from DB
      const { data: existingUser } = await supabase
        .from('users')
        .select('is_admin')
        .eq('email', typedUser.email)
        .single()

      // Only require refresh token for admins
      if (existingUser?.is_admin) {
        // Only save the refresh token if it exists and is non-empty
        const upsertData: Record<string, unknown> = {
          email: typedUser.email,
          name: typedUser.name,
          google_id: account?.providerAccountId
        };
        if (account?.refresh_token) {
          upsertData.gmail_refresh_token = account.refresh_token;
        }
        await supabase.from('users').upsert(upsertData, { onConflict: 'email' });
      } else {
        // For non-admins, do not save the refresh token
        const upsertData: Record<string, unknown> = {
          email: typedUser.email,
          name: typedUser.name,
          google_id: account?.providerAccountId
        };
        await supabase.from('users').upsert(upsertData, { onConflict: 'email' })
      }

      return true;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session(params: any) {
      const { session } = params;
      const userObj = session.user as AppUser
      if (userObj?.email) {
        const { data: userData } = await supabase
          .from('users')
          .select('is_approved, is_admin, gmail_refresh_token')
          .eq('email', userObj.email)
          .single()

        userObj.isApproved = userData?.is_approved ?? false
        userObj.isAdmin = userData?.is_admin ?? false
        userObj.hasGmailRefreshToken = !!userData?.gmail_refresh_token
      }
      return session
    }
  }
}

export default NextAuth(authOptions) 