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
  const [statsRefreshKey, setStatsRefreshKey] = useState(0)

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

  const fetchRounds = async (golferId: string) => {
    try {
      const response = await fetch(`/api/golfer-rounds/${golferId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch rounds')
      }
      return await response.json()
    } catch (error) {
      console.error('Error fetching rounds:', error)
      return []
    }
  }

  const handleUpdateRound = async (roundId: string, status: string, excuseReason?: string) => {
    try {
      const response = await fetch(`/api/update-round/${roundId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          posting_status: status,
          excuse_reason: excuseReason,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update round')
      }

      // Refresh the rounds data
      if (selectedGolfer) {
        const updatedRounds = await fetchRounds(selectedGolfer.id)
        setGolferRounds(updatedRounds)
        setStatsRefreshKey(k => k + 1) // Force GolferStats to remount and re-fetch
      }
    } catch (error) {
      console.error('Error updating round:', error)
      throw error
    }
  }

  const handleDeleteRound = async (roundId: string) => {
    if (!selectedGolfer) return;
    try {
      const response = await fetch(`/api/delete-round/${roundId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete round');
      }
      // Refresh the rounds data
      const updatedRounds = await fetchRounds(selectedGolfer.id);
      setGolferRounds(updatedRounds);
      setStatsRefreshKey(k => k + 1); // Force GolferStats to remount and re-fetch
    } catch (error) {
      console.error('Error deleting round:', error);
    }
  };

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
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium leading-6 text-gray-900">Golfer Search</h3>
              <div className="mt-5">
                <GolferSearch onSelect={handleGolferSelect} />
              </div>
            </div>
          </div>

          {selectedGolfer && (
            <>
              <GolferStats key={statsRefreshKey} golferId={selectedGolfer.id} golferName={selectedGolfer.name} />
              <GolferRounds rounds={golferRounds} onUpdateRound={handleUpdateRound} onDeleteRound={handleDeleteRound} />
            </>
          )}
        </div>
      </div>
    </main>
  )
}
