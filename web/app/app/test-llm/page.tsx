'use client';

import React, { useState, useEffect } from 'react';

export default function TestLLMPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('Fetching from: /api/llm/keys/statistics');
        const response = await fetch('/api/llm/keys/statistics');
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('Response data:', result);
        setData(result);
      } catch (err) {
        console.error('Fetch error:', err);
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">LLM API Test</h1>
        
        {loading && (
          <div className="bg-slate-800 rounded-lg p-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-white text-center mt-4">Loading...</p>
          </div>
        )}
        
        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6">
            <h2 className="text-xl font-bold text-red-400 mb-4">Error</h2>
            <p className="text-red-300">{error}</p>
          </div>
        )}
        
        {data && (
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-xl font-bold text-green-400 mb-4">✅ Success!</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-700 rounded p-4">
                <h3 className="text-white font-semibold">Total Cost</h3>
                <p className="text-green-400 text-2xl">${data.totalCost?.toFixed(4) || '0'}</p>
              </div>
              <div className="bg-slate-700 rounded p-4">
                <h3 className="text-white font-semibold">Daily Cost</h3>
                <p className="text-blue-400 text-2xl">${data.dailyCost?.toFixed(4) || '0'}</p>
              </div>
              <div className="bg-slate-700 rounded p-4">
                <h3 className="text-white font-semibold">Total Requests</h3>
                <p className="text-yellow-400 text-2xl">{data.totalRequests || 0}</p>
              </div>
              <div className="bg-slate-700 rounded p-4">
                <h3 className="text-white font-semibold">Active Keys</h3>
                <p className="text-purple-400 text-2xl">{data.activeKeys || 0}</p>
              </div>
            </div>
            
            <div className="mt-6">
              <h3 className="text-white font-semibold mb-2">Raw Data:</h3>
              <pre className="bg-slate-900 rounded p-4 text-sm text-slate-300 overflow-auto">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          </div>
        )}
        
        <div className="mt-8">
          <a 
            href="/llm-settings" 
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors"
          >
            Go to LLM Settings
          </a>
        </div>
      </div>
    </div>
  );
}
