'use client'

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link'
import type { Session } from 'next-auth';

interface ApiResponse {
  error?: string;
  timeout?: boolean;
  message?: string;
  success?: boolean;
  step?: string;
  steps?: {
    mtech?: { success: boolean; teeTimes: number };
    usga?: { success: boolean; posts: number };
    process?: { success: boolean; inserted: number };
  };
  stats?: {
    total: number;
    inserted: number;
    skipped: number;
    excused: number;
    unexcused: number;
    unmatched: number;
  };
  unmatched?: string[];
  partialData?: {
    mtechTeeTimes: number;
    usgaPosts: number;
  };
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
  const { data: session, status } = useSession() as { data: Session | null, status: string };
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
    setResult(null); // Clear previous results
    try {
      // Create a timeout for the frontend request (30 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`/api/load-old-data?date=${date}`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        if (response.status === 408) {
          // Handle timeout from the API
          const data = await response.json();
          setResult({ 
            error: data.error,
            timeout: true,
            message: 'The operation timed out but may still be processing. Please check your data and try again if needed.'
          });
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Error loading old data:', error);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          setResult({ 
            error: 'Request timed out after 30 seconds. The operation may still be running on the server.',
            timeout: true,
            message: 'Please wait a few minutes and check if your data was updated, or try again with a smaller date range.'
          });
        } else if (error.message.includes('Failed to fetch')) {
          setResult({ 
            error: 'Network error or server timeout',
            message: 'Please check your connection and try again. The server may be processing a large amount of data.'
          });
        } else {
          setResult({ error: error.message });
        }
      } else {
        setResult({ error: 'An unexpected error occurred' });
      }
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
      
      {/* Admin Navigation */}
      <h2 className="text-xl font-bold mb-4">Admin Tools</h2>
      <div className="mb-6 flex flex-wrap gap-3">
        <Link 
          href="/admin/users" 
          className="bg-indigo-500 text-white px-4 py-2 rounded hover:bg-indigo-600 transition font-medium"
        >
          Manage Users
        </Link>
        <Link 
          href="/admin/golfers" 
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition font-medium"
        >
          Manage Golfers
        </Link>
        <Link 
          href="/admin/reports" 
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition font-medium"
        >
          Golfer Reports
        </Link>
      </div>
      
      <h2 className="text-xl font-bold mb-4">Data Operations</h2>
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
          {result.error ? (
            <div className="mb-4">
              <div className={`p-3 rounded ${result.timeout ? 'bg-yellow-100 border-yellow-400 text-yellow-800' : 'bg-red-100 border-red-400 text-red-800'} border`}>
                <h3 className="font-semibold mb-2">
                  {result.timeout ? '⏱️ Operation Timed Out' : '❌ Error'}
                </h3>
                <p className="mb-2">{String(result.error)}</p>
                {result.message && (
                  <p className="text-sm italic">{String(result.message)}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <div className="p-3 rounded bg-green-100 border-green-400 text-green-800 border">
                <h3 className="font-semibold mb-2">✅ Success</h3>
                {result.steps && (
                  <div className="text-sm mb-3">
                    <h4 className="font-medium mb-1">Process Steps:</h4>
                    {result.steps.mtech && (
                      <p>📊 MTech Data: {result.steps.mtech.teeTimes} tee times fetched</p>
                    )}
                    {result.steps.usga && (
                      <p>📧 USGA Posts: {result.steps.usga.posts} posted scores found</p>
                    )}
                    {result.steps.process && (
                      <p>💾 Database: {result.steps.process.inserted} records inserted</p>
                    )}
                  </div>
                )}
                {result.stats && (
                  <div className="text-sm">
                    <h4 className="font-medium mb-1">Final Statistics:</h4>
                    <p>Total tee times: {result.stats.total}</p>
                    <p>Inserted: {result.stats.inserted}</p>
                    <p>Skipped: {result.stats.skipped}</p>
                    <p>Excused: {result.stats.excused}</p>
                    <p>Unexcused: {result.stats.unexcused}</p>
                    <p>Unmatched: {result.stats.unmatched}</p>
                  </div>
                )}
                {result.partialData && (
                  <div className="text-sm mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                    <h4 className="font-medium">Partial Data Available:</h4>
                    <p>MTech tee times: {result.partialData.mtechTeeTimes}</p>
                    <p>USGA posts: {result.partialData.usgaPosts}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
              Show Raw Response
            </summary>
            <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
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