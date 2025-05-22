'use client'

import { useState, useEffect } from 'react'
import { useDebounce } from '@/hooks/useDebounce'

interface Golfer {
  id: string
  name: string
}

export default function GolferSearch({ onSelect }: { onSelect: (golfer: Golfer) => void }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Golfer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const debouncedSearch = useDebounce(search, 300)

  useEffect(() => {
    const searchGolfers = async () => {
      if (!debouncedSearch) {
        setResults([])
        return
      }

      setIsLoading(true)
      try {
        const response = await fetch(`/api/search-golfers?q=${encodeURIComponent(debouncedSearch)}`)
        const data = await response.json()
        console.log('Search results:', data)
        setResults(data)
      } catch (error) {
        console.error('Error searching golfers:', error)
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }

    searchGolfers()
  }, [debouncedSearch])

  const handleSelect = (golfer: Golfer) => {
    setSearch(golfer.name)
    setResults([])
    onSelect(golfer)
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search golfers..."
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900 placeholder:text-gray-500"
        />
        {isLoading && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md bg-white shadow-lg">
          <ul className="max-h-60 overflow-auto rounded-md py-1 text-base sm:text-sm">
            {results.map((golfer) => (
              <li
                key={golfer.id}
                className="relative cursor-pointer select-none py-2 pl-3 pr-9 hover:bg-indigo-50"
                onClick={() => handleSelect(golfer)}
              >
                <div className="flex items-center">
                  <span className="truncate text-gray-900">{golfer.name}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
} 