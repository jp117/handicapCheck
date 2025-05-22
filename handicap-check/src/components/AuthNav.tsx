'use client'

import { useSession } from 'next-auth/react'
import SignInButton from './SignInButton'
import UserAvatar from './UserAvatar'

export default function AuthNav() {
  const { data: session, status } = useSession()

  return (
    <>
      {status === 'loading' ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : session ? (
        <UserAvatar />
      ) : (
        <SignInButton />
      )}
    </>
  )
} 