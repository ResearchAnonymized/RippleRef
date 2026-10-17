'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import EnhancedRefactoringDashboard from '../components/EnhancedRefactoringDashboard';
import DependencyGraph from '../components/DependencyGraph';
import CodeComparison from '../components/CodeComparison';
import RefactoringDocumentation from '../components/RefactoringDocumentation';
import ImpactAnalysis from '../components/ImpactAnalysis';
import {
  Brain,
  Network,
  Code,
  FileText,
  Target,
  BarChart3,
  Settings,
  ArrowLeft,
  Download,
  Share2,
  Save,
  RefreshCw,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
  CheckCircle,
  AlertTriangle,
  Info,
  Zap,
  Shield,
  TrendingUp,
  Layers,
  GitCommit,
  History
} from 'lucide-react';

export default function EnhancedRefactoringPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'dependencies' | 'comparison' | 'documentation' | 'impact'>('dashboard');
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [codeSmells, setCodeSmells] = useState<any[]>([]);
  const [refactoringPlan, setRefactoringPlan] = useState<any>(null);
  const [dependencyGraph, setDependencyGraph] = useState<any[]>([]);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  useEffect(() => {
    // Get parameters from URL
    const workspace = searchParams.get('workspace') || '';
    const file = searchParams.get('file') || '';
    
    setWorkspaceId(workspace);
    setSelectedFile(file);
    
    // Load file content and analysis
    loadFileContent(workspace, file);
  }, [searchParams]);

  const loadFileContent = async (workspace: string, file: string) => {
    try {
      // Load file content
      const response = await fetch(`http://localhost:8080/api/workspace/${workspace}/file-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: file })
      });

      if (response.ok) {
        const data = await response.json();
        setFileContent(data.content || '');
      }

      // Load code smells
      const smellsResponse = await fetch(`http://localhost:8080/api/workspace/${workspace}/analyze-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: file })
      });

      if (smellsResponse.ok) {
        const smellsData = await smellsResponse.json();
        setCodeSmells(smellsData.smells || []);
      }
    } catch (error) {
      console.error('Failed to load file content:', error);
      // Mock data for demonstration
      setFileContent(`public class UserService {
    private UserRepository userRepository;
    private AuditLogger auditLogger;
    
    public void processUserData(String name, String email, int age) {
        // Validation logic (15 lines)
        if (name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("Name cannot be empty");
        }
        if (email == null || !email.contains("@")) {
            throw new IllegalArgumentException("Invalid email format");
        }
        if (age < 0 || age > 150) {
            throw new IllegalArgumentException("Invalid age");
        }
        
        // Business logic (20 lines)
        User user = new User();
        user.setName(name.trim());
        user.setEmail(email.toLowerCase());
        user.setAge(age);
        user.setCreatedAt(LocalDateTime.now());
        
        // Database operations (10 lines)
        try {
            userRepository.save(user);
            auditLogger.log("User created", user.getId());
        } catch (Exception e) {
            throw new RuntimeException("Failed to save user", e);
        }
    }
}`);
      setCodeSmells([
        { type: 'Long Method', severity: 'high', description: 'Method is too long (45 lines)' },
        { type: 'Magic Numbers', severity: 'medium', description: 'Hard-coded values should be constants' },
        { type: 'Single Responsibility', severity: 'high', description: 'Method handles multiple responsibilities' }
      ]);
    }
  };

  const handleRefactoringComplete = (refactoredCode: string) => {
    console.log('Refactoring completed:', refactoredCode);
    // Handle refactoring completion
  };

  const handleBack = () => {
    window.history.back();
  };

  const tabs = [
    { id: 'dashboard', label: 'Refactoring Dashboard', icon: <Brain className="w-4 h-4" /> },
    { id: 'dependencies', label: 'Dependency Graph', icon: <Network className="w-4 h-4" /> },
    { id: 'comparison', label: 'Code Comparison', icon: <Code className="w-4 h-4" /> },
    { id: 'documentation', label: 'Documentation', icon: <FileText className="w-4 h-4" /> },
    { id: 'impact', label: 'Impact Analysis', icon: <BarChart3 className="w-4 h-4" /> }
  ];

  const getTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <EnhancedRefactoringDashboard
            workspaceId={workspaceId}
            selectedFile={selectedFile}
            fileContent={fileContent}
            codeSmells={codeSmells}
            onRefactoringComplete={handleRefactoringComplete}
            onBack={handleBack}
          />
        );
      case 'dependencies':
        return (
          <DependencyGraph
            nodes={dependencyGraph}
            selectedNode={selectedStep || undefined}
            onNodeSelect={setSelectedStep}
            showImpact={true}
            refactoringSteps={refactoringPlan?.steps || []}
          />
        );
      case 'comparison':
        return (
          <CodeComparison
            beforeCode={fileContent}
            afterCode={`public class UserService {
    private static final int MIN_AGE = 0;
    private static final int MAX_AGE = 150;
    private static final String INVALID_AGE_MESSAGE = "Invalid age";
    
    private UserRepository userRepository;
    private AuditLogger auditLogger;
    
    public void processUserData(String name, String email, int age) {
        validateUserInput(name, email, age);
        User user = createUser(name, email, age);
        saveUser(user);
    }
    
    private void validateUserInput(String name, String email, int age) {
        if (name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("Name cannot be empty");
        }
        if (email == null || !email.contains("@")) {
            throw new IllegalArgumentException("Invalid email format");
        }
        if (age < MIN_AGE || age > MAX_AGE) {
            throw new IllegalArgumentException(INVALID_AGE_MESSAGE);
        }
    }
    
    private User createUser(String name, String email, int age) {
        User user = new User();
        user.setName(name.trim());
        user.setEmail(email.toLowerCase());
        user.setAge(age);
        user.setCreatedAt(LocalDateTime.now());
        return user;
    }
    
    private void saveUser(User user) {
        try {
            userRepository.save(user);
            auditLogger.log("User created", user.getId());
        } catch (Exception e) {
            throw new RuntimeException("Failed to save user", e);
        }
    }
}`}
            title="Extract Method Refactoring"
            description="Breaking down the processUserData method into smaller, focused methods"
            changes={{ added: 15, removed: 5, modified: 10 }}
            metrics={{
              complexityBefore: 8,
              complexityAfter: 4,
              maintainabilityBefore: 60,
              maintainabilityAfter: 85,
              testabilityBefore: 40,
              testabilityAfter: 90
            }}
            onApply={() => console.log('Apply changes')}
            onReject={() => console.log('Reject changes')}
          />
        );
      case 'documentation':
        return (
          <RefactoringDocumentation
            refactoringStep={{
              id: 'step-1',
              title: 'Extract Large Method',
              description: 'Break down the processUserData method into smaller, focused methods',
              type: 'extract',
              impact: {
                filesAffected: 1,
                methodsChanged: 4,
                dependenciesModified: 2,
                riskLevel: 'low'
              },
              documentation: {
                rationale: 'The processUserData method violates the Single Responsibility Principle by handling validation, object creation, and persistence in a single method.',
                benefits: [
                  'Improved testability - each method can be tested independently',
                  'Better maintainability - changes to validation logic don\'t affect persistence',
                  'Enhanced readability - each method has a clear, single purpose',
                  'Easier debugging - issues can be isolated to specific methods'
                ],
                risks: [
                  'Slight increase in method count',
                  'Need to ensure proper error handling across methods',
                  'Potential for over-engineering if methods become too granular'
                ],
                alternatives: [
                  'Use Builder pattern for User creation',
                  'Implement validation using annotations',
                  'Use Command pattern for user operations'
                ],
                testingStrategy: 'Create unit tests for each extracted method, integration tests for the main flow, and mock the repository for isolated testing.'
              }
            }}
            onExport={() => console.log('Export documentation')}
            onShare={() => console.log('Share documentation')}
          />
        );
      case 'impact':
        return (
          <ImpactAnalysis
            refactoringPlan={{
              steps: [
                {
                  id: 'step-1',
                  title: 'Extract Large Method',
                  impact: {
                    filesAffected: 1,
                    methodsChanged: 4,
                    dependenciesModified: 2,
                    riskLevel: 'low'
                  }
                },
                {
                  id: 'step-2',
                  title: 'Extract Constants',
                  impact: {
                    filesAffected: 1,
                    methodsChanged: 1,
                    dependenciesModified: 0,
                    riskLevel: 'low'
                  }
                }
              ],
              overallImpact: {
                totalFiles: 1,
                totalMethods: 4,
                complexityReduction: 25,
                maintainabilityImprovement: 40,
                performanceImpact: 'positive'
              }
            }}
            onExport={() => console.log('Export impact analysis')}
            onShare={() => console.log('Share impact analysis')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleBack}
              className="p-2 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">Enhanced Refactoring</h1>
              <p className="text-sm text-slate-400">
                File: <span className="text-blue-400 font-mono">{selectedFile}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 text-slate-400 hover:text-white transition-colors"
            >
              {showSidebar ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center">
              <Save className="w-4 h-4 mr-2" />
              Save Progress
            </button>
            <button className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center">
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        {showSidebar && (
          <div className="w-64 bg-slate-800 border-r border-slate-700 p-4">
            <h3 className="text-white font-semibold mb-4">Refactoring Tools</h3>
            <nav className="space-y-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {tab.icon}
                  <span className="text-sm">{tab.label}</span>
                </button>
              ))}
            </nav>

            {/* Quick Stats */}
            <div className="mt-8">
              <h4 className="text-white font-semibold mb-3">Quick Stats</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Code Smells:</span>
                  <span className="text-red-400">{codeSmells.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Lines of Code:</span>
                  <span className="text-blue-400">{fileContent.split('\n').length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Complexity:</span>
                  <span className="text-yellow-400">8.5</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Dependencies:</span>
                  <span className="text-purple-400">3</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 p-6">
          {getTabContent()}
        </div>
      </div>
    </div>
  );
}
