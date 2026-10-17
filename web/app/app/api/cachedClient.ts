import { apiClient } from './client';
import { cache, CacheKeys, CacheTTL, cacheUtils } from '../utils/cache';
import type { 
  Workspace, 
  Assessment, 
  Plan, 
  FileInfo, 
  DependencyGraphData, 
  FileDependencyAnalysis, 
  ProjectDependencyAnalysis, 
  RippleEffectAnalysis 
} from './client';

export class CachedRefactAIClient {
  private client = apiClient;

  // Health check (no caching needed)
  async health() {
    return this.client.health();
  }

  // Workspace management with caching
  async getWorkspaces(): Promise<Workspace[]> {
    const cacheKey = 'workspaces';
    return cacheUtils.preload(
      cacheKey,
      () => this.client.listWorkspaces(),
      CacheTTL.SHORT
    );
  }

  async getWorkspace(workspaceId: string): Promise<Workspace> {
    const cacheKey = CacheKeys.workspace(workspaceId);
    return cacheUtils.preload(
      cacheKey,
      () => this.client.getWorkspace(workspaceId),
      CacheTTL.MEDIUM
    );
  }

  // Project files with caching
  async getProjectFiles(workspaceId: string): Promise<FileInfo[]> {
    const cacheKey = CacheKeys.files(workspaceId);
    return cacheUtils.preload(
      cacheKey,
      () => this.client.getWorkspaceFiles(workspaceId),
      CacheTTL.MEDIUM
    );
  }

  // File content with caching
  async getFileContent(workspaceId: string, filePath: string): Promise<{ content: string; filePath: string; workspaceId: string }> {
    const cacheKey = CacheKeys.fileContent(workspaceId, filePath);
    return cacheUtils.preload(
      cacheKey,
      () => this.client.getFileContent(workspaceId, filePath),
      CacheTTL.LONG // File content doesn't change often
    );
  }

  // Assessment with caching
  async getAssessment(workspaceId: string): Promise<Assessment | null> {
    const cacheKey = CacheKeys.assessment(workspaceId);
    return cacheUtils.preload(
      cacheKey,
      () => this.client.getAssessment(workspaceId),
      CacheTTL.MEDIUM
    );
  }

  // Plan with caching
  async getPlan(workspaceId: string): Promise<Plan | null> {
    const cacheKey = CacheKeys.plan(workspaceId);
    return cacheUtils.preload(
      cacheKey,
      () => this.client.getPlan(workspaceId),
      CacheTTL.MEDIUM
    );
  }

  // Analysis operations (with shorter cache TTL since they're more dynamic)
  async analyzeProject(workspaceId: string): Promise<Assessment> {
    // Invalidate related cache entries before analysis
    cacheUtils.invalidateWorkspace(workspaceId);
    
    const assessment = await this.client.assessProject(workspaceId);
    
    // Cache the new assessment
    const cacheKey = CacheKeys.assessment(workspaceId);
    cache.set(cacheKey, assessment, CacheTTL.MEDIUM);
    
    return assessment;
  }

  async generatePlan(workspaceId: string): Promise<Plan> {
    // Invalidate related cache entries before generating plan
    cacheUtils.invalidate(CacheKeys.plan(workspaceId));
    
    const plan = await this.client.generatePlan(workspaceId);
    
    // Cache the new plan
    const cacheKey = CacheKeys.plan(workspaceId);
    cache.set(cacheKey, plan, CacheTTL.MEDIUM);
    
    return plan;
  }

  // File analysis with caching
  async analyzeFile(workspaceId: string, filePath: string): Promise<any> {
    const cacheKey = CacheKeys.fileAnalysis(workspaceId, filePath);
    return cacheUtils.preload(
      cacheKey,
      () => this.client.analyzeFile(workspaceId, filePath),
      CacheTTL.SHORT // File analysis might change more frequently
    );
  }

  // Dependency analysis with caching
  async getDependencyGraph(workspaceId: string): Promise<DependencyGraphData> {
    const cacheKey = CacheKeys.dependencyGraph(workspaceId);
    return cacheUtils.preload(
      cacheKey,
      () => this.client.getDependencyGraph(workspaceId),
      CacheTTL.MEDIUM
    );
  }

  async analyzeFileDependencies(workspaceId: string, filePath: string): Promise<FileDependencyAnalysis> {
    const cacheKey = CacheKeys.dependencyAnalysis(workspaceId, filePath);
    return cacheUtils.preload(
      cacheKey,
      () => this.client.analyzeFileDependencies(workspaceId, filePath),
      CacheTTL.MEDIUM
    );
  }

  async analyzeProjectDependencies(workspaceId: string): Promise<ProjectDependencyAnalysis> {
    const cacheKey = `projectDependencies:${workspaceId}`;
    return cacheUtils.preload(
      cacheKey,
      () => this.client.analyzeProjectDependencies(workspaceId),
      CacheTTL.MEDIUM
    );
  }

  async getRippleEffectAnalysis(workspaceId: string, filePath: string): Promise<RippleEffectAnalysis> {
    const cacheKey = CacheKeys.rippleEffect(workspaceId, filePath);
    return cacheUtils.preload(
      cacheKey,
      () => this.client.getRippleEffectAnalysis(workspaceId, filePath),
      CacheTTL.SHORT
    );
  }

  // Upload operations (invalidate cache after upload)
  async uploadProject(file: File, userId?: string, userName?: string): Promise<Workspace> {
    const result = await this.client.uploadProject(file, userId, userName);
    
    // Invalidate workspaces cache since we have a new workspace
    cacheUtils.invalidate('workspaces');
    
    return result;
  }

  async cloneRepository(repoUrl: string, branch: string = 'main'): Promise<Workspace> {
    const result = await this.client.cloneGitRepository(repoUrl, branch);
    
    // Invalidate workspaces cache since we have a new workspace
    cacheUtils.invalidate('workspaces');
    
    return result;
  }

  // Cache management methods
  invalidateWorkspace(workspaceId: string): void {
    cacheUtils.invalidateWorkspace(workspaceId);
  }

  invalidateFile(workspaceId: string, filePath: string): void {
    cacheUtils.invalidate(CacheKeys.fileContent(workspaceId, filePath));
    cacheUtils.invalidate(CacheKeys.fileAnalysis(workspaceId, filePath));
    cacheUtils.invalidate(CacheKeys.dependencyAnalysis(workspaceId, filePath));
    cacheUtils.invalidate(CacheKeys.rippleEffect(workspaceId, filePath));
  }

  clearCache(): void {
    cacheUtils.clear();
  }

  getCacheStats() {
    return cacheUtils.getStats();
  }
}

// Export singleton instance
export const cachedApiClient = new CachedRefactAIClient();
