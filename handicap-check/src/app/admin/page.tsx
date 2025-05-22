'use client'

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link'

function getToday() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(getToday());

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
    </div>
  );
} 