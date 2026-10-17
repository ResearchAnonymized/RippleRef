'use client';

import React, { useState, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Copy, 
  Download, 
  Maximize2, 
  Minimize2, 
  Search, 
  FileText, 
  Code, 
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

interface CodePreviewProps {
  content: string;
  fileName: string;
  filePath: string;
  language?: string;
  onClose?: () => void;
  isModal?: boolean;
  showLineNumbers?: boolean;
  highlightLines?: number[];
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  codeSmells?: Array<{
    startLine: number;
    endLine: number;
    title: string;
    severity: string;
    description: string;
  }>;
}

export default function CodePreview({
  content,
  fileName,
  filePath,
  language = 'java',
  onClose,
  isModal = false,
  showLineNumbers = true,
  highlightLines = [],
  searchTerm = '',
  onSearchChange,
  codeSmells = []
}: CodePreviewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCodeSmells, setShowCodeSmells] = useState(true);
  const [copied, setCopied] = useState(false);
  const [expandedSmells, setExpandedSmells] = useState<Set<number>>(new Set());

  // Debug logging
  React.useEffect(() => {
    console.log('CodePreview loaded with codeSmells:', codeSmells);
    console.log('CodePreview showCodeSmells:', showCodeSmells);
  }, [codeSmells, showCodeSmells]);

  // Auto-detect language from file extension
  const detectedLanguage = React.useMemo(() => {
    if (language !== 'java') return language;
    
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'java': return 'java';
      case 'js': return 'javascript';
      case 'ts': return 'typescript';
      case 'jsx': return 'jsx';
      case 'tsx': return 'tsx';
      case 'py': return 'python';
      case 'cpp': case 'cc': case 'cxx': return 'cpp';
      case 'c': return 'c';
      case 'cs': return 'csharp';
      case 'go': return 'go';
      case 'rs': return 'rust';
      case 'php': return 'php';
      case 'rb': return 'ruby';
      case 'swift': return 'swift';
      case 'kt': return 'kotlin';
      case 'scala': return 'scala';
      case 'xml': return 'xml';
      case 'html': return 'html';
      case 'css': return 'css';
      case 'scss': return 'scss';
      case 'json': return 'json';
      case 'yaml': case 'yml': return 'yaml';
      case 'md': return 'markdown';
      case 'sql': return 'sql';
      case 'sh': return 'bash';
      case 'dockerfile': return 'dockerfile';
      default: return 'text';
    }
  }, [fileName, language]);

  // Create custom style with line highlighting
  const customStyle = React.useMemo(() => {
    const baseStyle = { ...vscDarkPlus };
    
    // Add line highlighting styles
    if (highlightLines.length > 0) {
      baseStyle['code[class*="language-"]'] = {
        ...baseStyle['code[class*="language-"]'],
        background: 'transparent',
      };
    }
    
    return baseStyle;
  }, [highlightLines]);

  // Line highlighting function
  const lineProps = React.useCallback((lineNumber: number) => {
    const isHighlighted = highlightLines.includes(lineNumber);
    const codeSmell = codeSmells.find(smell => 
      lineNumber >= smell.startLine && lineNumber <= smell.endLine
    );
    
    let backgroundColor = 'transparent';
    let borderLeft = 'none';
    let paddingLeft = '0px';
    
    if (isHighlighted) {
      backgroundColor = 'rgba(59, 130, 246, 0.3)'; // Blue highlight
    } else if (codeSmell) {
      console.log(`Line ${lineNumber} has code smell:`, codeSmell);
      // Color-coded highlighting based on severity
      switch (codeSmell.severity?.toUpperCase()) {
        case 'CRITICAL':
          backgroundColor = 'rgba(239, 68, 68, 0.3)'; // Red
          borderLeft = '3px solid #ef4444';
          paddingLeft = '8px';
          break;
        case 'MAJOR':
          backgroundColor = 'rgba(245, 158, 11, 0.3)'; // Orange
          borderLeft = '3px solid #f59e0b';
          paddingLeft = '8px';
          break;
        case 'MINOR':
          backgroundColor = 'rgba(34, 197, 94, 0.3)'; // Green
          borderLeft = '3px solid #22c55e';
          paddingLeft = '8px';
          break;
        default:
          backgroundColor = 'rgba(156, 163, 175, 0.3)'; // Gray
          borderLeft = '3px solid #9ca3af';
          paddingLeft = '8px';
      }
    }
    
    return {
      style: {
        backgroundColor,
        borderLeft,
        paddingLeft,
      }
    };
  }, [highlightLines, codeSmells]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const downloadFile = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const toggleSmellExpansion = (index: number) => {
    const newExpanded = new Set(expandedSmells);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSmells(newExpanded);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'CRITICAL': return 'text-red-400 bg-red-500/20';
      case 'MAJOR': return 'text-orange-400 bg-orange-500/20';
      case 'MINOR': return 'text-yellow-400 bg-yellow-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  };

  const containerClasses = isModal 
    ? `fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4`
    : `relative bg-slate-900 rounded-lg border border-slate-700 overflow-hidden ${isFullscreen ? 'fixed inset-0 z-40' : ''}`;

  return (
    <div className={containerClasses}>
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <FileText className="w-5 h-5 text-blue-400" />
          <div>
            <h3 className="text-white font-semibold">{fileName}</h3>
            <p className="text-slate-400 text-sm">{filePath}</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Search */}
          {onSearchChange && (
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search in code..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="bg-slate-700 text-white pl-10 pr-4 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none text-sm w-64"
              />
            </div>
          )}
          
          {/* Code Smells Toggle */}
          {codeSmells.length > 0 && (
            <button
              onClick={() => setShowCodeSmells(!showCodeSmells)}
              className={`p-2 rounded-lg transition-colors ${
                showCodeSmells ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-400'
              }`}
              title={`${showCodeSmells ? 'Hide' : 'Show'} code smells`}
            >
              {showCodeSmells ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
          
          {/* Actions */}
          <button
            onClick={copyToClipboard}
            className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
          
          <button
            onClick={downloadFile}
            className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
            title="Download file"
          >
            <Download className="w-4 h-4" />
          </button>
          
          <button
            onClick={toggleFullscreen}
            className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              title="Close"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="flex h-full">
        {/* Code Content */}
        <div className={`flex-1 overflow-auto ${isFullscreen ? 'h-screen' : 'h-96'}`}>
          <SyntaxHighlighter
            language={detectedLanguage}
            style={customStyle}
            showLineNumbers={showLineNumbers}
            lineNumberStyle={{
              color: '#6b7280',
              marginRight: '1rem',
              userSelect: 'none',
            }}
            lineProps={lineProps}
            customStyle={{
              margin: 0,
              padding: '1rem',
              background: '#0f172a',
              fontSize: '14px',
              lineHeight: '1.5',
            }}
            wrapLines={true}
            wrapLongLines={true}
          >
            {content}
          </SyntaxHighlighter>
        </div>

        {/* Code Smells Sidebar */}
        {showCodeSmells && codeSmells.length > 0 && (
          <div className="w-80 bg-slate-800 border-l border-slate-700 overflow-y-auto">
            <div className="p-4 border-b border-slate-700">
              <h4 className="text-white font-semibold flex items-center">
                <AlertCircle className="w-4 h-4 mr-2 text-red-400" />
                Code Smells ({codeSmells.length})
              </h4>
            </div>
            
            <div className="p-4 space-y-3">
              {codeSmells.map((smell, index) => {
                const isExpanded = expandedSmells.has(index);
                
                return (
                  <div key={index} className="bg-slate-700/50 rounded-lg border border-slate-600">
                    <button
                      onClick={() => toggleSmellExpansion(index)}
                      className="w-full p-3 text-left flex items-center justify-between hover:bg-slate-600/50 transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(smell.severity)}`}>
                          {smell.severity}
                        </span>
                        <span className="text-white text-sm font-medium truncate">
                          {smell.title}
                        </span>
                      </div>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </button>
                    
                    {isExpanded && (
                      <div className="px-3 pb-3">
                        <div className="text-slate-300 text-sm mb-2">
                          Lines {smell.startLine}-{smell.endLine}
                        </div>
                        <p className="text-slate-400 text-sm">{smell.description}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
