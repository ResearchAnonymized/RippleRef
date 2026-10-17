'use client';

import React, { useState, useEffect } from 'react';
import { FileText, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

interface FileAnalysisProps {
  selectedFile: any;
  onAnalyze: (file: any) => void;
}

export default function SimpleFileAnalysis({ selectedFile, onAnalyze }: FileAnalysisProps) {
  const [fileAnalysis, setFileAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyzeFile = async () => {
    if (!selectedFile) return;
    
    setIsAnalyzing(true);
    setFileAnalysis(null);
    
    try {
      console.log('🔍 Starting file analysis for:', selectedFile.relativePath);
      
      // Check if file is suitable for Java analysis
      const isJavaFile = selectedFile.relativePath.endsWith('.java') || selectedFile.relativePath.includes('/java/');
      
      if (!isJavaFile) {
        setFileAnalysis({
          filePath: selectedFile.relativePath,
          fileType: 'Non-Java',
          message: 'This file type is not suitable for Java code analysis',
          recommendation: 'Please select a .java file for code quality analysis',
          codeSmells: [],
          metrics: {}
        });
        return;
      }
      
      const workspaceId = (selectedFile && (selectedFile.workspaceId || selectedFile.workspaceID)) || 'project-latest';
      const response = await fetch('/api/workspace-enhanced-analysis/analyze-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId,
          filePath: selectedFile.relativePath
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ Enhanced analysis result:', data);
      
      setFileAnalysis(data);
      console.log('📊 File analysis completed successfully');
      
    } catch (error) {
      console.error('❌ Failed to analyze file:', error);
      setFileAnalysis({
        filePath: selectedFile.relativePath,
        error: 'Analysis failed',
        codeSmells: [],
        metrics: {}
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (selectedFile) {
      analyzeFile();
    }
  }, [selectedFile]);

  if (!selectedFile) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <div className="text-center py-8">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h4 className="text-lg font-semibold text-white mb-2">Select a File</h4>
          <p className="text-slate-400">Choose a file to analyze its code quality.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center">
          <FileText className="w-5 h-5 text-blue-400 mr-2" />
          File Analysis: {selectedFile.name || selectedFile.relativePath.split('/').pop()}
        </h3>
        <button
          onClick={analyzeFile}
          disabled={isAnalyzing}
          className={`px-4 py-2 rounded text-sm transition-colors ${
            isAnalyzing 
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isAnalyzing ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin inline" />
              Analyzing...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2 inline" />
              Re-analyze
            </>
          )}
        </button>
      </div>

      {isAnalyzing && (
        <div className="text-center py-8">
          <RefreshCw className="w-12 h-12 text-blue-400 mx-auto mb-4 animate-spin" />
          <h4 className="text-lg font-semibold text-white mb-2">Analyzing File...</h4>
          <p className="text-slate-400">Please wait while we analyze this file.</p>
        </div>
      )}

      {!isAnalyzing && !fileAnalysis && (
        <div className="text-center py-8">
          <RefreshCw className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h4 className="text-lg font-semibold text-white mb-2">Click Analyze to Start</h4>
          <p className="text-slate-400">Click the "Re-analyze" button to analyze this file.</p>
        </div>
      )}

      {!isAnalyzing && fileAnalysis && (
        <div className="space-y-4">
          {/* Analysis Status */}
          <div className="text-center py-4">
            {fileAnalysis.fileType === 'Non-Java' ? (
              <>
                <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
                <h4 className="text-lg font-semibold text-white mb-2">File Type Not Supported</h4>
                <p className="text-slate-400 mb-4">{fileAnalysis.message}</p>
                <p className="text-slate-300 text-sm">{fileAnalysis.recommendation}</p>
              </>
            ) : fileAnalysis.codeSmells && fileAnalysis.codeSmells.length === 0 ? (
              <>
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <h4 className="text-lg font-semibold text-white mb-2">File Analysis Complete</h4>
                <p className="text-slate-400 mb-4">This file appears to be clean with no code quality issues detected.</p>
              </>
            ) : (
              <>
                <AlertTriangle className="w-12 h-12 text-orange-400 mx-auto mb-4" />
                <h4 className="text-lg font-semibold text-white mb-2">File Analysis Complete</h4>
                <p className="text-slate-400 mb-4">Found {fileAnalysis.codeSmells?.length || 0} code quality issues in this file.</p>
              </>
            )}
          </div>
          
          {/* Debug info - always show */}
          <div className="mt-4 p-4 bg-slate-600 rounded-lg text-left">
            <h5 className="text-white font-semibold mb-2">Analysis Results:</h5>
            <div className="text-sm text-slate-300 space-y-1">
              <p><strong>File:</strong> {selectedFile.relativePath}</p>
              <p><strong>Analysis Status:</strong> {fileAnalysis ? '✅ Completed' : '❌ Not analyzed'}</p>
              {fileAnalysis?.fileType === 'Non-Java' ? (
                <>
                  <p><strong>File Type:</strong> {fileAnalysis.fileType}</p>
                  <p><strong>Message:</strong> {fileAnalysis.message}</p>
                </>
              ) : (
                <>
                  <p><strong>Code Smells:</strong> {fileAnalysis?.codeSmells?.length || 0}</p>
                  <p><strong>Total Lines:</strong> {fileAnalysis?.metrics?.totalLines || 0}</p>
                  <p><strong>Classes:</strong> {fileAnalysis?.metrics?.classCount || 0}</p>
                  <p><strong>Methods:</strong> {fileAnalysis?.metrics?.methodCount || 0}</p>
                  <p><strong>Quality Grade:</strong> {fileAnalysis?.metrics?.qualityGrade || 'N/A'}</p>
                </>
              )}
            </div>
          </div>
          
          {/* Show quality insights if available */}
          {fileAnalysis?.qualityInsights && (
            <div className="mt-4 p-4 bg-slate-700 rounded-lg">
              <h5 className="text-white font-semibold mb-2">Quality Assessment</h5>
              <div className="text-sm text-slate-300">
                <p><strong>Overall Quality:</strong> {fileAnalysis.qualityInsights.qualityCategory}</p>
                {fileAnalysis.qualityInsights.specificInsights && (
                  <div className="mt-2 space-y-1">
                    {Object.entries(fileAnalysis.qualityInsights.specificInsights).map(([key, value]: [string, any]) => (
                      <p key={key}><strong>{key.charAt(0).toUpperCase() + key.slice(1)}:</strong> {value}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Show code smells if any */}
          {fileAnalysis?.codeSmells && fileAnalysis.codeSmells.length > 0 && (
            <div className="mt-4">
              <h5 className="text-white font-semibold mb-2">Code Smells Found:</h5>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {fileAnalysis.codeSmells.map((smell: any, index: number) => (
                  <div key={index} className="p-3 bg-slate-700 rounded-lg border-l-4 border-red-500">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h6 className="text-white font-medium mb-1">{smell.title}</h6>
                        <p className="text-slate-400 text-sm mb-2">{smell.description}</p>
                        <div className="flex items-center text-xs text-slate-500">
                          <span className="mr-2">Severity: {smell.severity}</span>
                          <span className="mr-2">Type: {smell.type}</span>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        smell.severity === 'CRITICAL' ? 'bg-red-500 text-white' :
                        smell.severity === 'MAJOR' ? 'bg-orange-500 text-white' :
                        'bg-yellow-500 text-white'
                      }`}>
                        {smell.severity}
                      </span>
                    </div>
                    {smell.recommendation && (
                      <div className="mt-2 p-2 bg-slate-600 rounded-md text-sm text-slate-300">
                        <strong>Recommendation:</strong> {smell.recommendation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
