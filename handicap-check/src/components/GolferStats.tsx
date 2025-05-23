'use client'

import { useState, useEffect, useCallback } from 'react'
import DateFilter from './DateFilter'

interface Stats {
  roundsPlayed: number
  roundsPosted: number
  unexcusedNoPost: number
  postPercentage: number
  dateRange?: {
    start: string | null
    end: string | null
  }
}

interface GolferStatsProps {
  golferId: string
  golferName: string
}

export default function GolferStats({ golferId, golferName }: GolferStatsProps) {
  const [stats, setStats] = useState<Stats | null>(null)

  const fetchStats = useCallback(async (startDate?: string | null, endDate?: string | null) => {
    try {
      const url = new URL(`/api/golfer-stats/${golferId}`, window.location.origin)
      if (startDate) url.searchParams.set('startDate', startDate)
      if (endDate) url.searchParams.set('endDate', endDate)

      const response = await fetch(url)
      const data = await response.json()
      setStats(data)
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }, [golferId])

  useEffect(() => {
    fetchStats()
  }, [golferId, fetchStats])

  const handleDateFilterChange = (startDate: string | null, endDate: string | null) => {
    fetchStats(startDate, endDate)
  }

  if (!stats) {
    return (
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-medium leading-6 text-gray-900">{golferName}&apos;s Posting History</h3>
          <DateFilter onFilterChange={handleDateFilterChange} />
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-700">Rounds Played</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{stats.roundsPlayed}</dd>
          </div>
          <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-700">Rounds Posted</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{stats.roundsPosted}</dd>
          </div>
          <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-700">Unexcused No Post</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{stats.unexcusedNoPost}</dd>
          </div>
          <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-700">Post %</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{stats.postPercentage}%</dd>
          </div>
        </div>
      </div>
    </div>
  )
} 