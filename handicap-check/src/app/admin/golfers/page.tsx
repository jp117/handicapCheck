'use client'

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link'
import type { Session } from 'next-auth';

interface Golfer {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  email: string | null;
  gender: 'M' | 'F' | null;
  member_number: string | null;
  ghin_number: string | null;
  created_at: string;
  updated_at: string;
}

interface GolferFormData {
  first_name: string;
  middle_name: string;
  last_name: string;
  suffix: string;
  email: string;
  gender: string;
  member_number: string;
  ghin_number: string;
}

const emptyFormData: GolferFormData = {
  first_name: '',
  middle_name: '',
  last_name: '',
  suffix: '',
  email: '',
  gender: '',
  member_number: '',
  ghin_number: ''
}

export default function GolfersAdminPage() {
  const { data: session, status } = useSession() as { data: Session | null, status: string };
  const [golfers, setGolfers] = useState<Golfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGolfer, setEditingGolfer] = useState<Golfer | null>(null);
  const [formData, setFormData] = useState<GolferFormData>(emptyFormData);
  const [submitting, setSubmitting] = useState(false);
  const [showingDuplicates, setShowingDuplicates] = useState<'ghin' | 'member' | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  const fetchGolfers = useCallback(async () => {
    setLoading(true);
    setError('');
    setShowingDuplicates(null);
    try {
      const url = new URL('/api/admin/golfers', window.location.origin);
      if (searchTerm) {
        url.searchParams.set('search', searchTerm);
      }
      
      const res = await fetch(url);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch golfers');
      }
      const data = await res.json();
      setGolfers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching golfers:', error);
      setError(error instanceof Error ? error.message : 'Failed to load golfers');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    if (session?.user?.isAdmin && !hasInitialized) {
      setHasInitialized(true);
      fetchGolfers();
    }
  }, [session?.user?.isAdmin, hasInitialized, fetchGolfers]);

  async function findDuplicateGhin() {
    setLoading(true);
    setError('');
    setSearchTerm('');
    try {
      const url = new URL('/api/admin/golfers', window.location.origin);
      url.searchParams.set('duplicateGhin', 'true');
      
      const res = await fetch(url);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch duplicate GHIN numbers');
      }
      const data = await res.json();
      setGolfers(Array.isArray(data) ? data : []);
      setShowingDuplicates('ghin');
    } catch (error) {
      console.error('Error finding duplicate GHIN numbers:', error);
      setError(error instanceof Error ? error.message : 'Failed to find duplicates');
    } finally {
      setLoading(false);
    }
  }

  async function findDuplicateMember() {
    setLoading(true);
    setError('');
    setSearchTerm('');
    try {
      const url = new URL('/api/admin/golfers', window.location.origin);
      url.searchParams.set('duplicateMember', 'true');
      
      const res = await fetch(url);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch duplicate member numbers');
      }
      const data = await res.json();
      setGolfers(Array.isArray(data) ? data : []);
      setShowingDuplicates('member');
    } catch (error) {
      console.error('Error finding duplicate member numbers:', error);
      setError(error instanceof Error ? error.message : 'Failed to find duplicates');
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    await fetchGolfers();
  }

  function clearFilters() {
    setSearchTerm('');
    setShowingDuplicates(null);
    fetchGolfers();
  }

  function openAddForm() {
    setEditingGolfer(null);
    setFormData(emptyFormData);
    setIsFormOpen(true);
  }

  function openEditForm(golfer: Golfer) {
    setEditingGolfer(golfer);
    setFormData({
      first_name: golfer.first_name,
      middle_name: golfer.middle_name || '',
      last_name: golfer.last_name,
      suffix: golfer.suffix || '',
      email: golfer.email || '',
      gender: golfer.gender || '',
      member_number: golfer.member_number || '',
      ghin_number: golfer.ghin_number || ''
    });
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingGolfer(null);
    setFormData(emptyFormData);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const url = '/api/admin/golfers';
      const method = editingGolfer ? 'PUT' : 'POST';
      const body = editingGolfer 
        ? { id: editingGolfer.id, ...formData }
        : formData;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed to ${editingGolfer ? 'update' : 'create'} golfer`);
      }

      closeForm();
      await fetchGolfers();
    } catch (error) {
      console.error('Error submitting form:', error);
      setError(error instanceof Error ? error.message : `Failed to ${editingGolfer ? 'update' : 'create'} golfer`);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteGolfer(golfer: Golfer) {
    const name = `${golfer.first_name} ${golfer.last_name}`;
    if (!confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) {
      return;
    }

    setError('');
    try {
      const res = await fetch('/api/admin/golfers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: golfer.id })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete golfer');
      }

      await fetchGolfers();
    } catch (error) {
      console.error('Error deleting golfer:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete golfer');
    }
  }

  function formatName(golfer: Golfer) {
    const nameParts = [
      golfer.first_name,
      golfer.middle_name,
      golfer.last_name
    ].filter(Boolean);
    
    return nameParts.join(' ') + (golfer.suffix ? ` ${golfer.suffix}` : '');
  }

  // Helper function to get duplicate values for highlighting
  function getDuplicateValues() {
    if (!showingDuplicates) return { ghin: new Set(), member: new Set() };
    
    const duplicateValues = golfers.reduce((acc, golfer) => {
      if (showingDuplicates === 'ghin' && golfer.ghin_number) {
        const ghin = golfer.ghin_number.toString().trim();
        acc.ghin.add(ghin);
      }
      if (showingDuplicates === 'member' && golfer.member_number) {
        const member = golfer.member_number.toString().trim();
        acc.member.add(member);
      }
      return acc;
    }, { ghin: new Set<string>(), member: new Set<string>() });

    return duplicateValues;
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
      
      <h1 className="text-2xl font-bold mb-6">Golfer Management</h1>
      
      {/* Search and Add Controls */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search golfers..."
            className="border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            disabled={showingDuplicates !== null}
          />
          <button
            onClick={handleSearch}
            disabled={loading || showingDuplicates !== null}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            Search
          </button>
          <button
            onClick={findDuplicateGhin}
            disabled={loading}
            className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600 disabled:opacity-50"
          >
            🔍 Duplicate GHIN
          </button>
          <button
            onClick={findDuplicateMember}
            disabled={loading}
            className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 disabled:opacity-50"
          >
            🔍 Duplicate Member #
          </button>
          {(searchTerm || showingDuplicates) && (
            <button
              onClick={clearFilters}
              className="bg-gray-500 text-white px-3 py-2 rounded hover:bg-gray-600"
            >
              Clear
            </button>
          )}
        </div>
        
        <button
          onClick={openAddForm}
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 font-medium"
        >
          ➕ Add Golfer
        </button>
      </div>

      {/* Show what type of results are being displayed */}
      {showingDuplicates && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <h3 className="font-semibold text-yellow-800">
            {showingDuplicates === 'ghin' ? '🔍 Showing Duplicate GHIN Numbers' : '🔍 Showing Duplicate Member Numbers'}
          </h3>
          <p className="text-sm text-yellow-700">
            {golfers.length === 0 
              ? `No duplicate ${showingDuplicates === 'ghin' ? 'GHIN numbers' : 'member numbers'} found.`
              : `Found ${golfers.length} golfers with duplicate ${showingDuplicates === 'ghin' ? 'GHIN numbers' : 'member numbers'}.`
            }
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded bg-red-100 border-red-400 text-red-800 border">
          <h3 className="font-semibold mb-2">❌ Error</h3>
          <p>{error}</p>
        </div>
      )}

      {/* Golfers Table */}
      {loading ? (
        <div className="text-center py-8">Loading golfers...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <div className="min-w-full">
            <table className="w-full">
              <thead className="bg-gray-200">
                <tr>
                  <th className="border px-4 py-2 text-left whitespace-nowrap">Name</th>
                  <th className="border px-4 py-2 text-left whitespace-nowrap">Email</th>
                  <th className="border px-4 py-2 text-center whitespace-nowrap">Gender</th>
                  <th className="border px-4 py-2 text-left whitespace-nowrap">Member #</th>
                  <th className="border px-4 py-2 text-left whitespace-nowrap">GHIN #</th>
                  <th className="border px-4 py-2 text-center whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {golfers.map(golfer => {
                  const duplicateValues = getDuplicateValues();
                  const hasGhinDuplicate = showingDuplicates === 'ghin' && golfer.ghin_number && duplicateValues.ghin.has(golfer.ghin_number.toString().trim());
                  const hasMemberDuplicate = showingDuplicates === 'member' && golfer.member_number && duplicateValues.member.has(golfer.member_number.toString().trim());
                  const isHighlighted = hasGhinDuplicate || hasMemberDuplicate;
                  
                  return (
                    <tr key={golfer.id} className={`hover:bg-gray-50 ${isHighlighted ? 'bg-red-50' : ''}`}>
                      <td className="border px-4 py-2 font-medium">{formatName(golfer)}</td>
                      <td className="border px-4 py-2">{golfer.email || '-'}</td>
                      <td className="border px-4 py-2 text-center">{golfer.gender || '-'}</td>
                      <td className={`border px-4 py-2 ${hasMemberDuplicate ? 'bg-red-200 font-bold' : ''}`}>
                        {golfer.member_number || '-'}
                      </td>
                      <td className={`border px-4 py-2 ${hasGhinDuplicate ? 'bg-red-200 font-bold' : ''}`}>
                        {golfer.ghin_number || '-'}
                      </td>
                      <td className="border px-4 py-2 text-center">
                        <div className="flex gap-2 justify-center whitespace-nowrap">
                          <button
                            onClick={() => openEditForm(golfer)}
                            className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteGolfer(golfer)}
                            className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {golfers.length === 0 && !loading && (
            <div className="text-center py-8 text-gray-500">
              {searchTerm ? 'No golfers found matching your search' : 'No golfers found'}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {editingGolfer ? 'Edit Golfer' : 'Add New Golfer'}
              </h3>
              <button
                onClick={closeForm}
                className="text-gray-400 hover:text-gray-500"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">First Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Middle Name</label>
                  <input
                    type="text"
                    value={formData.middle_name}
                    onChange={(e) => setFormData({...formData, middle_name: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Suffix</label>
                  <input
                    type="text"
                    value={formData.suffix}
                    onChange={(e) => setFormData({...formData, suffix: e.target.value})}
                    placeholder="Jr, Sr, III, etc."
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Gender</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({...formData, gender: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                >
                  <option value="">Select Gender</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Member Number</label>
                  <input
                    type="text"
                    value={formData.member_number}
                    onChange={(e) => setFormData({...formData, member_number: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">GHIN Number</label>
                  <input
                    type="text"
                    value={formData.ghin_number}
                    onChange={(e) => setFormData({...formData, ghin_number: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : (editingGolfer ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="mt-6 text-sm text-gray-600">
        <p>• Search by name, email, or member number</p>
        <p>• Use &quot;Duplicate GHIN&quot; to find golfers with the same GHIN number</p>
        <p>• Use &quot;Duplicate Member #&quot; to find golfers with the same member number</p>
        <p>• Duplicate values are highlighted in red when viewing duplicates</p>
        <p>• Showing up to 100 results</p>
        <p>• First name and last name are required fields</p>
      </div>
    </div>
  );
} 