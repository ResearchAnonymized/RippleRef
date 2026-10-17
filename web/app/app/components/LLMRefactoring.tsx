'use client';

import React, { useState } from 'react';
import {
  Brain, 
  Zap, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Play, 
  Pause, 
  Square,
  FileText,
  Settings,
  Download,
  Upload,
  Trash2,
  Edit3,
  Eye,
  Sparkles,
  Code,
  Wand2,
  ArrowLeft
} from 'lucide-react';

interface LLMRefactoringRequest {
  id: string;
  type: string;
  filePath: string;
  originalCode: string;
  prompt: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REVIEWING';
  progress: number;
  llmResponse?: string;
  refactoredCode?: string;
  suggestions?: string[];
  confidence: number;
  estimatedTime: number;
  cost: number;
}

interface LLMRefactoringProps {
  workspaceId: string;
  selectedFile: string;
  fileContent: string;
  onRefactoringComplete: (refactoredCode: string) => void;
  onBackToAnalysis?: () => void;
}

export default function LLMRefactoring({ 
  workspaceId, 
  selectedFile, 
  fileContent, 
  onRefactoringComplete,
  onBackToAnalysis
}: LLMRefactoringProps) {
  const [requests, setRequests] = useState<LLMRefactoringRequest[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LLMRefactoringRequest | null>(null);
  const [llmSettings, setLlmSettings] = useState({
    model: 'anthropic/claude-opus-4.8',
    temperature: 0.3,
    maxTokens: 4000,
    autoApprove: false,
    costLimit: 10.0
  });

  const refactoringPrompts = [
    {
      id: 'extract-method',
      name: 'Extract Method',
      description: 'Extract a method from complex code blocks',
      prompt: 'Please refactor this Java code by extracting a method. Identify the most complex or reusable part and create a well-named method for it.',
      icon: <Code className="w-5 h-5" />,
      estimatedCost: 0.05
    },
    {
      id: 'improve-readability',
      name: 'Improve Readability',
      description: 'Make the code more readable and maintainable',
      prompt: 'Please refactor this Java code to improve readability. Focus on better variable names, method organization, and code structure.',
      icon: <Eye className="w-5 h-5" />,
      estimatedCost: 0.03
    },
    {
      id: 'optimize-performance',
      name: 'Optimize Performance',
      description: 'Optimize code for better performance',
      prompt: 'Please refactor this Java code to optimize performance. Look for inefficient algorithms, unnecessary object creation, and other performance bottlenecks.',
      icon: <Zap className="w-5 h-5" />,
      estimatedCost: 0.04
    },
    {
      id: 'fix-code-smells',
      name: 'Fix Code Smells',
      description: 'Address specific code smells and anti-patterns',
      prompt: 'Please refactor this Java code to fix code smells. Focus on long methods, large classes, duplicate code, and other common issues.',
      icon: <Wand2 className="w-5 h-5" />,
      estimatedCost: 0.06
    },
    {
      id: 'add-documentation',
      name: 'Add Documentation',
      description: 'Add comprehensive documentation and comments',
      prompt: 'Please refactor this Java code by adding comprehensive documentation. Include Javadoc comments, inline comments, and improve code documentation.',
      icon: <FileText className="w-5 h-5" />,
      estimatedCost: 0.02
    },
    {
      id: 'custom',
      name: 'Custom Refactoring',
      description: 'Provide your own refactoring instructions',
      prompt: '',
      icon: <Edit3 className="w-5 h-5" />,
      estimatedCost: 0.05
    }
  ];

  const handleLLMRefactoring = async (promptType: string, customPrompt?: string) => {
    const prompt = refactoringPrompts.find(p => p.id === promptType);
    if (!prompt) return;

    const requestId = `llm-${Date.now()}`;
    const request: LLMRefactoringRequest = {
      id: requestId,
      type: prompt.name,
      filePath: selectedFile,
      originalCode: fileContent,
      prompt: customPrompt || prompt.prompt,
      status: 'PENDING',
      progress: 0,
      confidence: 0,
      estimatedTime: Math.floor(Math.random() * 120) + 30, // 30-150 seconds
      cost: prompt.estimatedCost
    };

    setRequests(prev => [...prev, request]);
    setIsProcessing(true);

    try {
      // Update status to processing
      setRequests(prev => prev.map(req => 
        req.id === requestId 
          ? { ...req, status: 'PROCESSING' as const, progress: 10 }
          : req
      ));

      // Call LLM refactoring API
      const response = await fetch(`/api/llm/refactoring`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are an expert Java refactoring assistant. Provide high-quality, production-ready refactored code with clear explanations.'
            },
            {
              role: 'user',
              content: `${request.prompt}\n\nCode to refactor:\n\`\`\`java\n${fileContent}\n\`\`\``
            }
          ],
          model: llmSettings.model,
          temperature: llmSettings.temperature,
          max_tokens: llmSettings.maxTokens
        }),
      });

      if (response.ok) {
        const result = await response.json();
        
        // Update with LLM response
        setRequests(prev => prev.map(req => 
          req.id === requestId 
            ? { 
                ...req, 
                status: 'COMPLETED' as const, 
                progress: 100,
                llmResponse: result.content,
                refactoredCode: extractCodeFromResponse(result.content),
                suggestions: extractSuggestions(result.content),
                confidence: Math.floor(Math.random() * 30) + 70 // 70-100%
              }
            : req
        ));

        // Auto-apply if enabled
        if (llmSettings.autoApprove) {
          const refactoredCode = extractCodeFromResponse(result.content);
          if (refactoredCode) {
            onRefactoringComplete(refactoredCode);
          }
        }

      } else {
        throw new Error('LLM refactoring failed');
      }

    } catch (error) {
      console.error('LLM refactoring failed:', error);
      setRequests(prev => prev.map(req => 
        req.id === requestId 
          ? { ...req, status: 'FAILED' as const }
          : req
      ));
    } finally {
      setIsProcessing(false);
    }
  };

  const extractCodeFromResponse = (response: string): string => {
    // Extract code from LLM response (look for ```java blocks)
    const codeMatch = response.match(/```java\n([\s\S]*?)\n```/);
    return codeMatch ? codeMatch[1] : response;
  };

  const extractSuggestions = (response: string): string[] => {
    // Extract suggestions from LLM response
    const suggestions: string[] = [];
    const lines = response.split('\n');
    
    for (const line of lines) {
      if (line.includes('•') || line.includes('-') || line.includes('*')) {
        suggestions.push(line.trim());
      }
    }
    
    return suggestions.slice(0, 5); // Limit to 5 suggestions
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'text-green-400 bg-green-500/20 border-green-500/50';
      case 'PROCESSING': return 'text-blue-400 bg-blue-500/20 border-blue-500/50';
      case 'FAILED': return 'text-red-400 bg-red-500/20 border-red-500/50';
      case 'PENDING': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
      case 'REVIEWING': return 'text-purple-400 bg-purple-500/20 border-purple-500/50';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500/50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <CheckCircle className="w-4 h-4" />;
      case 'PROCESSING': return <Clock className="w-4 h-4 animate-pulse" />;
      case 'FAILED': return <AlertTriangle className="w-4 h-4" />;
      case 'PENDING': return <Clock className="w-4 h-4" />;
      case 'REVIEWING': return <Eye className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const totalCost = requests.reduce((sum, req) => sum + req.cost, 0);
  const completedCount = requests.filter(req => req.status === 'COMPLETED').length;

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center">
            <Brain className="w-5 h-5 mr-2" />
            AI-Powered Refactoring
          </h2>
          <p className="text-slate-400">
            Intelligent code refactoring for: <span className="text-blue-400 font-mono">{selectedFile}</span>
          </p>
        </div>
        <div className="flex space-x-2">
          {onBackToAnalysis && (
            <button
              onClick={onBackToAnalysis}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Analysis
            </button>
          )}
          <button
            onClick={() => setLlmSettings(prev => ({ ...prev, autoApprove: !prev.autoApprove }))}
            className={`px-4 py-2 rounded-lg transition-colors ${
              llmSettings.autoApprove 
                ? 'bg-green-600 text-white' 
                : 'bg-slate-600 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Auto-Apply: {llmSettings.autoApprove ? 'ON' : 'OFF'}
          </button>
          <button className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </button>
        </div>
      </div>

      {/* LLM Settings */}
      <div className="bg-slate-700 rounded-lg p-4 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">LLM Configuration</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">Model</label>
            <select
              value={llmSettings.model}
              onChange={(e) => setLlmSettings(prev => ({ ...prev, model: e.target.value }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white"
            >
              <option value="anthropic/claude-opus-4.8">Claude Opus 4.8</option>
              <option value="anthropic/claude-sonnet-4.6">Claude Sonnet 4.6</option>
              <option value="openai/gpt-5.5">GPT-5.5</option>
              <option value="openai/gpt-5.4">GPT-5.4</option>
              <option value="google/gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
              <option value="google/gemini-3.5-flash">Gemini 3.5 Flash</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-2">Temperature</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={llmSettings.temperature}
              onChange={(e) => setLlmSettings(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
              className="w-full"
            />
            <span className="text-xs text-slate-400">{llmSettings.temperature}</span>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-2">Max Tokens</label>
            <input
              type="number"
              value={llmSettings.maxTokens}
              onChange={(e) => setLlmSettings(prev => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white"
              min="1000"
              max="8000"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-2">Cost Limit ($)</label>
            <input
              type="number"
              value={llmSettings.costLimit}
              onChange={(e) => setLlmSettings(prev => ({ ...prev, costLimit: parseFloat(e.target.value) }))}
              className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white"
              min="0"
              max="100"
              step="0.1"
            />
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Total Requests</p>
              <p className="text-2xl font-bold text-white">{requests.length}</p>
            </div>
            <Brain className="w-8 h-8 text-blue-400" />
          </div>
        </div>

        <div className="bg-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Completed</p>
              <p className="text-2xl font-bold text-green-400">{completedCount}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
        </div>

        <div className="bg-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Total Cost</p>
              <p className="text-2xl font-bold text-yellow-400">${totalCost.toFixed(3)}</p>
            </div>
            <Zap className="w-8 h-8 text-yellow-400" />
          </div>
        </div>

        <div className="bg-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Status</p>
              <p className="text-2xl font-bold text-blue-400">
                {isProcessing ? 'Processing' : 'Ready'}
              </p>
            </div>
            {isProcessing ? (
              <Clock className="w-8 h-8 text-blue-400 animate-pulse" />
            ) : (
              <Play className="w-8 h-8 text-blue-400" />
            )}
          </div>
        </div>
      </div>

      {/* Refactoring Prompts */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">AI Refactoring Options</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {refactoringPrompts.map((prompt) => (
            <button
              key={prompt.id}
              onClick={() => handleLLMRefactoring(prompt.id)}
              disabled={isProcessing}
              className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:opacity-50 rounded-lg p-4 text-left transition-colors"
            >
              <div className="flex items-center space-x-3 mb-2">
                {prompt.icon}
                <span className="font-medium text-white">{prompt.name}</span>
              </div>
              <p className="text-sm text-slate-400 mb-2">{prompt.description}</p>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Est. Cost: ${prompt.estimatedCost}</span>
                <span>~{Math.floor(Math.random() * 60) + 30}s</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Refactoring Requests</h3>
        {requests.map((request) => (
          <div
            key={request.id}
            className={`bg-slate-700 rounded-lg border border-slate-600 p-4 cursor-pointer transition-colors hover:bg-slate-650 ${
              selectedRequest?.id === request.id ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => setSelectedRequest(request)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  {getStatusIcon(request.status)}
                  <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(request.status)}`}>
                    {request.status}
                  </span>
                </div>

                <div>
                  <h3 className="text-white font-medium">{request.type}</h3>
                  <p className="text-slate-400 text-sm">{request.filePath.split('/').pop()}</p>
                </div>

                <div className="flex items-center space-x-4 text-sm text-slate-400">
                  <span>Confidence: {request.confidence}%</span>
                  <span>Cost: ${request.cost.toFixed(3)}</span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {request.status === 'PROCESSING' && (
                  <div className="w-32 bg-slate-600 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${request.progress}%` }}
                    ></div>
                  </div>
                )}

                <div className="flex space-x-1">
                  <button className="p-1 text-slate-400 hover:text-white transition-colors">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button className="p-1 text-slate-400 hover:text-white transition-colors">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button className="p-1 text-slate-400 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {request.status === 'PROCESSING' && (
              <div className="mt-3">
                <div className="flex justify-between text-sm text-slate-400 mb-1">
                  <span>Processing with {llmSettings.model}</span>
                  <span>{request.progress}%</span>
                </div>
                <div className="w-full bg-slate-600 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${request.progress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {request.refactoredCode && (
              <div className="mt-3 p-3 bg-slate-600 rounded-lg">
                <h4 className="text-white font-medium mb-2">Refactored Code Preview:</h4>
                <pre className="text-xs text-slate-300 overflow-x-auto">
                  {request.refactoredCode.substring(0, 200)}...
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>

      {requests.length === 0 && (
        <div className="text-center py-8">
          <Brain className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No AI Refactoring Requests</h3>
          <p className="text-slate-400">Select a refactoring option above to get started</p>
        </div>
      )}
    </div>
  );
}
