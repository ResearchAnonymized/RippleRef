'use client';

import { useState, useEffect } from 'react';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  BarChart3, 
  Filter, 
  Search, 
  Download, 
  RefreshCw,
  Eye,
  EyeOff,
  Settings,
  FileText,
  Lock,
  Key,
  Database,
  Globe,
  Cpu,
  Layers,
  Brain,
  Zap,
  Cloud,
  Smartphone,
  Loader2,
  List,
  Grid,
  ChevronLeft,
  ChevronRight,
  X,
  SortAsc,
  SortDesc,
  Info,
  BookOpen,
  Lightbulb,
  ExternalLink,
  Play,
  Copy,
  Check
} from 'lucide-react';

interface SecurityVulnerability {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  filePath: string;
  lineNumber: number;
  codeSnippet: string;
  description: string;
  recommendation: string;
  cweId: string;
  owaspCategory: string;
  detectedAt: string;
  status: 'open' | 'reviewed' | 'fixed' | 'false_positive';
  cvssScore?: number;
  businessImpact?: string;
  technicalImpact?: string;
  exploitability?: string;
  remediationEffort?: string;
}

interface SecurityAnalysisDashboardProps {
  workspaceId: string;
  onVulnerabilitySelect?: (vulnerability: SecurityVulnerability) => void;
}

export default function SecurityAnalysisDashboard({ 
  workspaceId, 
  onVulnerabilitySelect 
}: SecurityAnalysisDashboardProps) {
  console.log('SecurityAnalysisDashboard component initialized with workspaceId:', workspaceId);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showVulnerabilities, setShowVulnerabilities] = useState(true);
  const [showCompliance, setShowCompliance] = useState(true);
  const [showRemediation, setShowRemediation] = useState(true);
  const [selectedVulnerabilityType, setSelectedVulnerabilityType] = useState<string>('all');
  const [analysisLevel, setAnalysisLevel] = useState<'project' | 'file'>('project');
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [fileAnalysisResult, setFileAnalysisResult] = useState<any>(null);
  const [projectFiles, setProjectFiles] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // File Browser Controls
  const [currentPage, setCurrentPage] = useState(1);
  const [filesPerPage] = useState(20);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all');
  const [showFileDialog, setShowFileDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [showOnlyVulnerableFiles, setShowOnlyVulnerableFiles] = useState(false);
  const [showFileViewer, setShowFileViewer] = useState(false);
  const [selectedFileContent, setSelectedFileContent] = useState<string>('');
  const [fileVulnerabilities, setFileVulnerabilities] = useState<any[]>([]);
  const [showVulnerabilityDetails, setShowVulnerabilityDetails] = useState(false);
  const [selectedVulnerability, setSelectedVulnerability] = useState<any>(null);
  const [showSecurityGuide, setShowSecurityGuide] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string>('');

  // Load security assessment data
  useEffect(() => {
    console.log('SecurityAnalysisDashboard useEffect called with workspaceId:', workspaceId);
    loadSecurityAssessment();
    loadProjectFiles();
  }, [workspaceId]);

  const loadSecurityAssessment = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/workspaces/${workspaceId}/security`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
      const data = await response.json();
      setAssessment(data);
      } else {
        setError('Failed to load security assessment');
      }
    } catch (error) {
      console.error('Error loading security assessment:', error);
      setError('Error loading security assessment');
    } finally {
      setLoading(false);
    }
  };

  const loadProjectFiles = async () => {
    try {
      console.log('Loading files for workspace:', workspaceId);
      const response = await fetch(`/api/workspaces/${workspaceId}/files`);
      console.log('Files response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('Files data:', data);
        console.log('Number of files:', Array.isArray(data) ? data.length : (data.files ? data.files.length : 0));
        setProjectFiles(Array.isArray(data) ? data : (data.files || []));
      }
    } catch (error) {
      console.error('Error loading project files:', error);
    }
  };

  const handleVulnerabilitySelect = (vulnerability: SecurityVulnerability) => {
    setSelectedVulnerability(vulnerability);
    setShowDetails(true);
    onVulnerabilitySelect?.(vulnerability);
  };

  const analyzeSpecificFile = async (filePath?: string, file?: any) => {
    const targetFilePath = filePath || selectedFilePath;
    if (!targetFilePath || !workspaceId) return;
    
    setIsAnalyzing(true);
    setFileAnalysisResult(null);
    setSelectedFile(file);
    setShowFileDialog(true);
    
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/files/security?filePath=${encodeURIComponent(targetFilePath)}`);
      
      if (response.ok) {
        const result = await response.json();
        setFileAnalysisResult(result);
      } else {
        console.error('File analysis failed:', response.statusText);
      }
    } catch (error) {
      console.error('Error analyzing file:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // File Browser Helper Functions
  const getFilteredFiles = () => {
    let filtered = projectFiles.filter(file => {
      const matchesSearch = !searchTerm || 
        (file.relativePath && file.relativePath.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (file.name && file.name.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesType = fileTypeFilter === 'all' || 
        (file.relativePath && file.relativePath.endsWith(`.${fileTypeFilter}`));
      
      const isJavaFile = file.relativePath && file.relativePath.endsWith('.java');
      
      // Filter for vulnerable files if enabled
      const isVulnerable = !showOnlyVulnerableFiles || 
        (assessment?.vulnerabilities || []).some((vuln: any) => 
          vuln.filePath === file.relativePath
        );
      
      return matchesSearch && matchesType && isJavaFile && isVulnerable;
    });

    // Sort files
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'name':
          aValue = (a.name || a.relativePath.split('/').pop() || '').toLowerCase();
          bValue = (b.name || b.relativePath.split('/').pop() || '').toLowerCase();
          break;
        case 'size':
          aValue = a.size || 0;
          bValue = b.size || 0;
          break;
        case 'modified':
          aValue = new Date(a.modified || 0).getTime();
          bValue = new Date(b.modified || 0).getTime();
          break;
        default:
          return 0;
      }
      
      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    return filtered;
  };

  const getPaginatedFiles = () => {
    const filtered = getFilteredFiles();
    const startIndex = (currentPage - 1) * filesPerPage;
    const endIndex = startIndex + filesPerPage;
    return filtered.slice(startIndex, endIndex);
  };

  const getTotalPages = () => {
    return Math.ceil(getFilteredFiles().length / filesPerPage);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleSort = (newSortBy: 'name' | 'size' | 'modified') => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  const closeFileDialog = () => {
    setShowFileDialog(false);
    setSelectedFile(null);
    setFileAnalysisResult(null);
  };

  const viewFile = async (file: any) => {
    try {
      setSelectedFile(file);
      setShowFileViewer(true);
      
      // Get file content using the existing endpoint
      const response = await fetch(`/api/workspaces/${workspaceId}/files/content?filePath=${encodeURIComponent(file.relativePath)}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedFileContent(data.content || '');
      } else {
        console.error('Failed to fetch file content:', response.status);
        setSelectedFileContent('Error loading file content');
      }
      
      // Get vulnerabilities for this file
      const fileVulns = (assessment?.vulnerabilities || []).filter((vuln: any) => 
        vuln.filePath === file.relativePath
      );
      setFileVulnerabilities(fileVulns);
    } catch (error) {
      console.error('Error loading file:', error);
      setSelectedFileContent('Error loading file content');
    }
  };

  const closeFileViewer = () => {
    setShowFileViewer(false);
    setSelectedFile(null);
    setSelectedFileContent('');
    setFileVulnerabilities([]);
  };

  const getVulnerabilityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'bg-red-200 border-red-500 text-red-900 shadow-red-200';
      case 'high': return 'bg-orange-200 border-orange-500 text-orange-900 shadow-orange-200';
      case 'medium': return 'bg-yellow-200 border-yellow-500 text-yellow-900 shadow-yellow-200';
      case 'low': return 'bg-blue-200 border-blue-500 text-blue-900 shadow-blue-200';
      default: return 'bg-gray-200 border-gray-500 text-gray-900 shadow-gray-200';
    }
  };

  const getVulnerabilityExplanation = (type: string) => {
    const explanations: { [key: string]: { title: string; description: string; impact: string; example: string; fix: string } } = {
      'SQL Injection': {
        title: 'SQL Injection Vulnerability',
        description: 'SQL injection occurs when user input is directly concatenated into SQL queries without proper sanitization or parameterization.',
        impact: 'Attackers can execute arbitrary SQL commands, access/modify database data, bypass authentication, and potentially gain system access.',
        example: 'String query = "SELECT * FROM users WHERE id = " + userId; // VULNERABLE\nStatement stmt = conn.createStatement();\nResultSet rs = stmt.executeQuery(query);',
        fix: 'PreparedStatement stmt = conn.prepareStatement("SELECT * FROM users WHERE id = ?");\nstmt.setString(1, userId);\nResultSet rs = stmt.executeQuery();'
      },
      'Unsafe Reflection': {
        title: 'Unsafe Reflection Usage',
        description: 'Reflection allows runtime access to private fields, methods, and constructors, which can be exploited if user input controls reflection targets.',
        impact: 'Attackers can access private data, invoke private methods, bypass access controls, and potentially execute arbitrary code.',
        example: 'Field field = obj.getClass().getDeclaredField(userInput); // VULNERABLE\nfield.setAccessible(true);\nObject value = field.get(obj);',
        fix: '// Use allowlist validation\nif (ALLOWED_FIELDS.contains(fieldName)) {\n    Field field = obj.getClass().getDeclaredField(fieldName);\n    field.setAccessible(true);\n    Object value = field.get(obj);\n}'
      },
      'Command Injection': {
        title: 'Command Injection Vulnerability',
        description: 'Command injection occurs when user input is directly passed to system commands without proper validation or sanitization.',
        impact: 'Attackers can execute arbitrary system commands, access file systems, install malware, and gain complete system control.',
        example: 'Runtime.getRuntime().exec("ping " + userInput); // VULNERABLE',
        fix: '// Validate and sanitize input\nif (userInput.matches("^[0-9.]+$")) {\n    Runtime.getRuntime().exec("ping " + userInput);\n} else {\n    throw new IllegalArgumentException("Invalid IP address");\n}'
      },
      'Weak Cryptography': {
        title: 'Weak Cryptographic Algorithm',
        description: 'Using weak or deprecated cryptographic algorithms that are vulnerable to attacks or have known security flaws.',
        impact: 'Encrypted data can be easily cracked, authentication can be bypassed, and data integrity cannot be guaranteed.',
        example: 'MessageDigest md = MessageDigest.getInstance("MD5"); // VULNERABLE\nbyte[] hash = md.digest(password.getBytes());',
        fix: 'MessageDigest md = MessageDigest.getInstance("SHA-256"); // SECURE\nbyte[] hash = md.digest(password.getBytes());'
      },
      'Hardcoded Credentials': {
        title: 'Hardcoded Credentials',
        description: 'Sensitive credentials like passwords, API keys, or tokens are hardcoded directly in the source code.',
        impact: 'Credentials are exposed in source code, version control, and compiled binaries, leading to unauthorized access.',
        example: 'String password = "admin123"; // VULNERABLE\nString apiKey = "sk-1234567890abcdef";',
        fix: 'String password = System.getenv("DB_PASSWORD");\nString apiKey = System.getProperty("api.key");\n// Or use secure configuration management'
      }
    };
    
    return explanations[type] || {
      title: type,
      description: 'Security vulnerability detected in your code.',
      impact: 'This vulnerability could be exploited by attackers.',
      example: 'Vulnerable code pattern detected.',
      fix: 'Please review and fix the identified security issue.'
    };
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(label);
      setTimeout(() => setCopiedCode(''), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const openVulnerabilityDetails = (vulnerability: any) => {
    setSelectedVulnerability(vulnerability);
    setShowVulnerabilityDetails(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading security assessment...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-4" />
        <p className="text-red-600">Error loading security assessment: {error}</p>
      </div>
    );
  }

  if (!assessment || assessment.overallRiskScore === undefined) {
    return (
      <div className="text-center py-12">
        <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-600 mb-2">No Security Assessment Available</h3>
        <p className="text-gray-500">Run a security analysis to view vulnerabilities and compliance status.</p>
      </div>
    );
  }

  const filteredVulnerabilities = (assessment?.vulnerabilities || []).filter((vuln: SecurityVulnerability) => {
    const severityMatch = selectedSeverity === 'all' || vuln.severity === selectedSeverity;
    const categoryMatch = selectedCategory === 'all' || (vuln.category || '').toLowerCase().includes(selectedCategory.toLowerCase());
    const typeMatch = selectedVulnerabilityType === 'all' || (vuln.type || '').toLowerCase().includes(selectedVulnerabilityType.toLowerCase());
    const searchMatch = !searchTerm || 
      (vuln.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (vuln.filePath || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (vuln.type || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    return severityMatch && categoryMatch && typeMatch && searchMatch;
  });

  return (
    <div className="space-y-6">
      {/* Analysis Level Toggle */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-semibold text-gray-900">Security Analysis</h2>
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setAnalysisLevel('project')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                analysisLevel === 'project'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Project Level
            </button>
            <button
              onClick={() => setAnalysisLevel('file')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                analysisLevel === 'file'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              File Level
            </button>
          </div>
        </div>
      </div>

      {/* Project Level Analysis */}
      {analysisLevel === 'project' && (
        <>
      {/* Security Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Security Grade</p>
                  <p className="text-3xl font-bold text-blue-600">{assessment?.securityGrade || 'N/A'}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">Overall Security Status</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Risk Score</p>
                  <p className="text-3xl font-bold text-orange-600">{(assessment?.overallRiskScore ?? 0).toFixed(1)}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-orange-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">Out of 10.0</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">OWASP Compliance</p>
                  <p className="text-3xl font-bold text-green-600">{(assessment?.owaspCompliance ?? 0).toFixed(1)}%</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
              <p className="text-sm text-gray-500 mt-2">Security Standards</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Vulnerabilities</p>
                  <p className="text-3xl font-bold text-red-600">{assessment?.totalVulnerabilities || 0}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
              <p className="text-sm text-gray-500 mt-2">Issues Found</p>
        </div>
      </div>

          {/* Vulnerability Breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Vulnerability Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{assessment?.criticalVulnerabilities || 0}</p>
                <p className="text-sm text-red-600 font-medium">Critical</p>
          </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <p className="text-2xl font-bold text-orange-600">{assessment?.highVulnerabilities || 0}</p>
                <p className="text-sm text-orange-600 font-medium">High</p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <p className="text-2xl font-bold text-yellow-600">{assessment?.mediumVulnerabilities || 0}</p>
                <p className="text-sm text-yellow-600 font-medium">Medium</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{assessment?.lowVulnerabilities || 0}</p>
                <p className="text-sm text-blue-600 font-medium">Low</p>
              </div>
            </div>
      </div>

          {/* Run Full Project Analysis Button */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Project Security Analysis</h3>
                <p className="text-sm text-gray-600 mt-1">Run comprehensive security analysis on the entire project</p>
              </div>
              <button
                onClick={loadSecurityAssessment}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Shield className="w-4 h-4 mr-2" />
                Run Full Project Analysis
              </button>
            </div>
          </div>
        </>
      )}

      {/* File Browser Section - Enhanced with Pagination */}
      {analysisLevel === 'file' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Security File Browser</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {getFilteredFiles().length} Java files available for security analysis
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={loadProjectFiles}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </button>
                <div className="flex items-center border border-gray-300 rounded-md">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 ${viewMode === 'list' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                    title="List view"
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 ${viewMode === 'grid' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                    title="Grid view"
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            
            {/* Enhanced File Browser Controls */}
            <div className="mb-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Page {currentPage} of {getTotalPages()}
        </div>
      </div>

              <div className="flex flex-col sm:flex-row gap-4">
                {/* Search */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search Java files for security analysis..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                {/* File Type Filter */}
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <select
                    value={fileTypeFilter}
                    onChange={(e) => {
                      setFileTypeFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 min-w-[150px]"
                  >
                    <option value="all">All Types</option>
                    <option value="java">Java</option>
                    <option value="xml">XML</option>
                    <option value="properties">Properties</option>
                  </select>
                </div>
                
                {/* Vulnerable Files Filter */}
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="vulnerable-files"
                    checked={showOnlyVulnerableFiles}
                    onChange={(e) => {
                      setShowOnlyVulnerableFiles(e.target.checked);
                      setCurrentPage(1);
                    }}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="vulnerable-files" className="text-sm text-gray-700 flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-1 text-red-500" />
                    Show only vulnerable files
                  </label>
                </div>
                
                {/* Sort Options */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleSort('name')}
                    className={`flex items-center px-3 py-2 border rounded-lg transition-colors ${
                      sortBy === 'name' 
                        ? 'bg-blue-50 border-blue-200 text-blue-700' 
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Sort by Name
                    {sortBy === 'name' && (
                      sortOrder === 'asc' ? <SortAsc className="w-3 h-3 ml-1" /> : <SortDesc className="w-3 h-3 ml-1" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Enhanced File List with Pagination */}
          <div className="divide-y divide-gray-200">
            {getPaginatedFiles().length > 0 ? (
              getPaginatedFiles().map((file, index) => (
                <div
                  key={index}
                  className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => {
                    setSelectedFilePath(file.relativePath);
                    analyzeSpecificFile(file.relativePath, file);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {file.name || file.relativePath.split('/').pop()}
                        </p>
                        <p className="text-sm text-gray-500 truncate">
                          {file.relativePath}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        JAVA
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFilePath(file.relativePath);
                          analyzeSpecificFile(file.relativePath, file);
                        }}
                        disabled={isAnalyzing}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isAnalyzing && selectedFilePath === file.relativePath ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Shield className="w-3 h-3 mr-1" />
                            Analyze
                          </>
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          viewFile(file);
                        }}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        View
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No Java files found for security analysis</p>
                {searchTerm && (
                  <p className="text-sm text-gray-400 mt-2">Try adjusting your search criteria</p>
                )}
              </div>
            )}
      </div>
          
          {/* Pagination Controls */}
          {getTotalPages() > 1 && (
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Showing {((currentPage - 1) * filesPerPage) + 1} to {Math.min(currentPage * filesPerPage, getFilteredFiles().length)} of {getFilteredFiles().length} files
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  
                  {Array.from({ length: Math.min(5, getTotalPages()) }, (_, i) => {
                    const pageNum = Math.max(1, Math.min(getTotalPages() - 4, currentPage - 2)) + i;
                    if (pageNum > getTotalPages()) return null;
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`px-3 py-1 text-sm rounded-md transition-colors ${
                          currentPage === pageNum
                            ? 'bg-blue-500 text-white'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === getTotalPages()}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters and Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filter Vulnerabilities</h3>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search vulnerabilities..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 min-w-[150px]"
          >
            <option value="all">🔍 All Severities</option>
            <option value="critical" className="text-red-600 bg-red-50">🚨 Critical</option>
            <option value="high" className="text-orange-600 bg-orange-50">⚠️ High</option>
            <option value="medium" className="text-yellow-600 bg-yellow-50">⚡ Medium</option>
            <option value="low" className="text-blue-600 bg-blue-50">ℹ️ Low</option>
          </select>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 min-w-[200px]"
          >
            <option value="all" className="text-gray-900">🏷️ All Categories</option>
            <option value="INJECTION" className="text-red-600 bg-red-50">🚨 Injection</option>
            <option value="XSS" className="text-orange-600 bg-orange-50">🌐 XSS</option>
            <option value="SECURITY_MISCONFIGURATION" className="text-yellow-600 bg-yellow-50">⚙️ Security Misconfiguration</option>
            <option value="BROKEN_AUTHENTICATION" className="text-purple-600 bg-purple-50">🔐 Broken Authentication</option>
            <option value="SENSITIVE_DATA_EXPOSURE" className="text-blue-600 bg-blue-50">📊 Sensitive Data Exposure</option>
          </select>
        </div>
      </div>

      {/* Vulnerabilities List */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Security Vulnerabilities</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowVulnerabilities(!showVulnerabilities)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                title={showVulnerabilities ? "Hide vulnerabilities" : "Show vulnerabilities"}
              >
                {showVulnerabilities ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setShowCompliance(!showCompliance)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                title={showCompliance ? "Hide compliance" : "Show compliance"}
              >
                <CheckCircle className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowRemediation(!showRemediation)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                title={showRemediation ? "Hide remediation" : "Show remediation"}
              >
                <Settings className="w-4 h-4" />
              </button>
        </div>
          </div>
        </div>

        {showVulnerabilities && (
        <div className="divide-y divide-gray-200">
            {filteredVulnerabilities.length > 0 ? (
              filteredVulnerabilities.map((vulnerability: any, index: number) => (
            <div
                  key={index}
              className="p-6 hover:bg-gray-50 transition-colors border-b border-gray-100"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          vulnerability.severity === 'critical' ? 'bg-red-100 text-red-800' :
                          vulnerability.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                          vulnerability.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {vulnerability.severity?.toUpperCase() || 'UNKNOWN'}
                    </span>
                        <span className="text-sm font-medium text-gray-900">{vulnerability.type || 'Unknown Type'}</span>
                        <span className="text-sm text-gray-500">•</span>
                        <span className="text-sm text-gray-500">{vulnerability.category || 'Unknown Category'}</span>
                      </div>
                      <p className="text-gray-700 mb-2">{vulnerability.description || 'No description available'}</p>
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span className="flex items-center">
                          <FileText className="w-4 h-4 mr-1" />
                          {vulnerability.filePath || 'Unknown file'}
                    </span>
                        <span>Line {vulnerability.lineNumber || 'N/A'}</span>
                        <span>CWE: {vulnerability.cweId || 'N/A'}</span>
                        <span>OWASP: {vulnerability.owaspCategory || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                    {vulnerability.cvssScore && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        CVSS: {vulnerability.cvssScore.toFixed(1)}
                      </span>
                    )}
                      <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                  </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center">
                <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No vulnerabilities found matching your criteria</p>
              </div>
            )}
            </div>
        )}
      </div>

      {/* File Analysis Dialog Modal */}
      {showFileDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">File Security Analysis</h3>
                {selectedFile && (
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedFile.relativePath}
                  </p>
                )}
              </div>
              <button
                onClick={closeFileDialog}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {isAnalyzing ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
                    <p className="text-gray-600">Analyzing file for security vulnerabilities...</p>
                  </div>
                </div>
              ) : fileAnalysisResult ? (
                <div className="space-y-6">
                  {/* Analysis Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <div className="flex items-center">
                        <FileText className="w-5 h-5 text-blue-600 mr-2" />
                        <div>
                          <p className="text-sm text-blue-600 font-medium">File Analyzed</p>
                          <p className="text-xs text-blue-500 truncate">{fileAnalysisResult.filePath || selectedFilePath}</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                      <div className="flex items-center">
                        <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
                        <div>
                          <p className="text-sm text-red-600 font-medium">Vulnerabilities</p>
                          <p className="text-2xl font-bold text-red-700">{fileAnalysisResult.totalVulnerabilities || 0}</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <div className="flex items-center">
                        <Shield className="w-5 h-5 text-green-600 mr-2" />
                <div>
                          <p className="text-sm text-green-600 font-medium">Security Grade</p>
                          <p className="text-2xl font-bold text-green-700">{fileAnalysisResult.securityGrade || 'N/A'}</p>
                        </div>
                  </div>
                </div>
              </div>
              
                  {/* Vulnerabilities List */}
                  {fileAnalysisResult.vulnerabilities && fileAnalysisResult.vulnerabilities.length > 0 ? (
              <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-4">Detected Vulnerabilities</h4>
                      <div className="space-y-3">
                        {fileAnalysisResult.vulnerabilities.map((vuln: any, index: number) => (
                          <div key={index} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    vuln.severity === 'critical' ? 'bg-red-100 text-red-800' :
                                    vuln.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                                    vuln.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-blue-100 text-blue-800'
                                  }`}>
                                    {vuln.severity?.toUpperCase() || 'UNKNOWN'}
                    </span>
                                  <span className="text-sm font-medium text-gray-900">{vuln.type || 'Unknown Type'}</span>
                  </div>
                                <p className="text-sm text-gray-700 mb-2">{vuln.description || 'No description available'}</p>
                                <div className="flex items-center space-x-4 text-xs text-gray-500">
                                  <span>Line: {vuln.lineNumber || 'N/A'}</span>
                                  <span>CWE: {vuln.cweId || 'N/A'}</span>
                                  <span>OWASP: {vuln.owaspCategory || 'N/A'}</span>
                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-green-50 rounded-lg border border-green-200">
                      <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                      <h4 className="text-lg font-semibold text-green-800 mb-2">No Vulnerabilities Found</h4>
                      <p className="text-green-600">This file appears to be secure with no detected security issues.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No analysis results available</p>
              </div>
              )}
              </div>
              
            <div className="flex items-center justify-end p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={closeFileDialog}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Close
                  </button>
                </div>
              </div>
            </div>
      )}

      {/* File Viewer Modal with Vulnerability Highlighting */}
      {showFileViewer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">File Viewer</h3>
                {selectedFile && (
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedFile.relativePath}
                  </p>
                )}
                {fileVulnerabilities.length > 0 && (
                  <p className="text-sm text-red-600 mt-1">
                    {fileVulnerabilities.length} vulnerability(ies) found
                  </p>
                )}
              </div>
              <button
                onClick={closeFileViewer}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex h-[calc(90vh-120px)]">
              {/* File Content */}
              <div className="flex-1 overflow-auto p-6">
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
                  <pre className="text-gray-100 whitespace-pre-wrap">
                    {selectedFileContent.split('\n').map((line, index) => {
                      const lineNumber = index + 1;
                      const lineVulns = fileVulnerabilities.filter((vuln: any) => {
                        // If lineNumber is null/undefined, try to match by content patterns
                        if (!vuln.lineNumber || vuln.lineNumber === null) {
                          // Fallback: check if line contains vulnerability-related patterns
                          const lineText = line.toLowerCase();
                          const vulnType = vuln.type?.toLowerCase() || '';
                          
                          if (vulnType.includes('reflection') && 
                              (lineText.includes('getdeclaredfield') || lineText.includes('getdeclaredmethod') || 
                               lineText.includes('class.forname') || lineText.includes('setaccessible'))) {
                            return true;
                          }
                          if (vulnType.includes('sql') && lineText.includes('statement.execute')) {
                            return true;
                          }
                          if (vulnType.includes('command') && lineText.includes('runtime.exec')) {
                            return true;
                          }
                          if (vulnType.includes('cryptography') && (lineText.includes('md5') || lineText.includes('des') || lineText.includes('sha1'))) {
                            return true;
                          }
                          return false;
                        }
                        return vuln.lineNumber === lineNumber;
                      });
                      
                      return (
                        <div key={index} className={`relative ${lineVulns.length > 0 ? 'bg-red-50 border-l-4 border-red-500 pl-2' : ''}`}>
                          <span className={`text-gray-500 mr-4 select-none w-8 inline-block ${lineVulns.length > 0 ? 'font-bold text-red-700' : ''}`}>
                            {lineNumber.toString().padStart(3, ' ')}
                          </span>
                          <span 
                            className={`${
                              lineVulns.length > 0 
                                ? 'bg-red-200 text-red-900 px-2 py-1 rounded font-semibold border-2 border-red-400' 
                                : 'text-gray-100'
                            }`}
                          >
                            {line}
                          </span>
                          {lineVulns.length > 0 && (
                            <span className="ml-2 text-xs text-red-600 font-bold">
                              ⚠️ VULNERABILITY DETECTED
                            </span>
                          )}
                          {lineVulns.length > 0 && (
                            <div className="absolute right-0 top-0 flex space-x-1">
                              {lineVulns.map((vuln: any, vulnIndex: number) => (
                                <span
                                  key={vulnIndex}
                                  className={`px-2 py-1 text-xs rounded-full border-2 font-bold shadow-lg ${getVulnerabilityColor(vuln.severity)}`}
                                  title={`Line ${lineNumber}: ${vuln.type}: ${vuln.description}`}
                                >
                                  {vuln.severity?.toUpperCase()}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </pre>
        </div>
      </div>
              
              {/* Vulnerabilities Sidebar */}
              {fileVulnerabilities.length > 0 && (
                <div className="w-80 border-l border-gray-200 overflow-y-auto">
                  <div className="p-4">
                    <h4 className="font-semibold text-gray-900 mb-4">Vulnerabilities in this file</h4>
                    <div className="space-y-3">
                      {fileVulnerabilities.map((vuln: any, index: number) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-3">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className={`px-2 py-1 text-xs rounded-full border ${getVulnerabilityColor(vuln.severity)}`}>
                              {vuln.severity?.toUpperCase()}
                            </span>
                            <span className="text-sm font-medium text-gray-900">{vuln.type}</span>
                          </div>
                          <p className="text-sm text-gray-700 mb-2">{vuln.description}</p>
                          <div className="text-xs text-gray-500 space-y-1">
                            <div>Line: {vuln.lineNumber || 'Pattern-matched'}</div>
                            <div>CWE: {vuln.cweId || 'N/A'}</div>
                            <div>OWASP: {vuln.owaspCategory || 'N/A'}</div>
                            {vuln.cvssScore && <div>CVSS: {vuln.cvssScore}</div>}
                          </div>
                          {vuln.remediation && (
                            <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                              <strong>Remediation:</strong> {vuln.remediation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-end p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={closeFileViewer}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vulnerability Details Modal */}
      {showVulnerabilityDetails && selectedVulnerability && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {getVulnerabilityExplanation(selectedVulnerability.type).title}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedVulnerability.filePath} • Line {selectedVulnerability.lineNumber || 'N/A'}
                </p>
              </div>
                <button
                onClick={() => setShowVulnerabilityDetails(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                >
                <X className="w-5 h-5" />
                </button>
              </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="space-y-6">
                {/* Severity and Basic Info */}
                <div className="flex items-center space-x-4">
                  <span className={`px-3 py-1 text-sm font-semibold rounded-full border ${getVulnerabilityColor(selectedVulnerability.severity)}`}>
                    {selectedVulnerability.severity?.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-600">
                    {selectedVulnerability.category} • CVSS: {selectedVulnerability.cvssScore || 'N/A'}
                  </span>
            </div>

                {/* Description */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Description</h4>
                  <p className="text-gray-700">{getVulnerabilityExplanation(selectedVulnerability.type).description}</p>
                  </div>

                {/* Impact */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Impact</h4>
                  <p className="text-gray-700">{getVulnerabilityExplanation(selectedVulnerability.type).impact}</p>
                </div>

                {/* Vulnerable Code Example */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-900">Vulnerable Code Example</h4>
                    <button
                      onClick={() => copyToClipboard(getVulnerabilityExplanation(selectedVulnerability.type).example, 'vulnerable')}
                      className="inline-flex items-center px-2 py-1 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded transition-colors"
                    >
                      {copiedCode === 'vulnerable' ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                      {copiedCode === 'vulnerable' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <pre className="text-sm text-red-800 font-mono whitespace-pre-wrap">
                      {getVulnerabilityExplanation(selectedVulnerability.type).example}
                    </pre>
                </div>
              </div>
              
                {/* Secure Code Fix */}
              <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-900">Secure Code Fix</h4>
                    <button
                      onClick={() => copyToClipboard(getVulnerabilityExplanation(selectedVulnerability.type).fix, 'fix')}
                      className="inline-flex items-center px-2 py-1 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded transition-colors"
                    >
                      {copiedCode === 'fix' ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                      {copiedCode === 'fix' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <pre className="text-sm text-green-800 font-mono whitespace-pre-wrap">
                      {getVulnerabilityExplanation(selectedVulnerability.type).fix}
                    </pre>
                  </div>
              </div>
              
                {/* Additional Resources */}
              <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Additional Resources</h4>
                  <div className="space-y-2">
                    <a 
                      href="https://owasp.org/www-project-top-ten/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      OWASP Top 10
                    </a>
                    <a 
                      href="https://cwe.mitre.org/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 ml-4"
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      CWE Database
                    </a>
                  </div>
                </div>
              </div>
              </div>
              
            <div className="flex items-center justify-end p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowVulnerabilityDetails(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security Guide Modal */}
      {showSecurityGuide && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <BookOpen className="w-5 h-5 mr-2" />
                  Security Best Practices Guide
                </h3>
                <p className="text-sm text-gray-600 mt-1">Learn how to write secure Java code</p>
              </div>
              <button
                onClick={() => setShowSecurityGuide(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center">
                    <Lightbulb className="w-4 h-4 mr-2" />
                    Key Security Principles
                  </h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Always validate and sanitize user input</li>
                    <li>• Use parameterized queries for database operations</li>
                    <li>• Implement proper authentication and authorization</li>
                    <li>• Keep dependencies updated and scan for vulnerabilities</li>
                    <li>• Use strong cryptographic algorithms and secure random number generation</li>
                    <li>• Avoid hardcoded credentials and sensitive information</li>
                    <li>• Implement proper error handling without information disclosure</li>
                  </ul>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Common Vulnerability Types</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {['SQL Injection', 'Unsafe Reflection', 'Command Injection', 'Weak Cryptography', 'Hardcoded Credentials'].map((type) => (
                      <div key={type} className="border border-gray-200 rounded-lg p-3">
                        <h5 className="text-sm font-medium text-gray-900">{type}</h5>
                        <p className="text-xs text-gray-600 mt-1">
                          {getVulnerabilityExplanation(type).description.substring(0, 100)}...
                        </p>
                        <button
                          onClick={() => {
                            setShowSecurityGuide(false);
                            setSelectedVulnerability({ type });
                            setShowVulnerabilityDetails(true);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 mt-2"
                        >
                          Learn More →
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-end p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowSecurityGuide(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}