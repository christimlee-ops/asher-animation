import { apiGet, apiPost, apiPut, apiDelete } from './api';
import type { Project } from '../types/animation';

// ─── Save ─────────────────────────────────────────────────────────

export async function saveProject(project: Project): Promise<Project> {
  if (project.id) {
    return apiPut<Project>(`/projects/${project.id}`, project);
  }
  return apiPost<Project>('/projects', project);
}

// ─── Load ─────────────────────────────────────────────────────────

export async function loadProject(id: string): Promise<Project> {
  return apiGet<Project>(`/projects/${id}`);
}

// ─── List ─────────────────────────────────────────────────────────

export interface ProjectListItem {
  id: string;
  name: string;
  updated_at: string;
}

export async function listProjects(_userId?: string): Promise<ProjectListItem[]> {
  return apiGet<ProjectListItem[]>('/projects');
}

// ─── Delete ───────────────────────────────────────────────────────

export async function deleteProject(id: string): Promise<void> {
  return apiDelete<void>(`/projects/${id}`);
}

// ─── Auto-save ────────────────────────────────────────────────────

let _autoSaveTimer: ReturnType<typeof setInterval> | null = null;

const AUTO_SAVE_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Start auto-saving the project every 3 minutes.
 * Call stopAutoSave() to clear the timer.
 */
export function startAutoSave(
  getProject: () => Project,
  onSaved?: () => void,
  onError?: (err: Error) => void
): void {
  stopAutoSave();

  _autoSaveTimer = setInterval(async () => {
    try {
      const project = getProject();
      await saveProject({ ...project, updatedAt: new Date().toISOString() });
      onSaved?.();
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, AUTO_SAVE_INTERVAL_MS);
}

export function stopAutoSave(): void {
  if (_autoSaveTimer !== null) {
    clearInterval(_autoSaveTimer);
    _autoSaveTimer = null;
  }
}
