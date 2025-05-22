'use client'

import { useSession } from 'next-auth/react'
import SignInButton from './SignInButton'
import UserAvatar from './UserAvatar'

export default function AuthNav() {
  const { data: session, status } = useSession()

  if (status === 'loading') return null
  if (!session) return <SignInButton />
  return <UserAvatar />
} 