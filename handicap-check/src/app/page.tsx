'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { useSession } from 'next-auth/react'
import { createClient } from '@supabase/supabase-js'
import SignInButton from '@/components/SignInButton'

const formSchema = z.object({
  date: z.string().refine((date) => {
    const parsed = new Date(date)
    return !isNaN(parsed.getTime())
  }, 'Please enter a valid date'),
})

type FormData = z.infer<typeof formSchema>

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function Home() {
  const { data: session, status } = useSession()
  const [isApproved, setIsApproved] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<any>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  })

  useEffect(() => {
    const checkApproval = async () => {
      if (session?.user?.email) {
        const { data } = await supabase
          .from('users')
          .select('is_approved')
          .eq('email', session.user.email)
          .single()
        setIsApproved(data?.is_approved ?? false)
      }
    }
    checkApproval()
  }, [session])

  if (status === 'loading' || isApproved === null) return <p>Loading...</p>
  if (!session) return <SignInButton />
  if (!isApproved) return <p>Your account is pending approval by an admin.</p>

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/check-handicaps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      setResults(result)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main>
      <div className="space-y-6">
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-lg font-medium text-gray-900">Check Handicaps</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
              <div>
                <label htmlFor="date" className="block text-sm font-medium text-gray-700">
                  Date
                </label>
                <input
                  type="date"
                  {...register('date')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
                {errors.date && (
                  <p className="mt-1 text-sm text-red-600">{errors.date.message}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {isLoading ? 'Checking...' : 'Check Handicaps'}
              </button>
            </form>
          </div>
        </div>

        {results && (
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium text-gray-900">Results</h3>
              <div className="mt-4">
                {/* Add results display here */}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
