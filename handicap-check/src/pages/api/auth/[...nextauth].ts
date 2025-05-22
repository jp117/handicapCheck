import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role for server-side upserts
)

export default NextAuth({
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
    async signIn({ user, account, profile }) {
      if (!user.email) return false

      // Check if user exists and is approved
      const { data: existingUser } = await supabase
        .from('users')
        .select('is_approved')
        .eq('email', user.email)
        .single()

      // If user exists but is not approved, deny access
      if (existingUser && !existingUser.is_approved) {
        return false
      }

      // Upsert user into Supabase with refresh token
      await supabase.from('users').upsert({
        email: user.email,
        name: user.name,
        google_id: account?.providerAccountId,
        gmail_refresh_token: account?.refresh_token // Save the refresh token
      }, { onConflict: 'email' })

      return true
    },
    async session({ session, token, user }) {
      if (session.user?.email) {
        // Get user's approval status
        const { data: userData } = await supabase
          .from('users')
          .select('is_approved, is_admin')
          .eq('email', session.user.email)
          .single()

        // Add approval status to session
        session.user.isApproved = userData?.is_approved ?? false
        session.user.isAdmin = userData?.is_admin ?? false
      }
      return session
    }
  }
}) 