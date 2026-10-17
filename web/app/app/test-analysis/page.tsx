'use client';

import React, { useState } from 'react';
import SimpleFileAnalysis from '../components/SimpleFileAnalysis';

export default function TestAnalysisPage() {
  const [selectedFile, setSelectedFile] = useState<any>(null);

  const testFiles = [
    {
      name: 'Assert.java',
      relativePath: 'junit4-main/src/main/java/org/junit/Assert.java',
      metrics: { linesOfCode: 1034 }
    },
    {
      name: 'faq.fml (Template)',
      relativePath: 'junit4-main/src/site/fml/faq.fml',
      metrics: { linesOfCode: 1729 },
      note: 'FML Template - Not suitable for Java analysis'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">File Analysis Test</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* File Selection */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Select File to Analyze</h2>
            <div className="space-y-2">
              {testFiles.map((file, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full p-3 rounded-lg text-left transition-colors ${
                    selectedFile?.relativePath === file.relativePath
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                  }`}
                >
                  <div className="font-medium">{file.name}</div>
                  <div className="text-sm opacity-75">{file.relativePath}</div>
                  <div className="text-sm opacity-75">{file.metrics.linesOfCode} lines</div>
                </button>
              ))}
            </div>
          </div>

          {/* File Analysis */}
          <div>
            <SimpleFileAnalysis 
              selectedFile={selectedFile}
              onAnalyze={(file) => setSelectedFile(file)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
