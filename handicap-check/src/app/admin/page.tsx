'use client'

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link'

interface ApiResponse {
  error?: string;
  [key: string]: unknown;
}

interface ExcludedDate {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
}

function getToday() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(getToday());

  // Excluded dates state
  const [excluded, setExcluded] = useState<ExcludedDate[]>([]);
  const [exDate, setExDate] = useState(getToday());
  const [exStart, setExStart] = useState('');
  const [exEnd, setExEnd] = useState('');
  const [exReason, setExReason] = useState('');
  const [exLoading, setExLoading] = useState(false);
  const [exError, setExError] = useState('');

  useEffect(() => {
    fetchExcluded();
  }, []);

  async function fetchExcluded() {
    setExLoading(true);
    setExError('');
    try {
      const res = await fetch('/api/excluded-dates');
      const data = await res.json();
      setExcluded(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching excluded dates:', error);
      setExError(error instanceof Error ? error.message : 'Failed to load exclusions');
    } finally {
      setExLoading(false);
    }
  }

  async function addExcluded(event: React.FormEvent) {
    event.preventDefault();
    setExLoading(true);
    setExError('');
    try {
      const res = await fetch('/api/excluded-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: exDate,
          start_time: exStart || null,
          end_time: exEnd || null,
          reason: exReason
        })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to add exclusion');
      }
      setExDate(getToday());
      setExStart('');
      setExEnd('');
      setExReason('');
      fetchExcluded();
    } catch (error) {
      console.error('Error adding excluded date:', error);
      setExError(error instanceof Error ? error.message : 'Failed to add exclusion');
    } finally {
      setExLoading(false);
    }
  }

  async function deleteExcluded(id: string) {
    setExLoading(true);
    setExError('');
    try {
      const res = await fetch('/api/excluded-dates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete exclusion');
      }
      fetchExcluded();
    } catch (error) {
      console.error('Error deleting excluded date:', error);
      setExError(error instanceof Error ? error.message : 'Failed to delete exclusion');
    } finally {
      setExLoading(false);
    }
  }

  if (status === 'loading') {
    return <div className="container mx-auto px-4 py-8 text-gray-900">Loading...</div>;
  }

  if (!session || !session.user || !session.user.isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8 text-gray-900">
        <h1 className="text-2xl font-bold mb-6">Access Denied</h1>
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }

  const runMTechAPI = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cron/check-handicaps');
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Error running MTech API:', error);
      setResult({ error: 'Failed to run MTech API' });
    } finally {
      setLoading(false);
    }
  };

  const loadOldData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/load-old-data?date=${date}`);
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Error loading old data:', error);
      setResult({ error: 'Failed to load old data' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 text-gray-900">
      <div className="mb-6">
        <Link href="/" className="inline-block bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold px-4 py-2 rounded transition">← Back to Home</Link>
      </div>
      <h1 className="text-2xl font-bold mb-6">Admin Page</h1>
      <div className="space-x-4 flex items-center mb-4">
        <button
          onClick={runMTechAPI}
          disabled={loading}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          Run MTech API
        </button>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={loadOldData}
          disabled={loading}
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
        >
          Load Old Data
        </button>
      </div>
      {result && (
        <div className="mt-6 p-4 bg-gray-100 rounded text-gray-900">
          <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
      <h2 className="text-xl font-bold mt-10 mb-2">Excluded Dates/Times</h2>
      <form onSubmit={addExcluded} className="mb-4 flex flex-wrap gap-2 items-end">
        <input type="date" value={exDate} onChange={e => setExDate(e.target.value)} required className="border rounded px-2 py-1" />
        <input type="time" value={exStart} onChange={e => setExStart(e.target.value)} className="border rounded px-2 py-1" placeholder="Start Time (optional)" />
        <input type="time" value={exEnd} onChange={e => setExEnd(e.target.value)} className="border rounded px-2 py-1" placeholder="End Time (optional)" />
        <input type="text" value={exReason} onChange={e => setExReason(e.target.value)} className="border rounded px-2 py-1" placeholder="Reason (optional)" />
        <button type="submit" disabled={exLoading} className="bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-50">Add</button>
      </form>
      {exError && <div className="text-red-600 mb-2">{exError}</div>}
      {exLoading ? <div>Loading...</div> : (
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-200">
              <th className="border px-2 py-1">Date</th>
              <th className="border px-2 py-1">Start</th>
              <th className="border px-2 py-1">End</th>
              <th className="border px-2 py-1">Reason</th>
              <th className="border px-2 py-1">Actions</th>
            </tr>
          </thead>
          <tbody>
            {excluded.map(e => (
              <tr key={e.id}>
                <td className="border px-2 py-1">{e.date}</td>
                <td className="border px-2 py-1">{e.start_time || 'All Day'}</td>
                <td className="border px-2 py-1">{e.end_time || 'All Day'}</td>
                <td className="border px-2 py-1">{e.reason || ''}</td>
                <td className="border px-2 py-1">
                  <button onClick={() => deleteExcluded(e.id)} className="bg-red-500 text-white px-2 py-1 rounded text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
} 