import NextAuth from 'next-auth'

declare module 'next-auth' {
  interface User {
    isAdmin?: boolean
    isApproved?: boolean
    hasGmailRefreshToken?: boolean
  }
  interface Session {
    user: User
  }
} 