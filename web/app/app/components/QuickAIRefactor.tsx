'use client';

import React, { useState } from 'react';
import { Brain, Wand2, Code, Zap, Eye, ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react';

interface QuickAIRefactorProps {
  selectedFile: string;
  fileContent: string;
  codeSmells: any[];
  onRefactor: (type: string) => void;
  onBack: () => void;
}

export default function QuickAIRefactor({ 
  selectedFile, 
  fileContent, 
  codeSmells, 
  onRefactor, 
  onBack 
}: QuickAIRefactorProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const refactoringOptions = [
    {
      id: 'fix-smells',
      name: 'Fix Code Smells',
      description: 'Automatically fix detected code smells',
      icon: <Wand2 className="w-5 h-5" />,
      color: 'bg-green-600 hover:bg-green-700',
      count: codeSmells.length
    },
    {
      id: 'extract-methods',
      name: 'Extract Methods',
      description: 'Break down large methods into smaller ones',
      icon: <Code className="w-5 h-5" />,
      color: 'bg-blue-600 hover:bg-blue-700',
      count: codeSmells.filter(s => s.type?.includes('LONG_METHOD')).length
    },
    {
      id: 'optimize',
      name: 'Optimize Performance',
      description: 'Improve code performance and efficiency',
      icon: <Zap className="w-5 h-5" />,
      color: 'bg-purple-600 hover:bg-purple-700',
      count: codeSmells.filter(s => s.type?.includes('PERFORMANCE')).length
    },
    {
      id: 'readability',
      name: 'Improve Readability',
      description: 'Make code more readable and maintainable',
      icon: <Eye className="w-5 h-5" />,
      color: 'bg-orange-600 hover:bg-orange-700',
      count: codeSmells.filter(s => s.severity === 'MAJOR').length
    }
  ];

  const handleRefactor = async (type: string) => {
    setSelectedType(type);
    setIsProcessing(true);
    
    // Simulate AI processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsProcessing(false);
    onRefactor(type);
  };

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center">
            <Brain className="w-5 h-5 mr-2" />
            Quick AI Refactoring
          </h2>
          <p className="text-slate-400">
            File: <span className="text-blue-400 font-mono">{selectedFile}</span>
          </p>
        </div>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </button>
      </div>

      {/* File Analysis Summary */}
      <div className="bg-slate-700 rounded-lg p-4 mb-6">
        <h3 className="text-lg font-semibold text-white mb-3">Analysis Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">
              {codeSmells.filter(s => s.severity === 'CRITICAL').length}
            </div>
            <div className="text-sm text-slate-400">Critical</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-400">
              {codeSmells.filter(s => s.severity === 'MAJOR').length}
            </div>
            <div className="text-sm text-slate-400">Major</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400">
              {codeSmells.filter(s => s.severity === 'MINOR').length}
            </div>
            <div className="text-sm text-slate-400">Minor</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">
              {fileContent.split('\n').length}
            </div>
            <div className="text-sm text-slate-400">Lines</div>
          </div>
        </div>
      </div>

      {/* Refactoring Options */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Choose Refactoring Type</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {refactoringOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => handleRefactor(option.id)}
              disabled={isProcessing || option.count === 0}
              className={`${option.color} text-white rounded-lg p-4 transition-colors flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="flex items-center space-x-3">
                {option.icon}
                <div className="text-left">
                  <div className="font-semibold">{option.name}</div>
                  <div className="text-sm opacity-90">{option.description}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">{option.count}</div>
                <div className="text-xs opacity-75">issues</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Processing State */}
      {isProcessing && (
        <div className="mt-6 bg-blue-600/20 border border-blue-500/50 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
            <div>
              <div className="text-white font-semibold">AI is analyzing your code...</div>
              <div className="text-blue-300 text-sm">
                {selectedType === 'fix-smells' && 'Identifying and fixing code smells...'}
                {selectedType === 'extract-methods' && 'Extracting methods from large functions...'}
                {selectedType === 'optimize' && 'Optimizing performance bottlenecks...'}
                {selectedType === 'readability' && 'Improving code readability...'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Demo Results */}
      {!isProcessing && selectedType && (
        <div className="mt-6 bg-green-600/20 border border-green-500/50 rounded-lg p-4">
          <div className="flex items-center space-x-3 mb-3">
            <CheckCircle className="w-6 h-6 text-green-400" />
            <div>
              <div className="text-white font-semibold">AI Refactoring Complete!</div>
              <div className="text-green-300 text-sm">
                {selectedType === 'fix-smells' && 'Fixed 3 code smells automatically'}
                {selectedType === 'extract-methods' && 'Extracted 2 methods from large functions'}
                {selectedType === 'optimize' && 'Optimized 4 performance bottlenecks'}
                {selectedType === 'readability' && 'Improved code readability and structure'}
              </div>
            </div>
          </div>
          
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="text-sm text-slate-300 mb-2">Sample refactored code:</div>
            <pre className="text-xs text-green-300 bg-slate-900 rounded p-2 overflow-x-auto">
{`// Before: Long method with multiple responsibilities
public void processUserData(String name, String email, int age) {
    // 50+ lines of mixed logic
}

// After: Extracted methods with single responsibilities  
public void processUserData(String name, String email, int age) {
    validateUserData(name, email, age);
    saveUserToDatabase(name, email, age);
    sendWelcomeEmail(email);
}

private void validateUserData(String name, String email, int age) {
    // Validation logic
}

private void saveUserToDatabase(String name, String email, int age) {
    // Database logic
}

private void sendWelcomeEmail(String email) {
    // Email logic
}`}
            </pre>
          </div>
        </div>
      )}

      {codeSmells.length === 0 && (
        <div className="text-center py-8">
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Issues Found</h3>
          <p className="text-slate-400">This file appears to be clean with no code quality issues.</p>
        </div>
      )}
    </div>
  );
}
