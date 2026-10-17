'use client';

import { useState } from 'react';
import { apiClient } from '../api/client';

export default function TestConnection() {
  const [status, setStatus] = useState<string>('Ready to test');
  const [results, setResults] = useState<any>(null);

  const testHealth = async () => {
    setStatus('Testing health endpoint...');
    try {
      const health = await apiClient.health();
      setResults({ type: 'health', data: health });
      setStatus('Health test successful!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setResults({ type: 'health', error: errorMessage });
      setStatus('Health test failed!');
    }
  };

  const testWorkspaces = async () => {
    setStatus('Testing workspaces endpoint...');
    try {
      const workspaces = await apiClient.listWorkspaces();
      setResults({ type: 'workspaces', data: workspaces });
      setStatus('Workspaces test successful!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setResults({ type: 'workspaces', error: errorMessage });
      setStatus('Workspaces test failed!');
    }
  };

  const testGitClone = async () => {
    try {
      const result = await apiClient.cloneGitRepository('https://github.com/test/repo.git');
      setResults({ type: 'git-clone', data: result });
      setStatus('Git clone test successful!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setResults({ type: 'git-clone', error: errorMessage });
      setStatus('Git clone test failed!');
    }
  };

  const testAssessment = async () => {
    try {
      // First create a test workspace
      const workspace = await apiClient.uploadProject(new File([''], 'test.zip'));
      const result = await apiClient.assessProject(workspace.id);
      setResults({ type: 'assessment', data: result });
      setStatus('Assessment test successful!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setResults({ type: 'assessment', error: errorMessage });
      setStatus('Assessment test failed!');
    }
  };

  return (
    <div className="min-h-screen bg-surface-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">API Connection Test</h1>
        
        <div className="mb-6">
          <p className="text-lg mb-4">Status: <span className="font-mono">{status}</span></p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <button
            onClick={testHealth}
            className="btn-primary p-4 text-center"
          >
            Test Health Endpoint
          </button>
          
          <button
            onClick={testWorkspaces}
            className="btn-primary p-4 text-center"
          >
            Test Workspaces List
          </button>
          
          <button
            onClick={testGitClone}
            className="btn-primary p-4 text-center"
          >
            Test Git Clone
          </button>
          
          <button
            onClick={testAssessment}
            className="btn-primary p-4 text-center"
          >
            Test Assessment
          </button>
        </div>

        {results && (
          <div className="bg-surface-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Test Results</h2>
            <div className="bg-surface-700 rounded p-4">
              <pre className="text-sm overflow-auto">
                {JSON.stringify(results, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
