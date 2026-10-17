import { backendDirectUrl } from '../lib/backendClient';

// API client for RefactAI backend.
// Default `/api` uses Next.js rewrites (next.config.js) → same origin, no browser CORS issues.
// Long-running calls (PMD scan) use backendDirectUrl() to avoid Next.js proxy timeout.
// Set NEXT_PUBLIC_API_URL=http://localhost:8083/api only if you call the Java server directly and CORS allows your origin.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  retryMultiplier: 2, // Exponential backoff
};

// Enhanced fetch with retry logic
async function fetchWithRetry(
  url: string, 
  options: RequestInit = {}, 
  retryCount = 0
): Promise<Response> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // If response is not ok, throw an error
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    // If we've reached max retries, throw the error
    if (retryCount >= RETRY_CONFIG.maxRetries) {
      throw error;
    }

    // Wait before retrying with exponential backoff
    const delay = RETRY_CONFIG.retryDelay * Math.pow(RETRY_CONFIG.retryMultiplier, retryCount);
    await new Promise(resolve => setTimeout(resolve, delay));

    // Retry the request
    return fetchWithRetry(url, options, retryCount + 1);
  }
}

export interface Workspace {
  id: string;
  name: string;
  sourceFiles: number;
  testFiles: number;
  createdAt: number;
}

export interface Assessment {
  projectId: string;
  evidences: ReasonEvidence[];
  summary: AssessmentSummary;
  metrics: ProjectMetrics;
  timestamp: number;
}

export interface ReasonEvidence {
  detectorId: string;
  pointer: CodePointer;
  metrics: Record<string, any>;
  summary: string;
  severity: string;
}

export interface CodePointer {
  file: string;
  className: string;
  methodName: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

export interface AssessmentSummary {
  totalFindings: number;
  blockerFindings: number;
  criticalFindings: number;
  majorFindings: number;
  minorFindings: number;
  maintainabilityIndex: number;
  totalFiles: number;
  totalLines: number;
}

export interface ProjectMetrics {
  totalFiles: number;
  totalLines: number;
  totalFindings: number;
  findingsBySeverity: Record<string, number>;
  findingsByCategory: Record<string, number>;
  maintainabilityIndex: number;
}

export interface Plan {
  projectId: string;
  transforms: PlannedTransform[];
  summary: PlanSummary;
  timestamp: number;
}

export interface PlannedTransform {
  id: string;
  name: string;
  description: string;
  target: any;
  location: CodePointer;
  metadata: Record<string, any>;
  priority: number;
  timestamp: number;
}

export interface PlanSummary {
  totalTransforms: number;
  estimatedPayoff: number;
  estimatedRisk: number;
  estimatedCost: number;
  timestamp: number;
}

export interface ApplyResult {
  projectId: string;
  results: TransformResult[];
  failures: FailedTransform[];
  verification: VerificationResult;
  timestamp: number;
}

export interface TransformResult {
  transformId: string;
  changes: FileChange[];
  verification: VerificationResult;
  timestamp: number;
}

export interface FileChange {
  file: string;
  type: string;
  description: string;
  timestamp: number;
}

export interface FailedTransform {
  transformId: string;
  error: string;
  timestamp: number;
}

export interface VerificationResult {
  success: boolean;
  message: string;
  metrics: Record<string, any>;
}

export interface FileInfo {
  name: string;
  relativePath: string;
  type: 'SOURCE' | 'TEST' | 'RESOURCE' | 'CONFIG';
  metrics: {
    linesOfCode: number;
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    methodCount: number;
    classCount: number;
    commentLines: number;
    blankLines: number;
  };
  findings: number;
  codeSmells?: number;
  lastModified: number;
}

// Code Analysis Types
export interface CodeAnalysisResult {
  workspaceId: string;
  analyzedFiles: number;
  totalSmells: number;
  totalTechnicalDebt: number;
  averageTechnicalDebt: number;
  smellDensity: number;
  overallHealth: string;
  priorityRecommendation: string;
  recommendations: string[];
  smellSummary: Record<string, number>;
  severitySummary: Record<string, number>;
  categorySummary: Record<string, number>;
  fileAnalyses: FileAnalysis[];
}

export interface SecurityVulnerability {
  type: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  recommendation: string;
  startLine: number;
  endLine: number;
  remediationSteps: string[];
}

export interface FileSecurityAnalysis {
  filePath: string;
  vulnerabilities: SecurityVulnerability[];
  hasError: boolean;
  errorMessage?: string;
}

export interface SecurityAnalysisResult {
  workspaceId: string;
  fileAnalyses: FileSecurityAnalysis[];
  typeSummary: Record<string, number>;
  categorySummary: Record<string, number>;
  severitySummary: Record<string, number>;
  totalVulnerabilities: number;
  securityScore: number;
  overallSecurityStatus: string;
  recommendations: string[];
  analyzedFiles: number;
  priorityRecommendation: string;
}

export interface FileAnalysis {
  filePath: string;
  smells: CodeSmell[];
  metrics: Record<string, any>;
  technicalDebtScore: number;
  refactoringPlan: Record<string, string[]>;
  hasError: boolean;
  errorMessage?: string;
}

export interface CodeSmell {
  type: string;
  category: string;
  pmdCategory?: string;
  severity: string;
  title: string;
  description: string;
  recommendation: string;
  startLine: number;
  endLine: number;
  refactoringSuggestions: string[];
}

export interface FileMetrics {
  codeLines: number;
  fieldCount: number;
  commentRatio: number;
  classCount: number;
  totalLines: number;
  blankLines: number;
  commentLines: number;
  codeDensity: number;
  cognitiveComplexity: number;
  methodCount: number;
  cyclomaticComplexity: number;
}

// Enhanced Analysis Types
export interface EnhancedFileMetrics {
  linesOfCode: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  methodCount: number;
  classCount: number;
  commentLines: number;
  blankLines: number;
  maintainabilityIndex: number;
  technicalDebtRatio: number;
  qualityGrade: string;
  codeSmells: number;
  criticalIssues: number;
  majorIssues: number;
  minorIssues: number;
  codeCoverage: number;
  documentationCoverage: number;
  hasTests: boolean;
  hasDocumentation: boolean;
  overallScore: number;
  qualityCategory: string;
  needsImmediateAttention: boolean;
  refactoringPriority: number;
}

export interface QualityInsights {
  overallScore: number;
  qualityCategory: string;
  needsAttention: boolean;
  refactoringPriority: number;
  specificInsights: Record<string, string>;
}

export interface RefactoringRecommendations {
  priority: number;
  estimatedEffort: number;
  actions: Record<string, string>;
}


export interface FileDependencyAnalysis {
  filePath: string;
  dependencies: string[];
  reverseDependencies: string[];
  outgoingDependencies: number;
  incomingDependencies: number;
}

export interface DependencyMetrics {
  totalFiles: number;
  totalDependencies: number;
  averageDependencies: number;
  mostCoupledFile: string;
  mostDependentFile: string;
  couplingDistribution: Record<number, number>;
}

export interface ProjectDependencyAnalysis {
  fileDependencies: Record<string, FileDependencyAnalysis>;
  dependencyGraph: Record<string, string[]>;
  reverseDependencyGraph: Record<string, string[]>;
  metrics: DependencyMetrics;
}

export interface DependencyGraphNode {
  id: string;
  label: string;
  path: string;
  type: 'java' | 'other';
  outgoingDependencies: number;
  incomingDependencies: number;
}

export interface DependencyGraphEdge {
  source: string;
  target: string;
  type: 'dependency';
}

export interface DependencyGraphData {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
  metrics: DependencyMetrics;
}

export interface RippleEffectAnalysis {
  targetFile: string;
  affectedFiles: string[];
  impactCount: number;
  hasImpact: boolean;
}

export interface EnhancedAnalysisResult {
  success: boolean;
  metrics: EnhancedFileMetrics;
  filePath: string;
  workspaceId: string;
  qualityInsights: QualityInsights;
  recommendations: RefactoringRecommendations;
  codeSmells: CodeSmell[];
  timestamp: number;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

class RefactAIClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetchWithRetry(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      return response.json();
    } catch (error) {
      // Convert fetch errors to ApiError
      if (error instanceof Error) {
        if (error.message.includes('HTTP')) {
          const statusMatch = error.message.match(/HTTP (\d+):/);
          const status = statusMatch ? parseInt(statusMatch[1]) : 500;
          throw new ApiError(status, error.message);
        }
        throw new ApiError(0, `Network error: ${error.message}`);
      }
      throw new ApiError(0, 'Unknown error occurred');
    }
  }

  // Health check
  async health(): Promise<{ status: string; timestamp: number; version: string }> {
    return this.request('/health');
  }

  // Workspace management
  async listWorkspaces(): Promise<Workspace[]> {
    return this.request('/workspaces');
  }

  async getWorkspace(id: string): Promise<Workspace> {
    return this.request(`/workspaces/${id}`);
  }

  async uploadProject(file: File, userId?: string, userName?: string): Promise<Workspace> {
    const formData = new FormData();
    formData.append('file', file);
    if (userId) formData.append('userId', userId);
    if (userName) formData.append('userName', userName);
    
    const response = await fetch(`${this.baseUrl}/workspaces`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new ApiError(response.status, `Upload failed: ${response.statusText}`);
    }

    return response.json();
  }

  async cloneGitRepository(gitUrl: string, branch: string = 'main', userId?: string, userName?: string): Promise<Workspace> {
    return this.request('/workspaces/git', {
      method: 'POST',
      body: JSON.stringify({ gitUrl, branch, userId, userName }),
    });
  }

  async deleteWorkspace(id: string): Promise<void> {
    await this.request(`/workspaces/${id}`, { method: 'DELETE' });
  }

  /**
   * Clear all workspaces for fresh start
   */
  async clearAllWorkspaces(): Promise<void> {
    return this.request('/workspaces/clear', { method: 'POST' });
  }

  /** Get persistent project profiles with metadata. Optionally filter by userId. */
  async listProjectProfiles(
    userId?: string,
    options?: { refreshCounts?: boolean }
  ): Promise<Array<{
    id: string; name: string; repositoryUrl: string | null;
    createdAt: number; lastAccessedAt: number;
    sourceFiles: number; testFiles: number; totalWorkspaceFiles?: number;
    status: string;
    userId?: string; userName?: string;
  }>> {
    const q = new URLSearchParams();
    if (userId) q.set('userId', userId);
    if (options?.refreshCounts) q.set('refreshCounts', 'true');
    const qs = q.toString();
    return this.request(`/workspaces/profiles${qs ? `?${qs}` : ''}`);
  }

  /** Update display name for a project in the registry. */
  async updateProjectProfile(workspaceId: string, name: string): Promise<{
    id: string; name: string; repositoryUrl: string | null;
    sourceFiles: number; testFiles: number; totalWorkspaceFiles?: number;
    status: string;
  }> {
    return this.request(`/workspaces/${workspaceId}/profile`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  }

  async getProjectProgress(
    workspaceId: string,
    options?: { sync?: boolean }
  ): Promise<{
    totalFiles: number; pending: number; refactored: number;
    rejected: number; skipped: number; error: number;
    progressPercent: number;
    workspaceFiles?: number;
    javaSourceFiles?: number;
    javaTestFiles?: number;
    analyzed?: number;
    files: Array<{
      filePath: string; status: string;
      smellsBefore: number; smellsAfter: number;
      lastUpdatedAt?: number;
      humanVerdict: string | null;
      rejectionReason?: string | null;
      analyzedAt?: number | null;
      analysisSmellCount?: number;
      lastRefactorAt?: number | null;
      verifyAccepted?: boolean | null;
      runId?: string | null;
      researchSnapshot?: string | null;
      refactoredArtifactPath?: string | null;
      originalArtifactPath?: string | null;
      savedToProjectAt?: number | null;
    }>;
  }> {
    const q = options?.sync ? '?sync=true' : '';
    return this.request(`/workspaces/${workspaceId}/progress${q}`);
  }

  /** Read saved copy from .refactai/refactored/, .refactai/rejected/, or .refactai/originals/ */
  async getFileArtifact(
    workspaceId: string,
    filePath: string,
    kind: 'refactored' | 'original' | 'rejected' = 'refactored'
  ): Promise<{ artifactPath: string; content: string; filePath: string }> {
    const q = new URLSearchParams({ filePath, kind });
    return this.request(`/workspaces/${workspaceId}/files/artifact?${q.toString()}`);
  }

  /** Persist full post-refactoring review (metrics, diff, report) for later retrieval. */
  async saveRefactoringReport(workspaceId: string, bundle: Record<string, unknown>): Promise<{
    status: string;
    filePath: string;
    savedAt: number;
  }> {
    return this.request(`/workspaces/${workspaceId}/saved-reports`, {
      method: 'PUT',
      body: JSON.stringify(bundle),
    });
  }

  async getSavedRefactoringReport(workspaceId: string, filePath: string): Promise<unknown | null> {
    const q = new URLSearchParams({ filePath });
    const res = await fetch(
      `${this.baseUrl}/workspaces/${workspaceId}/saved-reports?${q.toString()}`,
      { headers: { Accept: 'application/json' } }
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new ApiError(res.status, `Failed to load saved report: ${res.statusText}`);
    }
    return res.json();
  }

  async savedRefactoringReportExists(
    workspaceId: string,
    filePath: string
  ): Promise<{ exists: boolean; filePath: string }> {
    const q = new URLSearchParams({ filePath });
    return this.request(`/workspaces/${workspaceId}/saved-reports/exists?${q.toString()}`);
  }

  async listSavedRefactoringReports(workspaceId: string): Promise<{
    workspaceId: string;
    count: number;
    reports: Array<{ filePath: string; savedAt?: number; sizeBytes?: number }>;
  }> {
    return this.request(`/workspaces/${workspaceId}/saved-reports/list`);
  }

  /** Persist research stratified sampling manifest under .refactai/ */
  async saveResearchSampleManifest(
    workspaceId: string,
    bundle: Record<string, unknown>
  ): Promise<{ status: string; workspaceId: string; savedAt: number }> {
    return this.request(`/workspaces/${workspaceId}/research-sample`, {
      method: 'PUT',
      body: JSON.stringify(bundle),
    });
  }

  async getResearchSampleManifest(workspaceId: string): Promise<Record<string, unknown> | null> {
    const res = await fetch(`${this.baseUrl}/workspaces/${workspaceId}/research-sample`, {
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new ApiError(res.status, `Failed to load research sample manifest: ${res.statusText}`);
    }
    return res.json();
  }

  async researchSampleManifestExists(
    workspaceId: string
  ): Promise<{ exists: boolean; workspaceId: string }> {
    return this.request(`/workspaces/${workspaceId}/research-sample/exists`);
  }

  async saveExcelExport(
    workspaceId: string,
    file: File,
    metadata: Record<string, unknown>,
    replace = false
  ): Promise<{
    status: string;
    exportId: string;
    filename: string;
    savedAt: number;
    sizeBytes: number;
    fileCount: number;
    exportedCount: number;
    skippedCount: number;
  }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify(metadata));
    const q = replace ? '?replace=true' : '';
    const response = await fetch(`${this.baseUrl}/workspaces/${workspaceId}/excel-exports${q}`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      throw new ApiError(response.status, `Failed to save Excel export: ${response.statusText}`);
    }
    return response.json();
  }

  async listExcelExports(workspaceId: string): Promise<{
    workspaceId: string;
    count: number;
    exports: Array<{
      exportId: string;
      filename: string;
      savedAt: number;
      sizeBytes: number;
      fileCount: number;
      exportedCount: number;
      skippedCount: number;
      projectLabel?: string;
      exportKind?: string;
      researchSampleId?: string;
      sourceWorkspaceIds?: string[];
    }>;
  }> {
    return this.request(`/workspaces/${workspaceId}/excel-exports`);
  }

  async downloadExcelExport(workspaceId: string, exportId: string): Promise<ArrayBuffer> {
    const response = await fetch(
      `${this.baseUrl}/workspaces/${workspaceId}/excel-exports/${encodeURIComponent(exportId)}`
    );
    if (!response.ok) {
      throw new ApiError(response.status, `Failed to download Excel export: ${response.statusText}`);
    }
    return response.arrayBuffer();
  }

  async saveBatchRun(workspaceId: string, record: Record<string, unknown>): Promise<{ status: string }> {
    return this.request(`/workspaces/${workspaceId}/batch-run`, {
      method: 'PUT',
      body: JSON.stringify(record),
    });
  }

  async getBatchRun(workspaceId: string): Promise<Record<string, unknown> | null> {
    const res = await fetch(`${this.baseUrl}/workspaces/${workspaceId}/batch-run`, {
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new ApiError(res.status, `Failed to load batch run: ${res.statusText}`);
    }
    return res.json();
  }

  async clearBatchRun(workspaceId: string): Promise<void> {
    await this.request(`/workspaces/${workspaceId}/batch-run`, { method: 'DELETE' });
  }

  /** Update per-file refactoring status. */
  async updateFileStatus(workspaceId: string, filePath: string, status: string, extra?: {
    smellsBefore?: number; smellsAfter?: number; rejectionReason?: string;
    verifyAccepted?: boolean; researchSnapshot?: string; runId?: string;
    userId?: string; userName?: string; analysisSmellCount?: number;
    humanVerdict?: string;
  }): Promise<void> {
    await this.request(`/workspaces/${workspaceId}/file-status`, {
      method: 'POST',
      body: JSON.stringify({ filePath, status, ...extra }),
    });
  }

  /** Persist accepted or rejected refactor attempt with .refactai artifacts and file-status. */
  async recordRefactorAttempt(
    workspaceId: string,
    body: {
      filePath: string;
      originalContent: string;
      candidateContent: string;
      accepted: boolean;
      smellsBefore?: number;
      smellsAfter?: number;
      rejectionReason?: string;
      researchSnapshot?: string;
      humanVerdict?: string;
      userId?: string | null;
      userName?: string | null;
    }
  ): Promise<{
    status: string;
    filePath: string;
    refactoredArtifactPath?: string;
    originalArtifactPath?: string;
    savedAt?: number;
  }> {
    return this.request(`/workspaces/${workspaceId}/refactor-attempt`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // ─── User Profiles ──────────────────────────────────────────────────

  async listUsers(): Promise<Array<{
    id: string; name: string; role: string; email: string | null;
    createdAt: number; lastActiveAt: number;
    projectsCount: number; refactoringsCount: number;
  }>> {
    return this.request('/users');
  }

  async getUser(
    userId: string,
    init: Pick<RequestInit, 'signal'> = {}
  ): Promise<{
    id: string; name: string; role: string; email: string | null;
    createdAt: number; lastActiveAt: number;
    projectsCount: number; refactoringsCount: number;
  }> {
    return this.request(`/users/${userId}`, init);
  }

  async createUser(name: string, role: string, email?: string): Promise<{
    id: string; name: string; role: string; email: string | null;
    createdAt: number; lastActiveAt: number;
    projectsCount: number; refactoringsCount: number;
  }> {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify({ name, role, email: email || null }),
    });
  }

  async updateUser(userId: string, updates: { name?: string; role?: string; email?: string }): Promise<{
    id: string; name: string; role: string;
  }> {
    return this.request(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteUser(userId: string): Promise<void> {
    await this.request(`/users/${userId}`, { method: 'DELETE' });
  }

  // Assessment
  async assessProject(workspaceId: string): Promise<Assessment> {
    return this.request(`/workspaces/${workspaceId}/assess`, {
      method: 'POST',
      body: JSON.stringify({
        options: { mode: 'quick' },
        includeMetrics: true,
        includeDetails: false, // speed up: defer heavy details to on-demand views
      }),
    });
  }

  async getAssessment(workspaceId: string, includeDetails = false): Promise<Assessment> {
    const q = includeDetails ? '?includeDetails=true' : '';
    return this.request(`/workspaces/${workspaceId}/assessment${q}`);
  }

  // Planning
  async generatePlan(workspaceId: string): Promise<Plan> {
    return this.request(`/workspaces/${workspaceId}/plan`, {
      method: 'POST',
      body: JSON.stringify({
        options: {},
        includePreview: true,
        includeConflicts: false,
      }),
    });
  }

  async getPlan(workspaceId: string): Promise<Plan> {
    return this.request(`/workspaces/${workspaceId}/plan`);
  }

  // Application
  async applyPlan(workspaceId: string, selectedTransforms: string[]): Promise<ApplyResult> {
    return this.request(`/workspaces/${workspaceId}/apply`, {
      method: 'POST',
      body: JSON.stringify({
        selectedTransforms,
        dryRun: false,
        verifyResults: true,
      }),
    });
  }

  // Artifacts
  async getArtifact(workspaceId: string, artifactName: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/workspaces/${workspaceId}/artifacts/${artifactName}`);
    
    if (!response.ok) {
      throw new ApiError(response.status, `Failed to get artifact: ${response.statusText}`);
    }

    return response.text();
  }

  // Get files in a workspace
  async getWorkspaceFiles(workspaceId: string, lightweight = true): Promise<FileInfo[]> {
    return this.request(`/workspaces/${workspaceId}/files?lightweight=${lightweight}`);
  }

  /** Run PMD on Java sources and persist smell counts (used after upload / project open). */
  async scanWorkspacePmd(
    workspaceId: string,
    maxFiles?: number,
    offset?: number
  ): Promise<{
    totalJavaSourceFiles: number;
    filesScanned: number;
    totalSmells: number;
    truncated: boolean;
    durationMs: number;
  }> {
    const params = new URLSearchParams();
    if (offset != null && offset > 0) params.set('offset', String(offset));
    if (maxFiles != null && maxFiles > 0) params.set('maxFiles', String(maxFiles));
    const q = params.toString() ? `?${params.toString()}` : '';
    // Next.js dev proxy times out on multi-minute scans; call Java backend directly from the browser.
    const url = backendDirectUrl(`/workspaces/${workspaceId}/pmd-scan${q}`);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
        signal: AbortSignal.timeout(60 * 60 * 1000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiError(
        0,
        `PMD scan failed: cannot reach backend on port ${process.env.NEXT_PUBLIC_API_PORT || '8084'} (${msg}). Restart the backend Terminal window, then retry.`
      );
    }
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = await response.text();
        if (body) detail = body.slice(0, 200);
      } catch {
        /* ignore */
      }
      const hint =
        response.status >= 500
          ? ' — backend error or connection dropped during a long scan. Check the backend Terminal; the scan may still have finished on disk.'
          : '';
      throw new ApiError(response.status, `PMD scan failed: ${detail}${hint}`);
    }
    return response.json();
  }

  async getFileContent(workspaceId: string, filePath: string): Promise<{ content: string; filePath: string; workspaceId: string }> {
    return this.request(`/workspaces/${workspaceId}/files/content?filePath=${encodeURIComponent(filePath)}`);
  }

  async analyzeFile(workspaceId: string, filePath: string): Promise<FileAnalysis> {
    return this.request(`/workspaces/${workspaceId}/files/analysis?filePath=${encodeURIComponent(filePath)}`);
  }

  async analyzeWorkspace(workspaceId: string): Promise<CodeAnalysisResult> {
    return this.request(`/workspaces/${workspaceId}/analyze`, {
      method: 'POST'
    });
  }
  
  async analyzeFileSecurity(workspaceId: string, filePath: string): Promise<FileSecurityAnalysis> {
    return this.request(`/workspaces/${workspaceId}/files/security?filePath=${encodeURIComponent(filePath)}`);
  }
  
  async analyzeWorkspaceSecurity(workspaceId: string): Promise<SecurityAnalysisResult> {
    return this.request(`/workspaces/${workspaceId}/security`, {
      method: 'POST'
    });
  }

  async analyzeFileEnhanced(workspaceId: string, filePath: string): Promise<EnhancedAnalysisResult> {
    return this.request(`/workspace-enhanced-analysis/analyze-file`, {
      method: 'POST',
      body: JSON.stringify({ workspaceId, filePath }),
    });
  }

  async analyzeFileLive(workspaceId: string, filePath: string, content: string): Promise<EnhancedAnalysisResult> {
    return this.request(`/workspace-enhanced-analysis/analyze-live`, {
      method: 'POST',
      body: JSON.stringify({ workspaceId, filePath, content }),
    });
  }

  /** Restore true pre-refactor source from oldest .backup.<ts> when re-running research sample. */
  async restoreResearchBaseline(
    workspaceId: string,
    filePath: string,
    manifestSmellCount: number
  ): Promise<{
    restored: boolean;
    reason: string;
    smellsBeforeRestore: number;
    smellsAfterRestore: number;
    backupUsed?: string | null;
  }> {
    return this.request(`/workspaces/${workspaceId}/research/restore-baseline`, {
      method: 'POST',
      body: JSON.stringify({ filePath, manifestSmellCount }),
    });
  }

  async getResearchExcludedPaths(
    workspaceId: string
  ): Promise<{ excludedPaths: string[]; count: number }> {
    const res = await this.request<{ excludedPaths: string[] | Set<string>; count: number }>(
      `/workspaces/${workspaceId}/research/excluded-paths`
    );
    const paths = res.excludedPaths;
    return {
      excludedPaths: Array.isArray(paths) ? paths : Array.from(paths as Iterable<string>),
      count: res.count,
    };
  }

  async snapshotResearchBaseline(
    workspaceId: string,
    sampleId: string,
    filePaths: string[]
  ): Promise<{ status: string; sampleId: string; snapshots: Array<Record<string, unknown>> }> {
    return this.request(`/workspaces/${workspaceId}/research/baseline-snapshot`, {
      method: 'POST',
      body: JSON.stringify({ sampleId, filePaths }),
    });
  }

  async snapshotResearchBaselineFile(
    workspaceId: string,
    sampleId: string,
    filePath: string
  ): Promise<{ status: string; sampleId: string; snapshots: Array<Record<string, unknown>> }> {
    return this.request(`/workspaces/${workspaceId}/research/baseline-snapshot`, {
      method: 'POST',
      body: JSON.stringify({ sampleId, filePath }),
    });
  }

  // Dependency Analysis Methods
  async analyzeFileDependencies(workspaceId: string, filePath: string): Promise<FileDependencyAnalysis> {
    return this.request(`/workspaces/${workspaceId}/dependencies/file?filePath=${encodeURIComponent(filePath)}`);
  }

  async analyzeProjectDependencies(workspaceId: string): Promise<ProjectDependencyAnalysis> {
    return this.request(`/workspaces/${workspaceId}/dependencies/project`);
  }

  async getRippleEffectAnalysis(workspaceId: string, filePath: string): Promise<RippleEffectAnalysis> {
    return this.request(`/workspaces/${workspaceId}/dependencies/ripple-effect?filePath=${encodeURIComponent(filePath)}`);
  }

  async getDependencyGraph(workspaceId: string): Promise<DependencyGraphData> {
    return this.request(`/workspaces/${workspaceId}/dependencies/graph`);
  }

  // File pagination and summary
  async getWorkspaceFileSummary(workspaceId: string): Promise<{
    totalFiles: number;
    fileTypeCounts: Record<string, number>;
    sourceFiles: number;
    testFiles: number;
    configFiles: number;
    resourceFiles: number;
  }> {
    return this.request(`/workspaces/${workspaceId}/files/summary`);
  }

  async getWorkspaceFilesPaginated(
    workspaceId: string, 
    page: number = 0, 
    size: number = 50, 
    search?: string, 
    fileType?: string,
    analyzeCodeSmells: boolean = false
  ): Promise<{
    files: FileInfo[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalFiles: number;
      pageSize: number;
      hasNext: boolean;
      hasPrevious: boolean;
    };
    timing?: {
      totalTimeMs: number;
      totalTimeSeconds: number;
      filesProcessed: number;
      averageTimePerFileMs: number;
      filesPerSecond: number;
    };
  }> {
    const params = new URLSearchParams({
      page: page.toString(),
      size: size.toString(),
      analyzeCodeSmells: analyzeCodeSmells.toString(),
    });
    
    if (search) params.append('search', search);
    if (fileType) params.append('fileType', fileType);
    
    return this.request(`/workspaces/${workspaceId}/files/paginated?${params.toString()}`);
  }

  async listUserResearchExports(userId: string): Promise<{
    userId: string;
    count: number;
    exports: Array<{
      exportId: string;
      filename: string;
      savedAt: number;
      sizeBytes: number;
      fileCount: number;
      exportedCount: number;
      skippedCount: number;
      exportKind?: string;
      projectLabels?: string[];
      workspaceIds?: string[];
    }>;
  }> {
    return this.request(`/users/${encodeURIComponent(userId)}/research-exports`);
  }

  async saveUserResearchExport(
    userId: string,
    file: File,
    metadata: Record<string, unknown>,
    indexFile?: File
  ): Promise<{
    status: string;
    exportId: string;
    filename: string;
    savedAt: number;
    sizeBytes: number;
  }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify(metadata));
    if (indexFile) formData.append('index', indexFile);
    const response = await fetch(
      `${this.baseUrl}/users/${encodeURIComponent(userId)}/research-exports`,
      { method: 'POST', body: formData }
    );
    if (!response.ok) {
      throw new ApiError(response.status, `Failed to save user research export: ${response.statusText}`);
    }
    return response.json();
  }

  async downloadUserResearchExport(userId: string, exportId: string): Promise<ArrayBuffer> {
    const response = await fetch(
      `${this.baseUrl}/users/${encodeURIComponent(userId)}/research-exports/${encodeURIComponent(exportId)}`
    );
    if (!response.ok) {
      throw new ApiError(response.status, `Failed to download research export: ${response.statusText}`);
    }
    return response.arrayBuffer();
  }

  async deleteUserResearchExport(userId: string, exportId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/users/${encodeURIComponent(userId)}/research-exports/${encodeURIComponent(exportId)}`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      throw new ApiError(response.status, `Failed to delete research export: ${response.statusText}`);
    }
  }
}

// Create and export the client instance
export const apiClient = new RefactAIClient();

// Export the client class for testing
export { RefactAIClient };
