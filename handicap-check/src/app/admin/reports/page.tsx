'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link'
import type { Session } from 'next-auth';

interface PostingHistoryReport {
  golfer_id: string;
  golfer_name: string;
  member_number: string | null;
  ghin_number: string | null;
  total_rounds: number;
  posted_rounds: number;
  unexcused_no_post: number;
  excused_no_post: number;
  posting_percentage: number;
  last_round_date: string | null;
  recent_activity: {
    date: string;
    tee_time: string;
    posting_status: string;
    excuse_reason?: string;
  }[];
}

interface ReportSummary {
  totalGolfers: number;
  totalRounds: number;
  totalPosted: number;
  totalUnexcused: number;
  overallPostingPercentage: number;
  poorPerformers: number;
  goodPerformers: number;
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

interface ReportData {
  summary: ReportSummary;
  golfers: PostingHistoryReport[];
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getDateMonthsAgo(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().split('T')[0];
}

export default function GolferReportsPage() {
  const { data: session, status } = useSession() as { data: Session | null, status: string };
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Filters
  const [startDate, setStartDate] = useState(''); // Start with no date limit to get all data
  const [endDate, setEndDate] = useState(getToday());
  const [search, setSearch] = useState('');
  const [minRounds, setMinRounds] = useState('5');
  const [gender, setGender] = useState(''); // 'M', 'F', or '' for all
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (search) params.set('search', search);
      if (minRounds) params.set('minRounds', minRounds);
      if (gender) params.set('gender', gender);

      console.log('Fetching report with params:', {
        startDate: startDate || 'ALL TIME',
        endDate,
        search,
        minRounds,
        gender: gender || 'ALL'
      });

      const res = await fetch(`/api/admin/reports/posting-history?${params}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch report');
      }
      const data = await res.json();
      console.log('Report data received:', data);
      setReportData(data);
    } catch (error) {
      console.error('Error fetching report:', error);
      setError(error instanceof Error ? error.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, search, minRounds, gender]);

  useEffect(() => {
    if (session?.user?.isAdmin) {
      fetchReport();
    }
  }, [session?.user?.isAdmin, fetchReport]);

  async function exportToCsv() {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (search) params.set('search', search);
    if (minRounds) params.set('minRounds', minRounds);
    if (gender) params.set('gender', gender);
    params.set('format', 'csv');

    const url = `/api/admin/reports/posting-history?${params}`;
    
    // Create a temporary link and click it to download
    const link = document.createElement('a');
    link.href = url;
    link.download = 'posting-history-report.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function exportDetailedToCsv() {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (search) params.set('search', search);
    if (minRounds) params.set('minRounds', minRounds);
    if (gender) params.set('gender', gender);
    params.set('format', 'csv-detailed');

    const url = `/api/admin/reports/posting-history?${params}`;
    
    // Create a temporary link and click it to download
    const link = document.createElement('a');
    link.href = url;
    link.download = 'posting-history-detailed-report.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function toggleRowExpansion(golferId: string) {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(golferId)) {
      newExpanded.delete(golferId);
    } else {
      newExpanded.add(golferId);
    }
    setExpandedRows(newExpanded);
  }

  function getStatusBadge(status: string, excuse?: string) {
    switch (status) {
      case 'posted':
        return <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">Posted</span>;
      case 'unexcused_no_post':
        return <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-medium">No Post</span>;
      case 'excused_no_post':
        return <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-medium" title={excuse}>Excused</span>;
      default:
        return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-medium">{status}</span>;
    }
  }

  function getPostingPercentageColor(percentage: number) {
    if (percentage >= 90) return 'text-green-700 font-bold';
    if (percentage >= 80) return 'text-yellow-700 font-bold';
    if (percentage >= 70) return 'text-orange-700 font-bold';
    return 'text-red-700 font-bold';
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

  return (
    <div className="container mx-auto px-4 py-8 text-gray-900">
      <div className="mb-6">
        <Link href="/admin" className="inline-block bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold px-4 py-2 rounded transition">← Back to Admin</Link>
      </div>
      
      <h1 className="text-2xl font-bold mb-6">Golfer Reports</h1>

      {/* Filters */}
      <div className="mb-6 bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Posting History Report</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 w-full text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 w-full text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or member #"
              className="border border-gray-300 rounded px-3 py-2 w-full text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 w-full text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">All Golfers</option>
              <option value="M">Men Only</option>
              <option value="F">Women Only</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Rounds</label>
            <input
              type="number"
              value={minRounds}
              onChange={(e) => setMinRounds(e.target.value)}
              min="0"
              className="border border-gray-300 rounded px-3 py-2 w-full text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={fetchReport}
              disabled={loading}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50 w-full"
            >
              {loading ? 'Loading...' : 'Generate Report'}
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              setStartDate(getDateMonthsAgo(3));
              setEndDate(getToday());
            }}
            className="bg-gray-100 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-200"
          >
            Last 3 Months
          </button>
          <button
            onClick={() => {
              setStartDate(getDateMonthsAgo(6));
              setEndDate(getToday());
            }}
            className="bg-gray-100 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-200"
          >
            Last 6 Months
          </button>
          <button
            onClick={() => {
              setStartDate(getDateMonthsAgo(12));
              setEndDate(getToday());
            }}
            className="bg-gray-100 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-200"
          >
            Last 12 Months
          </button>
          <button
            onClick={() => {
              setStartDate(getDateMonthsAgo(24));
              setEndDate(getToday());
            }}
            className="bg-gray-100 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-200"
          >
            Last 24 Months
          </button>
          <button
            onClick={() => {
              setStartDate('');
              setEndDate(getToday());
            }}
            className="bg-gray-100 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-200"
          >
            All Time
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-100 border-red-400 text-red-800 border">
          <h3 className="font-semibold mb-2">❌ Error</h3>
          <p>{error}</p>
        </div>
      )}

      {reportData && (
        <>
          {/* Summary Statistics */}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Total Golfers</h3>
              <p className="text-2xl font-bold text-gray-900">{reportData.summary.totalGolfers}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Total Rounds</h3>
              <p className="text-2xl font-bold text-gray-900">{reportData.summary.totalRounds}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Overall Posting %</h3>
              <p className={`text-2xl font-bold ${getPostingPercentageColor(reportData.summary.overallPostingPercentage)}`}>
                {reportData.summary.overallPostingPercentage}%
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Poor Performers</h3>
              <p className="text-2xl font-bold text-red-600">{reportData.summary.poorPerformers}</p>
              <p className="text-xs text-gray-500">(&lt;80% with 5+ rounds)</p>
            </div>
          </div>

          {/* Export Button */}
          <div className="mb-4 flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Showing {reportData.golfers.length} golfers from {reportData.summary.dateRange.startDate} to {reportData.summary.dateRange.endDate}
            </p>
            <div className="flex gap-2">
              <button
                onClick={exportToCsv}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 text-sm font-medium"
              >
                📊 Export to CSV
              </button>
              <button
                onClick={exportDetailedToCsv}
                className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 text-sm font-medium"
              >
                📄 Export Detailed CSV
              </button>
            </div>
          </div>

          <div className="mb-4 text-xs text-gray-500">
            <p>• <strong>Export to CSV:</strong> Summary report with posting percentages and totals</p>
            <p>• <strong>Export Detailed CSV:</strong> First Name, Last Name, Member #, Posting %, then all unexcused no post dates in separate columns</p>
          </div>

          {/* Report Table */}
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <div className="min-w-full">
              <table className="w-full">
                <thead className="bg-gray-200">
                  <tr>
                    <th className="border px-4 py-2 text-left whitespace-nowrap">Name</th>
                    <th className="border px-4 py-2 text-left whitespace-nowrap">Member #</th>
                    <th className="border px-4 py-2 text-center whitespace-nowrap">Total Rounds</th>
                    <th className="border px-4 py-2 text-center whitespace-nowrap">Posted</th>
                    <th className="border px-4 py-2 text-center whitespace-nowrap">No Post</th>
                    <th className="border px-4 py-2 text-center whitespace-nowrap">Posting %</th>
                    <th className="border px-4 py-2 text-left whitespace-nowrap">Last Round</th>
                    <th className="border px-4 py-2 text-center whitespace-nowrap">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.golfers.map(golfer => (
                    <React.Fragment key={golfer.golfer_id}>
                      <tr className="hover:bg-gray-50">
                        <td className="border px-4 py-2 font-medium">{golfer.golfer_name}</td>
                        <td className="border px-4 py-2">{golfer.member_number || '-'}</td>
                        <td className="border px-4 py-2 text-center">{golfer.total_rounds}</td>
                        <td className="border px-4 py-2 text-center text-green-700 font-medium">{golfer.posted_rounds}</td>
                        <td className="border px-4 py-2 text-center text-red-700 font-medium">{golfer.unexcused_no_post}</td>
                        <td className={`border px-4 py-2 text-center ${getPostingPercentageColor(golfer.posting_percentage)}`}>
                          {golfer.posting_percentage}%
                        </td>
                        <td className="border px-4 py-2 whitespace-nowrap">
                          {golfer.last_round_date ? new Date(golfer.last_round_date).toLocaleDateString() : '-'}
                        </td>
                        <td className="border px-4 py-2 text-center">
                          <button
                            onClick={() => toggleRowExpansion(golfer.golfer_id)}
                            className="text-blue-500 hover:text-blue-700 text-sm"
                          >
                            {expandedRows.has(golfer.golfer_id) ? '▼ Hide' : '▶ Show'}
                          </button>
                        </td>
                      </tr>
                      {expandedRows.has(golfer.golfer_id) && (
                        <tr>
                          <td colSpan={8} className="border px-4 py-2 bg-gray-50">
                            <div className="py-2">
                              <h4 className="font-medium mb-2">Recent Activity (Last 5 Rounds)</h4>
                              {golfer.recent_activity.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                                  {golfer.recent_activity.map((activity, index) => (
                                    <div key={index} className="bg-white p-2 rounded border text-sm">
                                      <div className="font-medium">{new Date(activity.date).toLocaleDateString()}</div>
                                      <div className="text-gray-600">{activity.tee_time}</div>
                                      <div className="mt-1">{getStatusBadge(activity.posting_status, activity.excuse_reason)}</div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-gray-500 text-sm">No recent activity</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              
              {reportData.golfers.length === 0 && !loading && (
                <div className="text-center py-8 text-gray-500">
                  No golfers found matching your criteria
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 text-sm text-gray-600">
            <p>• Report shows golfers sorted by posting percentage (worst performers first)</p>
            <p>• Posting percentage excludes excused rounds (solo play, etc.)</p>
            <p>• Only includes golfers with GHIN numbers (required for posting)</p>
            <p>• Poor performers: &lt;80% posting rate with 5+ rounds</p>
            <p>• Good performers: ≥90% posting rate with 5+ rounds</p>
            <p>• Click &ldquo;Show&rdquo; to see recent round activity for each golfer</p>
          </div>
        </>
      )}
    </div>
  );
} 