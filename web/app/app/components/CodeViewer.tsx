'use client';

import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Copy, 
  Download, 
  Maximize2, 
  FileText, 
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

interface CodeViewerProps {
  content: string;
  fileName: string;
  language?: string;
  showLineNumbers?: boolean;
  maxHeight?: string;
  highlightLines?: number[];
  codeSmells?: Array<{
    startLine: number;
    endLine: number;
    title: string;
    severity: string;
    description: string;
  }>;
  onExpand?: () => void;
}

export default function CodeViewer({
  content,
  fileName,
  language = 'java',
  showLineNumbers = true,
  maxHeight = '400px',
  highlightLines = [],
  codeSmells = [],
  onExpand
}: CodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const [showSmells, setShowSmells] = useState(false);
  const [expandedSmells, setExpandedSmells] = useState<Set<number>>(new Set());

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

  // Line highlighting function
  const lineProps = React.useCallback((lineNumber: number) => {
    const isHighlighted = highlightLines.includes(lineNumber);
    const hasCodeSmell = codeSmells.some(smell => 
      lineNumber >= smell.startLine && lineNumber <= smell.endLine
    );
    
    return {
      style: {
        backgroundColor: isHighlighted 
          ? 'rgba(59, 130, 246, 0.3)' // Blue highlight
          : hasCodeSmell 
            ? 'rgba(239, 68, 68, 0.2)' // Red highlight for code smells
            : 'transparent',
        borderLeft: hasCodeSmell ? '3px solid #ef4444' : 'none',
        paddingLeft: hasCodeSmell ? '8px' : '0px',
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

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-blue-400" />
          <span className="text-white font-medium text-sm">{fileName}</span>
          {codeSmells.length > 0 && (
            <span className="text-red-400 text-xs bg-red-500/20 px-2 py-1 rounded">
              {codeSmells.length} issues
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-1">
          {codeSmells.length > 0 && (
            <button
              onClick={() => setShowSmells(!showSmells)}
              className={`p-1.5 rounded transition-colors ${
                showSmells ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-400'
              }`}
              title="Toggle code smells"
            >
              <AlertCircle className="w-3 h-3" />
            </button>
          )}
          
          <button
            onClick={copyToClipboard}
            className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <CheckCircle className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          </button>
          
          <button
            onClick={downloadFile}
            className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
            title="Download file"
          >
            <Download className="w-3 h-3" />
          </button>
          
          {onExpand && (
            <button
              onClick={onExpand}
              className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
              title="Expand to full view"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex">
        {/* Code Content */}
        <div className="flex-1 overflow-auto" style={{ maxHeight }}>
          <SyntaxHighlighter
            language={detectedLanguage}
            style={vscDarkPlus}
            showLineNumbers={showLineNumbers}
            lineNumberStyle={{
              color: '#6b7280',
              marginRight: '1rem',
              userSelect: 'none',
              fontSize: '12px',
            }}
            lineProps={lineProps}
            customStyle={{
              margin: 0,
              padding: '1rem',
              background: '#0f172a',
              fontSize: '13px',
              lineHeight: '1.4',
            }}
            wrapLines={true}
            wrapLongLines={true}
          >
            {content}
          </SyntaxHighlighter>
        </div>

        {/* Code Smells Sidebar */}
        {showSmells && codeSmells.length > 0 && (
          <div className="w-64 bg-slate-800 border-l border-slate-700 overflow-y-auto">
            <div className="p-3 border-b border-slate-700">
              <h4 className="text-white font-semibold text-sm flex items-center">
                <AlertCircle className="w-3 h-3 mr-1 text-red-400" />
                Issues ({codeSmells.length})
              </h4>
            </div>
            
            <div className="p-3 space-y-2">
              {codeSmells.map((smell, index) => {
                const isExpanded = expandedSmells.has(index);
                
                return (
                  <div key={index} className="bg-slate-700/50 rounded border border-slate-600">
                    <button
                      onClick={() => toggleSmellExpansion(index)}
                      className="w-full p-2 text-left flex items-center justify-between hover:bg-slate-600/50 transition-colors"
                    >
                      <div className="flex items-center space-x-1">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getSeverityColor(smell.severity)}`}>
                          {smell.severity}
                        </span>
                        <span className="text-white text-xs font-medium truncate">
                          {smell.title}
                        </span>
                      </div>
                      {isExpanded ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                    </button>
                    
                    {isExpanded && (
                      <div className="px-2 pb-2">
                        <div className="text-slate-300 text-xs mb-1">
                          Lines {smell.startLine}-{smell.endLine}
                        </div>
                        <p className="text-slate-400 text-xs">{smell.description}</p>
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
