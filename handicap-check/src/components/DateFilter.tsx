'use client'

import { useState } from 'react'

interface DateFilterProps {
  onFilterChange: (startDate: string | null, endDate: string | null) => void
}

export default function DateFilter({ onFilterChange }: DateFilterProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCustom, setIsCustom] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const handlePresetClick = (preset: 'allTime' | 'currentYear' | 'lastTwoYears') => {
    setIsCustom(false)
    const today = new Date()
    let start: Date | null = null
    let end: Date | null = null

    if (preset === 'allTime') {
      start = null
      end = null
    } else if (preset === 'currentYear') {
      start = new Date(today.getFullYear(), 0, 1) // January 1st of current year
      end = today
    } else {
      // Last two years
      start = new Date(today.getFullYear() - 2, 0, 1)
      end = today
    }

    onFilterChange(
      start ? start.toISOString().split('T')[0] : null,
      end ? end.toISOString().split('T')[0] : null
    )
    setIsModalOpen(false)
  }

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (startDate && endDate) {
      onFilterChange(startDate, endDate)
      setIsModalOpen(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        Filter by Date
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Filter by Date</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col space-y-2">
                <button
                  onClick={() => handlePresetClick('allTime')}
                  className="w-full px-4 py-2 text-sm font-medium text-gray-900 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  All Time
                </button>
                <button
                  onClick={() => handlePresetClick('currentYear')}
                  className="w-full px-4 py-2 text-sm font-medium text-gray-900 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Current Year
                </button>
                <button
                  onClick={() => handlePresetClick('lastTwoYears')}
                  className="w-full px-4 py-2 text-sm font-medium text-gray-900 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Last 2 Years
                </button>
                <button
                  onClick={() => setIsCustom(!isCustom)}
                  className="w-full px-4 py-2 text-sm font-medium text-gray-900 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Custom Range
                </button>
              </div>

              {isCustom && (
                <form onSubmit={handleCustomSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="startDate" className="block text-sm font-medium text-gray-900">
                        Start Date
                      </label>
                      <input
                        type="date"
                        id="startDate"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="endDate" className="block text-sm font-medium text-gray-900">
                        End Date
                      </label>
                      <input
                        type="date"
                        id="endDate"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Apply Filter
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
} 