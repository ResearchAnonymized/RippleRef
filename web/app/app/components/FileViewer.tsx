'use client';

import { useState, useEffect } from 'react';
import { X, Download, Copy, Check } from 'lucide-react';
import { apiClient } from '../api/client';

interface FileViewerProps {
  workspaceId: string;
  filePath: string;
  fileName: string;
  onClose: () => void;
}

export default function FileViewer({ workspaceId, filePath, fileName, onClose }: FileViewerProps) {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadFileContent();
  }, [workspaceId, filePath]);

  const loadFileContent = async () => {
    try {
      setIsLoading(true);
      setError('');
      const response = await apiClient.getFileContent(workspaceId, filePath);
      setContent(response.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file content');
    } finally {
      setIsLoading(false);
    }
  };

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

  const getFileExtension = (filename: string) => {
    return filename.split('.').pop()?.toLowerCase() || '';
  };

  const formatContent = (content: string, extension: string) => {
    // Basic syntax highlighting for common file types
    if (['java', 'js', 'ts', 'jsx', 'tsx'].includes(extension)) {
      return content
        .replace(/\b(public|private|protected|class|interface|enum|extends|implements|static|final|abstract|synchronized|volatile|transient|native|strictfp|import|package|return|if|else|for|while|do|switch|case|default|break|continue|throw|throws|try|catch|finally|new|this|super|null|true|false|int|long|short|byte|float|double|char|boolean|void|String|Object|Integer|Long|Short|Byte|Float|Double|Character|Boolean)\b/g, '<span class="text-blue-500 font-semibold">$1</span>')
        .replace(/\b(const|let|var|function|async|await|export|import|from|as|default|const|enum|interface|type|namespace|module|declare|namespace|abstract|implements|extends|class|constructor|super|this|new|static|readonly|public|private|protected|get|set|try|catch|finally|throw|if|else|switch|case|default|for|while|do|break|continue|return|yield|in|of|instanceof|typeof|delete|void|never|any|unknown|boolean|number|string|symbol|object|undefined|null|true|false)\b/g, '<span class="text-blue-500 font-semibold">$1</span>')
        .replace(/\b(\d+\.?\d*)\b/g, '<span class="text-green-600">$1</span>')
        .replace(/"([^"]*)"/g, '<span class="text-orange-500">"$1"</span>')
        .replace(/'([^']*)'/g, '<span class="text-orange-500">\'$1\'</span>')
        .replace(/\/\/(.*)$/gm, '<span class="text-gray-500 italic">//$1</span>')
        .replace(/\/\*([\s\S]*?)\*\//g, '<span class="text-gray-500 italic">/*$1*/</span>');
    }
    
    if (['xml', 'html', 'xhtml'].includes(extension)) {
      return content
        .replace(/(&lt;\/?)([a-zA-Z][a-zA-Z0-9]*)([^&]*?)(&gt;)/g, '<span class="text-blue-600">$1</span><span class="text-purple-600">$2</span><span class="text-gray-700">$3</span><span class="text-blue-600">$4</span>')
        .replace(/(&lt;\/?)([a-zA-Z][a-zA-Z0-9]*)(&gt;)/g, '<span class="text-blue-600">$1</span><span class="text-purple-600">$2</span><span class="text-blue-600">$3</span>');
    }
    
    if (['json', 'yaml', 'yml'].includes(extension)) {
      return content
        .replace(/"([^"]*)":/g, '<span class="text-purple-600">"$1"</span>:')
        .replace(/"([^"]*)"/g, '<span class="text-orange-500">"$1"</span>')
        .replace(/\b(true|false|null)\b/g, '<span class="text-blue-500">$1</span>')
        .replace(/\b(\d+\.?\d*)\b/g, '<span class="text-green-600">$1</span>');
    }
    
    return content;
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 shadow-2xl">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading file content...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 shadow-2xl max-w-md">
          <div className="text-red-500 text-center mb-4">
            <X className="h-12 w-12 mx-auto" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading File</h3>
          <p className="text-gray-600 text-sm mb-4">{error}</p>
          <button
            onClick={onClose}
            className="w-full bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const extension = getFileExtension(fileName);
  const formattedContent = formatContent(content, extension);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="ml-4 text-sm text-gray-500">{fileName}</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={copyToClipboard}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </button>
            <button
              onClick={downloadFile}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              title="Download file"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-50">
          <div className="p-4">
            <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
              <code dangerouslySetInnerHTML={{ __html: formattedContent }} />
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
          <div className="flex items-center justify-between">
            <span>{content.length} characters</span>
            <span className="uppercase">{extension} file</span>
          </div>
        </div>
      </div>
    </div>
  );
}
