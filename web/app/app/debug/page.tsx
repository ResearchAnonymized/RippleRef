'use client';

import { useState, useEffect } from 'react';

export default function DebugPage() {
  const [result, setResult] = useState<string>('Testing...');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const testAPI = async () => {
      try {
        console.log('Testing API call...');
        const response = await fetch('/api/workspaces');
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Response data:', data);
        setResult(JSON.stringify(data, null, 2));
      } catch (err) {
        console.error('API test failed:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    testAPI();
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">API Debug Page</h1>
        
        <div className="bg-slate-800 p-6 rounded-lg mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">API Test Result:</h2>
          <pre className="text-green-400 text-sm overflow-auto">
            {result}
          </pre>
        </div>
        
        {error && (
          <div className="bg-red-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold text-white mb-4">Error:</h2>
            <pre className="text-red-400 text-sm">
              {error}
            </pre>
          </div>
        )}
        
        <div className="bg-slate-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold text-white mb-4">Instructions:</h2>
          <ol className="text-slate-300 space-y-2">
            <li>1. Open browser developer tools (F12)</li>
            <li>2. Go to Console tab</li>
            <li>3. Refresh this page</li>
            <li>4. Check for any error messages</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

