'use client'

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useSession } from 'next-auth/react'
import type { Session } from 'next-auth'

interface GolferStat {
  id: string;
  member_number: string;
  name: string;
  postPercentage: number;
}

interface NotFoundGolfer {
  member_number: string;
  status: 'not_in_db';
}

interface BatchResponse {
  found: GolferStat[];
  notFound: NotFoundGolfer[];
}

export default function TournamentCheckPage() {
  const { data: session, status } = useSession() as { data: Session | null, status: string }
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [memberNumbers, setMemberNumbers] = useState<string[]>([]);
  const [lowPostGolfers, setLowPostGolfers] = useState<GolferStat[]>([]);
  const [notFoundGolfers, setNotFoundGolfers] = useState<NotFoundGolfer[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
      </div>
    )
  }
  if (!session || !session.user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-lg text-gray-900 font-medium">Please sign in to continue.</p>
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      // Parse XLSX
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      // Skip header row (row 0)
      const numbers = (rows as unknown[][])
        .slice(1)
        .map(row => row[28])
        .filter(val => typeof val === 'string' || typeof val === 'number')
        .map(val => String(val).trim())
        .filter(val => val.length > 0 && val.toLowerCase() !== 'memberno');
      setMemberNumbers(numbers);
      // Fetch stats for these member numbers
      setLoadingStats(true);
      try {
        const res = await fetch('/api/golfer-stats/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberNumbers: numbers })
        });
        const response: BatchResponse = await res.json();
        setLowPostGolfers(response.found.filter(g => g.postPercentage < 80));
        setNotFoundGolfers(response.notFound);
      } catch {
        setLowPostGolfers([]);
        setNotFoundGolfers([]);
      } finally {
        setLoadingStats(false);
      }
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="max-w-2xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-4 text-gray-900">Tournament Check</h1>
      <p className="text-base font-medium text-gray-900 mb-6">Upload a tournament XLSX file to check results.</p>
      <div className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-400 rounded-lg p-8 bg-indigo-50">
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={handleButtonClick}
          className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          Select XLSX File
        </button>
        {selectedFile && (
          <div className="mt-4 text-base text-gray-900 font-semibold">
            Selected file: <span className="font-bold">{selectedFile.name}</span>
          </div>
        )}
      </div>
      {memberNumbers.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold mb-2 text-gray-900">Extracted Member Numbers (Column AC):</h2>
          <div className="bg-white rounded p-4 shadow text-gray-900 text-sm max-h-64 overflow-auto">
            {memberNumbers.join(', ')}
          </div>
        </div>
      )}
      {notFoundGolfers.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold mb-2 text-red-700">⚠️ Golfers Not in Database</h2>
          <div className="bg-red-50 border border-red-200 rounded p-4 shadow">
            <p className="text-sm text-red-600 mb-3">The following member numbers were not found in the database:</p>
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white rounded shadow">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Member #</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {notFoundGolfers.map(golfer => (
                    <tr key={golfer.member_number}>
                      <td className="px-4 py-2 text-gray-900">{golfer.member_number}</td>
                      <td className="px-4 py-2 text-red-600 font-medium">Not in DB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {lowPostGolfers.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold mb-2 text-gray-900">Golfers with &lt; 80% Posting Percentage</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded shadow">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Name</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Member #</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Post %</th>
                </tr>
              </thead>
              <tbody>
                {lowPostGolfers.map(golfer => (
                  <tr key={golfer.id}>
                    <td className="px-4 py-2 text-gray-900">{golfer.name}</td>
                    <td className="px-4 py-2 text-gray-900">{golfer.member_number}</td>
                    <td className="px-4 py-2 text-gray-900">{golfer.postPercentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {loadingStats && (
        <div className="mt-8 text-indigo-700 font-medium">Loading stats...</div>
      )}
    </div>
  );
} 