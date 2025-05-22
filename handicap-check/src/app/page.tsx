'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import GolferSearch from '@/components/GolferSearch'
import GolferStats from '@/components/GolferStats'
import GolferRounds from '@/components/GolferRounds'

interface Golfer {
  id: string
  name: string
  handicap_index: number
}

export default function Home() {
  const { data: session, status } = useSession()
  const [selectedGolfer, setSelectedGolfer] = useState<Golfer | null>(null)
  const [golferRounds, setGolferRounds] = useState<any[]>([])

  const handleGolferSelect = async (golfer: Golfer) => {
    setSelectedGolfer(golfer)
    try {
      // Fetch golfer rounds
      const roundsResponse = await fetch(`/api/golfer-rounds/${golfer.id}`)
      const rounds = await roundsResponse.json()
      setGolferRounds(rounds)
    } catch (error) {
      console.error('Error fetching golfer data:', error)
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-lg text-gray-900 font-medium">Please log in to see content</p>
      </div>
    )
  }

  if (!session.user.isApproved) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-lg text-gray-900 font-medium">Your account is pending approval. Please contact an administrator.</p>
      </div>
    )
  }

  return (
    <main>
      <div className="space-y-6">
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-lg font-medium text-gray-900">Search Golfer</h2>
            <div className="mt-5">
              <GolferSearch onSelect={handleGolferSelect} />
            </div>
          </div>
        </div>

        {selectedGolfer && (
          <GolferStats golferId={selectedGolfer.id} golferName={selectedGolfer.name} />
        )}

        {selectedGolfer && golferRounds.length > 0 && (
          <GolferRounds rounds={golferRounds} />
        )}
      </div>
    </main>
  )
}
