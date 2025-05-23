'use client'

import { useState } from 'react'

interface Round {
  id: string
  date: string
  tee_time: string
  posting_status: 'posted' | 'unexcused_no_post' | 'excused_no_post'
  excuse_reason?: string
}

interface GolferRoundsProps {
  rounds: Round[]
  onUpdateRound: (roundId: string, status: Round['posting_status'], excuseReason?: string) => Promise<void>
  onDeleteRound?: (roundId: string) => Promise<void>
}

export default function GolferRounds({ rounds, onUpdateRound, onDeleteRound }: GolferRoundsProps) {
  const [editingRound, setEditingRound] = useState<string | null>(null)
  const [excuseReason, setExcuseReason] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [editingStatus, setEditingStatus] = useState<Round['posting_status'] | null>(null)

  const handleUpdate = async (roundId: string, status: Round['posting_status']) => {
    setIsUpdating(true)
    try {
      await onUpdateRound(roundId, status, status === 'excused_no_post' ? excuseReason : undefined)
      if (status !== 'excused_no_post') {
        setExcuseReason('')
      }
      setEditingRound(null)
      setExcuseReason('')
      setEditingStatus(null)
    } catch (error) {
      console.error('Error updating round:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium leading-6 text-gray-900">Round History</h3>
        <div className="mt-5">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-300">
              <thead>
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Date</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Tee Time</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rounds.map((round) => (
                  <tr key={round.id}>
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-900 sm:pl-6">
                      {round.date}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">
                      {round.tee_time}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900 align-top">
                      <div>
                        {round.posting_status === 'posted' ? (
                          <span className="bg-green-50 text-green-700 text-xs font-medium rounded px-2 py-1 border border-green-200 inline-block">
                            Posted
                          </span>
                        ) : round.posting_status === 'excused_no_post' ? (
                          <>
                            <span className="bg-yellow-50 text-yellow-700 text-xs font-medium rounded px-2 py-1 border border-yellow-200 inline-block">
                              Excused
                            </span>
                            {round.excuse_reason && (
                              <div className="mt-1 text-xs text-gray-500">
                                <span className="font-medium">Reason:</span> {round.excuse_reason}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="bg-red-50 text-red-700 text-xs font-medium rounded px-2 py-1 border border-red-200 inline-block">
                            Not Posted
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900" style={{ width: '14rem' }}>
                      {editingRound === round.id ? (
                        <div className="space-y-2 w-full">
                          <select
                            value={editingStatus || round.posting_status}
                            onChange={(e) => {
                              const newStatus = e.target.value as Round['posting_status']
                              setEditingStatus(newStatus)
                              if (newStatus === 'excused_no_post') {
                                setExcuseReason(round.excuse_reason || '')
                              } else {
                                setExcuseReason('')
                              }
                            }}
                            disabled={isUpdating}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          >
                            <option value="posted">Posted</option>
                            <option value="excused_no_post">Excused</option>
                            <option value="unexcused_no_post">Not Posted</option>
                          </select>
                          <div style={{ minHeight: '2.5rem' }}>
                            {editingStatus === 'excused_no_post' && (
                              <input
                                type="text"
                                value={excuseReason}
                                onChange={(e) => setExcuseReason(e.target.value)}
                                placeholder="Enter excuse reason..."
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                              />
                            )}
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleUpdate(round.id, editingStatus || round.posting_status)}
                              disabled={isUpdating}
                              className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingRound(null)
                                setExcuseReason('')
                                setEditingStatus(null)
                              }}
                              disabled={isUpdating}
                              className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => {
                              setEditingRound(round.id)
                              setEditingStatus(round.posting_status)
                              if (round.posting_status === 'excused_no_post') {
                                setExcuseReason(round.excuse_reason || '')
                              }
                            }}
                            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            Edit
                          </button>
                          {onDeleteRound && (
                            <button
                              onClick={() => {
                                if (window.confirm('Are you sure you want to delete this round? This action cannot be undone.')) {
                                  onDeleteRound(round.id)
                                }
                              }}
                              className="inline-flex items-center px-2.5 py-1.5 border border-red-300 text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
} 