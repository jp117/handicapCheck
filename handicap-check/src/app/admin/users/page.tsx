'use client'

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link'
import type { Session } from 'next-auth';

interface User {
  id: string;
  email: string;
  name: string | null;
  is_admin: boolean;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
}

export default function UsersAdminPage() {
  const { data: session, status } = useSession() as { data: Session | null, status: string };
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (session?.user?.isAdmin && !hasInitialized) {
      setHasInitialized(true);
      fetchUsers();
    }
  }, [session?.user?.isAdmin, hasInitialized]);

  async function fetchUsers() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch users');
      }
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching users:', error);
      setError(error instanceof Error ? error.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  async function updateUser(id: string, updates: { is_admin?: boolean; is_approved?: boolean }) {
    setUpdatingUser(id);
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update user');
      }
      
      await fetchUsers(); // Refresh the list
    } catch (error) {
      console.error('Error updating user:', error);
      setError(error instanceof Error ? error.message : 'Failed to update user');
    } finally {
      setUpdatingUser(null);
    }
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(`Are you sure you want to delete user ${email}? This action cannot be undone.`)) {
      return;
    }

    setUpdatingUser(id);
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete user');
      }
      
      await fetchUsers(); // Refresh the list
    } catch (error) {
      console.error('Error deleting user:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete user');
    } finally {
      setUpdatingUser(null);
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

  return (
    <div className="container mx-auto px-4 py-8 text-gray-900">
      <div className="mb-6">
        <Link href="/admin" className="inline-block bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold px-4 py-2 rounded transition">← Back to Admin</Link>
      </div>
      
      <h1 className="text-2xl font-bold mb-6">User Management</h1>
      
      <div className="mb-4 flex justify-between items-center">
        <p className="text-gray-600">Manage user permissions and access</p>
        <button
          onClick={fetchUsers}
          disabled={loading}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-100 border-red-400 text-red-800 border">
          <h3 className="font-semibold mb-2">❌ Error</h3>
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">Loading users...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-200">
              <tr>
                <th className="border px-4 py-2 text-left">Email</th>
                <th className="border px-4 py-2 text-left">Name</th>
                <th className="border px-4 py-2 text-center">Admin</th>
                <th className="border px-4 py-2 text-center">Approved</th>
                <th className="border px-4 py-2 text-left">Created</th>
                <th className="border px-4 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="border px-4 py-2">{user.email}</td>
                  <td className="border px-4 py-2">{user.name || '-'}</td>
                  <td className="border px-4 py-2 text-center">
                    <button
                      onClick={() => updateUser(user.id, { is_admin: !user.is_admin })}
                      disabled={updatingUser === user.id}
                      className={`px-3 py-1 rounded text-sm font-medium ${
                        user.is_admin 
                          ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                          : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                      } disabled:opacity-50`}
                    >
                      {user.is_admin ? 'Yes' : 'No'}
                    </button>
                  </td>
                  <td className="border px-4 py-2 text-center">
                    <button
                      onClick={() => updateUser(user.id, { is_approved: !user.is_approved })}
                      disabled={updatingUser === user.id}
                      className={`px-3 py-1 rounded text-sm font-medium ${
                        user.is_approved 
                          ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                          : 'bg-red-100 text-red-800 hover:bg-red-200'
                      } disabled:opacity-50`}
                    >
                      {user.is_approved ? 'Yes' : 'No'}
                    </button>
                  </td>
                  <td className="border px-4 py-2">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="border px-4 py-2 text-center">
                    <button
                      onClick={() => deleteUser(user.id, user.email)}
                      disabled={updatingUser === user.id || user.email === session?.user?.email}
                      className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 disabled:opacity-50"
                      title={user.email === session?.user?.email ? "Cannot delete your own account" : "Delete user"}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {users.length === 0 && !loading && (
            <div className="text-center py-8 text-gray-500">
              No users found
            </div>
          )}
        </div>
      )}

      <div className="mt-6 text-sm text-gray-600">
        <h3 className="font-medium mb-2">Legend:</h3>
        <ul className="space-y-1">
          <li>• <strong>Admin:</strong> Can access admin pages and manage system settings</li>
          <li>• <strong>Approved:</strong> Can access the application (non-approved users see pending message)</li>
          <li>• Click the status buttons to toggle permissions</li>
          <li>• You cannot delete your own account</li>
        </ul>
      </div>
    </div>
  );
} 