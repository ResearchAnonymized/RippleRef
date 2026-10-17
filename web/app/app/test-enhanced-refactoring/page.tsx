'use client';

import React, { useState } from 'react';
import {
  Brain,
  Network,
  Code,
  FileText,
  Target,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  Info,
  Play,
  ArrowRight,
  Download,
  Copy,
  Eye,
  RefreshCw
} from 'lucide-react';

export default function TestEnhancedRefactoringPage() {
  const [testResults, setTestResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTest, setCurrentTest] = useState<string>('');

  const runTest = async (testName: string, testFunction: () => Promise<any>) => {
    setCurrentTest(testName);
    setIsLoading(true);
    
    try {
      console.log(`🧪 Running test: ${testName}`);
      const result = await testFunction();
      console.log(`✅ Test ${testName} completed:`, result);
      
      setTestResults((prev: any) => ({
        ...prev,
        [testName]: { success: true, result }
      }));
    } catch (error) {
      console.error(`❌ Test ${testName} failed:`, error);
      setTestResults((prev: any) => ({
        ...prev,
        [testName]: { success: false, error: (error as Error).message }
      }));
    } finally {
      setIsLoading(false);
      setCurrentTest('');
    }
  };

  const testBackendHealth = async () => {
    const response = await fetch('http://localhost:8081/api/health');
    if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
    return await response.json();
  };

  const testLLMRefactoring = async () => {
    const response = await fetch('http://localhost:8081/api/llm/refactoring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Refactor this method to be more maintainable' }],
        model: 'openai/gpt-4',
        maxTokens: 100
      })
    });
    
    if (!response.ok) throw new Error(`LLM API failed: ${response.status}`);
    return await response.json();
  };

  const testLLMKeys = async () => {
    const response = await fetch('http://localhost:8081/api/llm/keys');
    if (!response.ok) throw new Error(`LLM Keys API failed: ${response.status}`);
    return await response.json();
  };

  const testEnhancedAnalysis = async () => {
    const response = await fetch('http://localhost:8081/api/workspace-enhanced-analysis/analyze-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: 'junit4-main/src/main/java/org/junit/Assert.java'
      })
    });
    
    if (!response.ok) throw new Error(`Enhanced Analysis API failed: ${response.status}`);
    return await response.json();
  };

  const testRefactoringPlan = async () => {
    const response = await fetch('http://localhost:8081/api/workspace-enhanced-analysis/generate-refactoring-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: 'junit4-main/src/main/java/org/junit/Assert.java',
        codeSmells: [
          { type: 'Long Method', severity: 'high', description: 'Method is too long' }
        ]
      })
    });
    
    if (!response.ok) throw new Error(`Refactoring Plan API failed: ${response.status}`);
    return await response.json();
  };

  const testDependencyAnalysis = async () => {
    const response = await fetch('http://localhost:8081/api/workspace-enhanced-analysis/analyze-dependencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: 'junit4-main/src/main/java/org/junit/Assert.java'
      })
    });
    
    if (!response.ok) throw new Error(`Dependency Analysis API failed: ${response.status}`);
    return await response.json();
  };

  const runAllTests = async () => {
    const tests = [
      { name: 'Backend Health', test: testBackendHealth },
      { name: 'LLM Refactoring', test: testLLMRefactoring },
      { name: 'LLM Keys', test: testLLMKeys },
      { name: 'Enhanced Analysis', test: testEnhancedAnalysis },
      { name: 'Refactoring Plan', test: testRefactoringPlan },
      { name: 'Dependency Analysis', test: testDependencyAnalysis }
    ];

    for (const { name, test } of tests) {
      await runTest(name, test);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between tests
    }
  };

  const getTestIcon = (testName: string) => {
    const result = testResults?.[testName];
    if (!result) return <div className="w-4 h-4 rounded-full bg-gray-500"></div>;
    if (result.success) return <CheckCircle className="w-4 h-4 text-green-400" />;
    return <AlertTriangle className="w-4 h-4 text-red-400" />;
  };

  const getTestColor = (testName: string) => {
    const result = testResults?.[testName];
    if (!result) return 'text-gray-400';
    if (result.success) return 'text-green-400';
    return 'text-red-400';
  };

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-4 flex items-center">
            <Brain className="w-8 h-8 mr-3 text-blue-400" />
            Enhanced Refactoring System Test
          </h1>
          <p className="text-slate-400">
            Test the enhanced refactoring system components and API endpoints
          </p>
        </div>

        {/* Test Controls */}
        <div className="bg-slate-800 rounded-lg p-6 mb-8 border border-slate-700">
          <h2 className="text-xl font-semibold text-white mb-4">Test Controls</h2>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => runTest('Backend Health', testBackendHealth)}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors flex items-center"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Test Backend Health
            </button>
            <button
              onClick={() => runTest('LLM Refactoring', testLLMRefactoring)}
              disabled={isLoading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors flex items-center"
            >
              <Brain className="w-4 h-4 mr-2" />
              Test LLM Refactoring
            </button>
            <button
              onClick={() => runTest('LLM Keys', testLLMKeys)}
              disabled={isLoading}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg transition-colors flex items-center"
            >
              <Target className="w-4 h-4 mr-2" />
              Test LLM Keys
            </button>
            <button
              onClick={() => runTest('Enhanced Analysis', testEnhancedAnalysis)}
              disabled={isLoading}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 text-white rounded-lg transition-colors flex items-center"
            >
              <FileText className="w-4 h-4 mr-2" />
              Test Enhanced Analysis
            </button>
            <button
              onClick={() => runTest('Refactoring Plan', testRefactoringPlan)}
              disabled={isLoading}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white rounded-lg transition-colors flex items-center"
            >
              <Code className="w-4 h-4 mr-2" />
              Test Refactoring Plan
            </button>
            <button
              onClick={() => runTest('Dependency Analysis', testDependencyAnalysis)}
              disabled={isLoading}
              className="px-4 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-pink-400 text-white rounded-lg transition-colors flex items-center"
            >
              <Network className="w-4 h-4 mr-2" />
              Test Dependencies
            </button>
            <button
              onClick={runAllTests}
              disabled={isLoading}
              className="px-6 py-2 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-400 text-white rounded-lg transition-colors flex items-center"
            >
              <Play className="w-4 h-4 mr-2" />
              Run All Tests
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="bg-slate-800 rounded-lg p-6 mb-8 border border-slate-700">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <span className="text-white">Running test: {currentTest}</span>
            </div>
          </div>
        )}

        {/* Test Results */}
        {testResults && (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold text-white">Test Results</h2>
            
            {Object.entries(testResults).map(([testName, result]: [string, any]) => (
              <div key={testName} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    {getTestIcon(testName)}
                    <h3 className={`text-lg font-semibold ${getTestColor(testName)}`}>
                      {testName}
                    </h3>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                    result.success 
                      ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                      : 'bg-red-500/20 text-red-400 border border-red-500/50'
                  }`}>
                    {result.success ? 'PASSED' : 'FAILED'}
                  </div>
                </div>
                
                {result.success ? (
                  <div className="space-y-2">
                    <div className="text-sm text-slate-400">Result:</div>
                    <pre className="bg-slate-900 rounded p-3 text-sm text-slate-300 overflow-auto max-h-40">
                      {JSON.stringify(result.result, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm text-slate-400">Error:</div>
                    <div className="bg-red-900/20 border border-red-500/50 rounded p-3 text-red-300">
                      {result.error}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <div className="mt-8 bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
          <div className="flex space-x-4">
            <a
              href="/enhanced-refactoring?workspace=test-workspace&file=UserService.java"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center"
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              Open Enhanced Refactoring
            </a>
            <a
              href="/llm-settings"
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center"
            >
              <Target className="w-4 h-4 mr-2" />
              Open LLM Settings
            </a>
            <button
              onClick={() => {
                setTestResults(null);
                setIsLoading(false);
                setCurrentTest('');
              }}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Clear Results
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
