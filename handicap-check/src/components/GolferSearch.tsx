'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { useDebounce } from '@/hooks/useDebounce'

interface Golfer {
  id: string
  name: string
  handicap_index: number
}

interface GolferSearchProps {
  onSelect: (golfer: Golfer) => void
}

export default function GolferSearch({ onSelect }: GolferSearchProps) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Golfer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const debouncedSearch = useDebounce(search, 300)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const searchGolfers = async () => {
      if (!debouncedSearch) {
        setResults([])
        setSelectedIndex(-1)
        return
      }

      setIsLoading(true)
      try {
        const response = await fetch(`/api/search-golfers?q=${encodeURIComponent(debouncedSearch)}`)
        const data = await response.json()
        console.log('Search results:', data)
        setResults(data)
        setSelectedIndex(-1)
      } catch (error) {
        console.error('Error searching golfers:', error)
        setResults([])
        setSelectedIndex(-1)
      } finally {
        setIsLoading(false)
      }
    }

    searchGolfers()
  }, [debouncedSearch])

  const handleSelect = (golfer: Golfer) => {
    setSearch(golfer.name)
    setResults([])
    setSelectedIndex(-1)
    onSelect(golfer)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelect(results[selectedIndex])
        }
        break
      case 'Escape':
        setResults([])
        setSelectedIndex(-1)
        break
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const selectedItem = listRef.current.children[selectedIndex] as HTMLElement
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  return (
    <div className="relative">
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
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
          <ul ref={listRef} className="max-h-60 overflow-auto rounded-md py-1 text-base sm:text-sm">
            {results.map((golfer, index) => (
              <li
                key={golfer.id}
                className={`relative cursor-pointer select-none py-2 pl-3 pr-9 ${
                  index === selectedIndex ? 'bg-indigo-50' : 'hover:bg-indigo-50'
                }`}
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