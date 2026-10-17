/**
 * Persist research sampling manifest: workspace disk (API) + browser localStorage fallback.
 */

import { apiClient } from '../api/client';
import {
  buildResearchSampleManifest,
  type ResearchSampleResult,
} from './researchSampling';

export type StoredResearchSampleRecord = {
  workspaceId: string;
  projectLabel: string;
  savedAt: number;
  sampleId: string;
  result: ResearchSampleResult;
  manifest: Record<string, unknown>;
};

const localKey = (workspaceId: string) => `refactai-research-sample-${workspaceId}`;

export function buildResearchSampleId(
  workspaceId: string,
  seed: number,
  savedAt: number
): string {
  return `${workspaceId}-seed${seed}-${savedAt}`;
}

export function loadResearchSampleFromLocal(
  workspaceId: string
): StoredResearchSampleRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(localKey(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredResearchSampleRecord;
    if (!parsed?.result?.paths) return null;
    if (!parsed.sampleId && parsed.result?.config?.seed != null) {
      parsed.sampleId = buildResearchSampleId(
        workspaceId,
        parsed.result.config.seed,
        parsed.savedAt ?? Date.now()
      );
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveResearchSampleToLocal(record: StoredResearchSampleRecord): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(localKey(record.workspaceId), JSON.stringify(record));
  } catch {
    /* quota */
  }
}

export async function loadResearchSample(
  workspaceId: string
): Promise<StoredResearchSampleRecord | null> {
  const local = loadResearchSampleFromLocal(workspaceId);
  try {
    const remote = await apiClient.getResearchSampleManifest(workspaceId);
    if (remote?.result?.paths?.length) {
      const savedAt = Number(remote.savedAt ?? Date.now());
      const result = remote.result as ResearchSampleResult;
      const record: StoredResearchSampleRecord = {
        workspaceId,
        projectLabel: String(remote.projectLabel ?? workspaceId),
        savedAt,
        sampleId: String(
          remote.sampleId ??
            buildResearchSampleId(workspaceId, result.config.seed, savedAt)
        ),
        result,
        manifest: (remote.manifest as Record<string, unknown>) ?? {},
      };
      if (local && (local.savedAt ?? 0) > savedAt) {
        return local;
      }
      saveResearchSampleToLocal(record);
      return record;
    }
  } catch {
    /* offline or 404 */
  }
  return local;
}

/** Save manifest to project workspace (.refactai/) and localStorage. */
export async function persistResearchSample(
  workspaceId: string,
  projectLabel: string,
  result: ResearchSampleResult,
  options?: { archivePrevious?: boolean; snapshotBaseline?: boolean }
): Promise<StoredResearchSampleRecord> {
  const savedAt = Date.now();
  const sampleId = buildResearchSampleId(workspaceId, result.config.seed, savedAt);
  const manifest = {
    ...buildResearchSampleManifest(workspaceId, projectLabel, result),
    sampleId,
  };
  const record: StoredResearchSampleRecord = {
    workspaceId,
    projectLabel,
    savedAt,
    sampleId,
    result,
    manifest,
  };

  try {
    await apiClient.saveResearchSampleManifest(workspaceId, {
      savedAt,
      sampleId,
      projectLabel,
      result,
      manifest,
      archivePrevious: options?.archivePrevious === true,
    });
  } catch (e) {
    console.warn('Could not save research manifest to workspace; using browser storage only.', e);
  }

  if (options?.snapshotBaseline !== false && result.paths.length > 0) {
    try {
      await apiClient.snapshotResearchBaseline(workspaceId, sampleId, result.paths);
    } catch (e) {
      console.warn('Could not snapshot research baselines; batch will use live workspace files.', e);
    }
  }

  saveResearchSampleToLocal(record);
  return record;
}

export function formatSavedResearchSampleWhen(savedAt: number): string {
  try {
    return new Date(savedAt).toLocaleString();
  } catch {
    return String(savedAt);
  }
}
