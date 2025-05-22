import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default NextAuth({
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
    async signIn({ user, account, profile }) {
      if (!user.email) return false

      // Debug: log the account object
      console.log('ACCOUNT OBJECT:', account);

      // Fetch user from DB
      const { data: existingUser } = await supabase
        .from('users')
        .select('is_admin')
        .eq('email', user.email)
        .single()

      // Only require refresh token for admins
      if (existingUser?.is_admin) {
        // Only save the refresh token if it exists and is non-empty
        const upsertData: any = {
          email: user.email,
          name: user.name,
          google_id: account?.providerAccountId
        };
        if (account?.refresh_token) {
          upsertData.gmail_refresh_token = account.refresh_token;
        }
        await supabase.from('users').upsert(upsertData, { onConflict: 'email' });
      } else {
        // For non-admins, do not save the refresh token
        await supabase.from('users').upsert({
          email: user.email,
          name: user.name,
          google_id: account?.providerAccountId
          // No refresh token
        }, { onConflict: 'email' })
      }

      return true;
    },
    async session({ session, token, user }) {
      if (session.user?.email) {
        const { data: userData } = await supabase
          .from('users')
          .select('is_approved, is_admin, gmail_refresh_token')
          .eq('email', session.user.email)
          .single()

        session.user.isApproved = userData?.is_approved ?? false
        session.user.isAdmin = userData?.is_admin ?? false
        session.user.hasGmailRefreshToken = !!userData?.gmail_refresh_token
      }
      return session
    }
  }
}) 