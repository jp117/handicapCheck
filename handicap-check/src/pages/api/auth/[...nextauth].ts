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
          scope: 'openid email profile'
        }
      }
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Upsert user into Supabase
      if (user.email) {
        await supabase.from('users').upsert({
          email: user.email,
          name: user.name,
          google_id: account?.providerAccountId,
        }, { onConflict: 'email' })
      }
      return true
    }
  }
}) 