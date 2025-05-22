'use client'

interface Stats {
  roundsPlayed: number
  roundsPosted: number
  unexcusedNoPost: number
  postPercentage: number
}

export default function GolferStats({ stats }: { stats: Stats }) {
  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium leading-6 text-gray-900">Golfer Stats</h3>
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