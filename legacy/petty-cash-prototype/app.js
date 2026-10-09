'use client';

import { useState } from 'react';

export default function Home() {
  const [user, setUser] = useState(null);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  // Simple test users
  const testUsers = {
    '971501234567': { name: 'Nawaz', password: 'pass123', role: 'individual' },
    '971501234568': { name: 'Kunal', password: 'pass123', role: 'ops_manager,individual' },
    '971501234569': { name: 'Inaye', password: 'pass123', role: 'owner' },
    '971501234570': { name: 'Daniel', password: 'pass123', role: 'individual' },
    '971501234571': { name: 'Philip', password: 'pass123', role: 'individual' },
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const testUser = testUsers[phone];
    
    if (testUser && testUser.password === password) {
      setUser({ phone, ...testUser });
    } else {
      alert('Wrong phone or password');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50">
        <div className="bg-white p-8 rounded-lg shadow-lg w-96">
          <h1 className="text-3xl font-bold mb-6 text-center text-blue-600">
            Petty Cash Agent
          </h1>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="text"
              placeholder="Phone (e.g., 971501234567)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded"
              required
            />
            
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded"
              required
            />
            
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
            >
              Log In
            </button>
          </form>

          <div className="mt-6 text-sm text-gray-600 bg-gray-50 p-4 rounded">
            <p className="font-bold mb-2">Test accounts:</p>
            <p>Nawaz: 971501234567 / pass123</p>
            <p>Kunal: 971501234568 / pass123</p>
            <p>Inaye: 971501234569 / pass123</p>
          </div>
        </div>
      </div>
    );
  }

  // After login, show dashboard
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Welcome, {user.name}</h1>
            <button
              onClick={() => setUser(null)}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Logout
            </button>
          </div>

          <p className="text-gray-600 mb-4">Role: <span className="font-bold">{user.role}</span></p>

          {user.role.includes('owner') && (
            <div className="bg-blue-50 p-4 rounded border border-blue-200">
              <h2 className="text-xl font-bold mb-4">Release Funds (Owner Only)</h2>
              <p className="text-gray-600">Feature coming next...</p>
            </div>
          )}

          {user.role.includes('individual') && (
            <div className="bg-green-50 p-4 rounded border border-green-200">
              <h2 className="text-xl font-bold mb-4">Submit Invoice (Individual)</h2>
              <p className="text-gray-600">Feature coming next...</p>
            </div>
          )}

          {user.role.includes('ops_manager') && (
            <div className="bg-purple-50 p-4 rounded border border-purple-200">
              <h2 className="text-xl font-bold mb-4">Approve Invoices (Ops Manager)</h2>
              <p className="text-gray-600">Feature coming next...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}