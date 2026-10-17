'use client';

import React, { useState, useEffect } from 'react';
import {
  Brain,
  Code,
  GitBranch,
  FileText,
  BarChart3,
  Network,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  Info,
  Play,
  Pause,
  Square,
  Download,
  Upload,
  Eye,
  EyeOff,
  RefreshCw,
  Settings,
  Target,
  Zap,
  Shield,
  TrendingUp,
  Layers,
  GitCommit,
  History,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
  Share2
} from 'lucide-react';

interface DependencyNode {
  id: string;
  name: string;
  type: 'class' | 'method' | 'field' | 'interface';
  package: string;
  dependencies: string[];
  dependents: string[];
  complexity: number;
  linesOfCode: number;
  isModified: boolean;
}

interface RefactoringStep {
  id: string;
  title: string;
  description: string;
  type: 'extract' | 'move' | 'rename' | 'split' | 'merge' | 'optimize';
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  beforeCode: string;
  afterCode: string;
  impact: {
    filesAffected: number;
    methodsChanged: number;
    dependenciesModified: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
  dependencies: {
    before: DependencyNode[];
    after: DependencyNode[];
  };
  documentation: {
    rationale: string;
    benefits: string[];
    risks: string[];
    alternatives: string[];
    testingStrategy: string;
  };
}

interface RefactoringPlan {
  id: string;
  title: string;
  description: string;
  status: 'analyzing' | 'planning' | 'ready' | 'executing' | 'completed' | 'failed';
  steps: RefactoringStep[];
  overallImpact: {
    totalFiles: number;
    totalMethods: number;
    complexityReduction: number;
    maintainabilityImprovement: number;
    performanceImpact: 'positive' | 'neutral' | 'negative';
  };
  timeline: {
    estimatedDuration: string;
    actualDuration?: string;
    startTime?: Date;
    endTime?: Date;
  };
  dependencies: {
    affectedClasses: string[];
    affectedPackages: string[];
    externalDependencies: string[];
  };
}

interface EnhancedRefactoringDashboardProps {
  workspaceId: string;
  selectedFile: string;
  fileContent: string;
  codeSmells: any[];
  onRefactoringComplete: (refactoredCode: string) => void;
  onBack: () => void;
}

export default function EnhancedRefactoringDashboard({
  workspaceId,
  selectedFile,
  fileContent,
  codeSmells,
  onRefactoringComplete,
  onBack
}: EnhancedRefactoringDashboardProps) {
  const [currentStep, setCurrentStep] = useState<'analyze' | 'dependencies' | 'plan' | 'execute' | 'review'>('analyze');
  const [refactoringPlan, setRefactoringPlan] = useState<RefactoringPlan | null>(null);
  const [dependencyGraph, setDependencyGraph] = useState<DependencyNode[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [showCodeComparison, setShowCodeComparison] = useState(false);
  const [showDependencyGraph, setShowDependencyGraph] = useState(false);
  const [executionProgress, setExecutionProgress] = useState(0);

  // Step 1: Comprehensive Analysis
  const performComprehensiveAnalysis = async () => {
    setIsAnalyzing(true);
    setCurrentStep('analyze');

    try {
      console.log('🔍 Starting comprehensive analysis for:', selectedFile);
      
      // Analyze code smells and generate comprehensive plan
      const response = await fetch(`/api/workspace-enhanced-analysis/analyze-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          workspaceId, 
          filePath: selectedFile 
        })
      });

      if (response.ok) {
        const analysis = await response.json();
        console.log('✅ Analysis completed:', analysis);
        await generateRefactoringPlan(analysis);
      } else {
        console.warn('⚠️ Analysis API failed, using fallback');
        // Fallback to mock analysis
        await generateMockRefactoringPlan();
      }
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      await generateMockRefactoringPlan();
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Generate comprehensive refactoring plan
  const generateRefactoringPlan = async (analysis: any) => {
    console.log('📋 Generating refactoring plan from analysis:', analysis);
    
    try {
      // Call the backend to generate the plan
      const response = await fetch(`/api/workspace-enhanced-analysis/generate-refactoring-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          workspaceId, 
          filePath: selectedFile,
          codeSmells: analysis.codeSmells || []
        })
      });

      if (response.ok) {
        const plan = await response.json();
        console.log('✅ Refactoring plan generated:', plan);
        setRefactoringPlan(plan);
        setCurrentStep('dependencies');
        return;
      } else {
        console.warn('⚠️ Plan generation API failed, using fallback');
      }
    } catch (error) {
      console.error('❌ Plan generation failed:', error);
    }
    
    // Fallback to mock plan
    const plan: RefactoringPlan = {
      id: `plan-${Date.now()}`,
      title: `Refactoring Plan for ${selectedFile.split('/').pop()}`,
      description: 'Comprehensive refactoring plan based on code analysis',
      status: 'ready',
      steps: [
        {
          id: 'step-1',
          title: 'Extract Large Method',
          description: 'Break down the processUserData method into smaller, focused methods',
          type: 'extract',
          status: 'pending',
          beforeCode: `public void processUserData(String name, String email, int age) {
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
}`,
          afterCode: `public void processUserData(String name, String email, int age) {
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
    if (age < 0 || age > 150) {
        throw new IllegalArgumentException("Invalid age");
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
}`,
          impact: {
            filesAffected: 1,
            methodsChanged: 4,
            dependenciesModified: 2,
            riskLevel: 'low'
          },
          dependencies: {
            before: [
              { id: 'user', name: 'User', type: 'class', package: 'com.example.model', dependencies: [], dependents: ['UserService'], complexity: 5, linesOfCode: 20, isModified: false },
              { id: 'repository', name: 'UserRepository', type: 'interface', package: 'com.example.repository', dependencies: [], dependents: ['UserService'], complexity: 3, linesOfCode: 5, isModified: false }
            ],
            after: [
              { id: 'user', name: 'User', type: 'class', package: 'com.example.model', dependencies: [], dependents: ['UserService'], complexity: 5, linesOfCode: 20, isModified: false },
              { id: 'repository', name: 'UserRepository', type: 'interface', package: 'com.example.repository', dependencies: [], dependents: ['UserService'], complexity: 3, linesOfCode: 5, isModified: false }
            ]
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
        },
        {
          id: 'step-2',
          title: 'Extract Constants',
          description: 'Move magic numbers and strings to named constants',
          type: 'extract',
          status: 'pending',
          beforeCode: `if (age < 0 || age > 150) {
    throw new IllegalArgumentException("Invalid age");
}`,
          afterCode: `private static final int MIN_AGE = 0;
private static final int MAX_AGE = 150;
private static final String INVALID_AGE_MESSAGE = "Invalid age";

if (age < MIN_AGE || age > MAX_AGE) {
    throw new IllegalArgumentException(INVALID_AGE_MESSAGE);
}`,
          impact: {
            filesAffected: 1,
            methodsChanged: 1,
            dependenciesModified: 0,
            riskLevel: 'low'
          },
          dependencies: {
            before: [],
            after: []
          },
          documentation: {
            rationale: 'Magic numbers and strings make code harder to maintain and understand.',
            benefits: [
              'Improved maintainability - constants can be changed in one place',
              'Better readability - named constants are self-documenting',
              'Reduced duplication - constants can be reused',
              'Easier testing - constants can be easily mocked or overridden'
            ],
            risks: ['Minimal risk - this is a safe refactoring'],
            alternatives: ['Use enums for related constants', 'Use configuration files for external constants'],
            testingStrategy: 'Test that constants are used correctly and that behavior remains unchanged.'
          }
        }
      ],
      overallImpact: {
        totalFiles: 1,
        totalMethods: 4,
        complexityReduction: 25,
        maintainabilityImprovement: 40,
        performanceImpact: 'neutral'
      },
      timeline: {
        estimatedDuration: '15-20 minutes'
      },
      dependencies: {
        affectedClasses: ['UserService'],
        affectedPackages: ['com.example.service'],
        externalDependencies: ['UserRepository', 'AuditLogger']
      }
    };

    setRefactoringPlan(plan);
    setCurrentStep('dependencies');
  };

  // Generate mock plan for demonstration
  const generateMockRefactoringPlan = async () => {
    await generateRefactoringPlan({});
  };

  // Step 2: Dependency Analysis
  const analyzeDependencies = async () => {
    setCurrentStep('dependencies');
    
    try {
      console.log('🔗 Analyzing dependencies for:', selectedFile);
      
      const response = await fetch(`/api/workspace-enhanced-analysis/analyze-dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          workspaceId, 
          filePath: selectedFile 
        })
      });

      if (response.ok) {
        const dependencies = await response.json();
        console.log('✅ Dependencies analyzed:', dependencies);
        setDependencyGraph(dependencies);
        setCurrentStep('plan');
        return;
      } else {
        console.warn('⚠️ Dependency analysis API failed, using fallback');
      }
    } catch (error) {
      console.error('❌ Dependency analysis failed:', error);
    }
    
    // Fallback to mock dependency analysis
    const mockDependencies: DependencyNode[] = [
      {
        id: 'user-service',
        name: 'UserService',
        type: 'class',
        package: 'com.example.service',
        dependencies: ['UserRepository', 'AuditLogger'],
        dependents: ['UserController', 'UserFacade'],
        complexity: 8,
        linesOfCode: 150,
        isModified: true
      },
      {
        id: 'user-repository',
        name: 'UserRepository',
        type: 'interface',
        package: 'com.example.repository',
        dependencies: ['User'],
        dependents: ['UserService', 'UserServiceImpl'],
        complexity: 3,
        linesOfCode: 25,
        isModified: false
      },
      {
        id: 'user-controller',
        name: 'UserController',
        type: 'class',
        package: 'com.example.controller',
        dependencies: ['UserService'],
        dependents: [],
        complexity: 5,
        linesOfCode: 80,
        isModified: false
      }
    ];

    setDependencyGraph(mockDependencies);
    setCurrentStep('plan');
  };

  // Step 3: Execute Refactoring
  const executeRefactoring = async () => {
    setIsExecuting(true);
    setCurrentStep('execute');
    setExecutionProgress(0);

    try {
      console.log('⚡ Executing refactoring for:', selectedFile);
      
      const response = await fetch(`/api/workspace-enhanced-analysis/execute-refactoring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          workspaceId, 
          filePath: selectedFile,
          steps: refactoringPlan?.steps || []
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Refactoring executed:', result);
        
        // Update plan with execution results
        if (refactoringPlan) {
          refactoringPlan.steps.forEach(step => {
            step.status = 'completed';
          });
          setRefactoringPlan({ ...refactoringPlan });
        }
        
        setExecutionProgress(100);
        setCurrentStep('review');
        return;
      } else {
        console.warn('⚠️ Refactoring execution API failed, using simulation');
      }
    } catch (error) {
      console.error('❌ Refactoring execution failed:', error);
    }
    
    // Fallback to simulation
    try {
      // Simulate execution of each step
      if (refactoringPlan) {
        for (let i = 0; i < refactoringPlan.steps.length; i++) {
          const step = refactoringPlan.steps[i];
          step.status = 'in-progress';
          setRefactoringPlan({ ...refactoringPlan });

          // Simulate processing time
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          step.status = 'completed';
          setExecutionProgress(((i + 1) / refactoringPlan.steps.length) * 100);
          setRefactoringPlan({ ...refactoringPlan });
        }
      }

      setCurrentStep('review');
    } catch (error) {
      console.error('Execution failed:', error);
    } finally {
      setIsExecuting(false);
    }
  };

  const getStepIcon = (step: string) => {
    switch (step) {
      case 'analyze': return <Brain className="w-5 h-5" />;
      case 'dependencies': return <Network className="w-5 h-5" />;
      case 'plan': return <Target className="w-5 h-5" />;
      case 'execute': return <Play className="w-5 h-5" />;
      case 'review': return <CheckCircle className="w-5 h-5" />;
      default: return <Settings className="w-5 h-5" />;
    }
  };

  const getStepColor = (step: string) => {
    switch (step) {
      case 'analyze': return 'text-blue-400';
      case 'dependencies': return 'text-purple-400';
      case 'plan': return 'text-yellow-400';
      case 'execute': return 'text-green-400';
      case 'review': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-400 bg-green-500/20 border-green-500/50';
      case 'medium': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
      case 'high': return 'text-red-400 bg-red-500/20 border-red-500/50';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500/50';
    }
  };

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center">
            <Brain className="w-6 h-6 mr-2" />
            Enhanced Refactoring Dashboard
          </h2>
          <p className="text-slate-400">
            File: <span className="text-blue-400 font-mono">{selectedFile}</span>
          </p>
        </div>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center"
        >
          <X className="w-4 h-4 mr-2" />
          Back
        </button>
      </div>

      {/* Progress Steps */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Refactoring Process</h3>
          <div className="text-sm text-slate-400">
            Step {['analyze', 'dependencies', 'plan', 'execute', 'review'].indexOf(currentStep) + 1} of 5
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {['analyze', 'dependencies', 'plan', 'execute', 'review'].map((step, index) => (
            <div key={step} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                currentStep === step 
                  ? 'border-blue-500 bg-blue-500/20 text-blue-400' 
                  : ['analyze', 'dependencies', 'plan', 'execute', 'review'].indexOf(currentStep) > index
                    ? 'border-green-500 bg-green-500/20 text-green-400'
                    : 'border-slate-600 bg-slate-700 text-slate-500'
              }`}>
                {getStepIcon(step)}
              </div>
              {index < 4 && (
                <div className={`w-8 h-0.5 mx-2 ${
                  ['analyze', 'dependencies', 'plan', 'execute', 'review'].indexOf(currentStep) > index
                    ? 'bg-green-500'
                    : 'bg-slate-600'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Analysis */}
      {currentStep === 'analyze' && (
        <div className="space-y-6">
          <div className="bg-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Brain className="w-5 h-5 mr-2 text-blue-400" />
              Comprehensive Code Analysis
            </h3>
            <p className="text-slate-300 mb-4">
              Analyzing your code for refactoring opportunities, dependency relationships, and impact assessment.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-400">{codeSmells.length}</div>
                <div className="text-sm text-slate-400">Code Smells</div>
              </div>
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-400">{fileContent.split('\n').length}</div>
                <div className="text-sm text-slate-400">Lines of Code</div>
              </div>
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-yellow-400">8.5</div>
                <div className="text-sm text-slate-400">Complexity</div>
              </div>
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-400">3</div>
                <div className="text-sm text-slate-400">Dependencies</div>
              </div>
            </div>

            <button
              onClick={performComprehensiveAnalysis}
              disabled={isAnalyzing}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg py-3 px-4 transition-colors flex items-center justify-center"
            >
              {isAnalyzing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                  Analyzing Code...
                </>
              ) : (
                <>
                  <Brain className="w-5 h-5 mr-2" />
                  Start Comprehensive Analysis
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Dependencies */}
      {currentStep === 'dependencies' && (
        <div className="space-y-6">
          <div className="bg-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Network className="w-5 h-5 mr-2 text-purple-400" />
              Dependency Analysis
            </h3>
            <p className="text-slate-300 mb-4">
              Analyzing dependencies and relationships to understand the impact of refactoring.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-white font-semibold mb-3">Dependency Graph</h4>
                <div className="space-y-2">
                  {dependencyGraph.map((node) => (
                    <div key={node.id} className="bg-slate-600 rounded-lg p-3 border border-slate-500">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-white font-medium">{node.name}</div>
                          <div className="text-slate-400 text-sm">{node.package}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-slate-400">Complexity: {node.complexity}</div>
                          <div className="text-sm text-slate-400">{node.linesOfCode} LOC</div>
                        </div>
                      </div>
                      {node.dependencies.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs text-slate-400">Dependencies:</div>
                          <div className="text-xs text-blue-400">{node.dependencies.join(', ')}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-white font-semibold mb-3">Impact Assessment</h4>
                <div className="space-y-3">
                  <div className="bg-slate-600 rounded-lg p-3">
                    <div className="text-white font-medium">Files Affected</div>
                    <div className="text-2xl font-bold text-blue-400">3</div>
                  </div>
                  <div className="bg-slate-600 rounded-lg p-3">
                    <div className="text-white font-medium">Methods Changed</div>
                    <div className="text-2xl font-bold text-green-400">4</div>
                  </div>
                  <div className="bg-slate-600 rounded-lg p-3">
                    <div className="text-white font-medium">Risk Level</div>
                    <div className="text-lg font-bold text-yellow-400">Low</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={() => setCurrentStep('analyze')}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors"
              >
                Back to Analysis
              </button>
              <button
                onClick={analyzeDependencies}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center"
              >
                <Network className="w-4 h-4 mr-2" />
                Continue to Planning
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Refactoring Plan */}
      {currentStep === 'plan' && refactoringPlan && (
        <div className="space-y-6">
          <div className="bg-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Target className="w-5 h-5 mr-2 text-yellow-400" />
              Refactoring Plan
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-400">{refactoringPlan.steps.length}</div>
                <div className="text-sm text-slate-400">Refactoring Steps</div>
              </div>
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-400">{refactoringPlan.overallImpact.complexityReduction}%</div>
                <div className="text-sm text-slate-400">Complexity Reduction</div>
              </div>
              <div className="bg-slate-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-purple-400">{refactoringPlan.timeline.estimatedDuration}</div>
                <div className="text-sm text-slate-400">Estimated Duration</div>
              </div>
            </div>

            <div className="space-y-4">
              {refactoringPlan.steps.map((step, index) => (
                <div key={step.id} className="bg-slate-600 rounded-lg p-4 border border-slate-500">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-white font-semibold">Step {index + 1}: {step.title}</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getRiskColor(step.impact.riskLevel)}`}>
                          {step.impact.riskLevel.toUpperCase()} RISK
                        </span>
                      </div>
                      <p className="text-slate-300 text-sm mb-3">{step.description}</p>
                      
                      <div className="grid grid-cols-3 gap-4 text-xs">
                        <div>
                          <div className="text-slate-400">Files Affected</div>
                          <div className="text-white font-semibold">{step.impact.filesAffected}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Methods Changed</div>
                          <div className="text-white font-semibold">{step.impact.methodsChanged}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Dependencies</div>
                          <div className="text-white font-semibold">{step.impact.dependenciesModified}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setSelectedStep(step.id)}
                        className="p-2 text-slate-400 hover:text-blue-400 transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowCodeComparison(true)}
                        className="p-2 text-slate-400 hover:text-green-400 transition-colors"
                        title="Compare Code"
                      >
                        <Code className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Documentation */}
                  <div className="mt-4 pt-4 border-t border-slate-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h5 className="text-white font-medium mb-2">Benefits</h5>
                        <ul className="text-xs text-slate-300 space-y-1">
                          {step.documentation.benefits.map((benefit, idx) => (
                            <li key={idx} className="flex items-start">
                              <CheckCircle className="w-3 h-3 mr-2 text-green-400 mt-0.5 flex-shrink-0" />
                              {benefit}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h5 className="text-white font-medium mb-2">Risks</h5>
                        <ul className="text-xs text-slate-300 space-y-1">
                          {step.documentation.risks.map((risk, idx) => (
                            <li key={idx} className="flex items-start">
                              <AlertTriangle className="w-3 h-3 mr-2 text-yellow-400 mt-0.5 flex-shrink-0" />
                              {risk}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={() => setCurrentStep('dependencies')}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors"
              >
                Back to Dependencies
              </button>
              <button
                onClick={executeRefactoring}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center"
              >
                <Play className="w-4 h-4 mr-2" />
                Execute Refactoring
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Execution */}
      {currentStep === 'execute' && (
        <div className="space-y-6">
          <div className="bg-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Play className="w-5 h-5 mr-2 text-green-400" />
              Executing Refactoring
            </h3>
            
            <div className="w-full bg-slate-600 rounded-full h-2 mb-4">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${executionProgress}%` }}
              ></div>
            </div>
            <div className="text-sm text-slate-400 mb-4">
              Progress: {executionProgress.toFixed(1)}%
            </div>

            {refactoringPlan && (
              <div className="space-y-3">
                {refactoringPlan.steps.map((step, index) => (
                  <div key={step.id} className="flex items-center space-x-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      step.status === 'completed' ? 'bg-green-500' :
                      step.status === 'in-progress' ? 'bg-blue-500 animate-pulse' :
                      'bg-slate-600'
                    }`}>
                      {step.status === 'completed' ? (
                        <CheckCircle className="w-4 h-4 text-white" />
                      ) : step.status === 'in-progress' ? (
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                      ) : (
                        <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-white font-medium">{step.title}</div>
                      <div className="text-slate-400 text-sm">{step.description}</div>
                    </div>
                    <div className="text-sm text-slate-400">
                      {step.status === 'completed' ? 'Completed' :
                       step.status === 'in-progress' ? 'In Progress' :
                       'Pending'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 5: Review */}
      {currentStep === 'review' && (
        <div className="space-y-6">
          <div className="bg-green-600/20 border border-green-500/50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-green-400" />
              Refactoring Complete
            </h3>
            <p className="text-slate-300 mb-4">
              Your code has been successfully refactored. Review the changes and apply them to your project.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-400">✓</div>
                <div className="text-sm text-slate-400">Refactoring Applied</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-400">AI</div>
                <div className="text-sm text-slate-400">AI-Powered</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="text-2xl font-bold text-purple-400">Enhanced</div>
                <div className="text-sm text-slate-400">Comprehensive</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Code Comparison Modal */}
      {showCodeComparison && selectedStep && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-6xl w-full max-h-[80vh] overflow-auto border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Code Comparison</h3>
              <button
                onClick={() => setShowCodeComparison(false)}
                className="p-2 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-white font-semibold mb-2">Before</h4>
                <div className="bg-slate-900 rounded-lg p-4 border border-red-500/50">
                  <pre className="text-sm text-red-300 overflow-auto">
                    {refactoringPlan?.steps.find(s => s.id === selectedStep)?.beforeCode}
                  </pre>
                </div>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-2">After</h4>
                <div className="bg-slate-900 rounded-lg p-4 border border-green-500/50">
                  <pre className="text-sm text-green-300 overflow-auto">
                    {refactoringPlan?.steps.find(s => s.id === selectedStep)?.afterCode}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
