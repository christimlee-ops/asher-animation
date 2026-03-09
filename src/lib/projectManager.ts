import { apiGet, apiPost, apiPut, apiDelete } from './api';

// Server project shape (matches DB columns)
export interface ServerProject {
  id: string;
  user_id?: string | number;
  name: string;
  data: any;
  thumbnail?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ─── Save ─────────────────────────────────────────────────────────

export async function saveProject(project: { id?: string; name: string; data: any }): Promise<ServerProject> {
  if (project.id) {
    const res = await apiPut<{ project: ServerProject }>(`/projects/${project.id}`, project);
    return res.project ?? (project as ServerProject);
  }
  const res = await apiPost<{ project: ServerProject }>('/projects', project);
  return res.project;
}

// ─── Load ─────────────────────────────────────────────────────────

export async function loadProject(id: string): Promise<ServerProject> {
  const res = await apiGet<{ project: ServerProject }>(`/projects/${id}`);
  return res.project;
}

// ─── List ─────────────────────────────────────────────────────────

export interface ProjectListItem {
  id: string;
  name: string;
  updated_at: string;
}

export async function listProjects(_userId?: string): Promise<ProjectListItem[]> {
  const res = await apiGet<{ projects: ProjectListItem[] }>('/projects');
  return res.projects;
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
  getProject: () => { id?: string; name: string; data: any },
  onSaved?: () => void,
  onError?: (err: Error) => void
): void {
  stopAutoSave();

  _autoSaveTimer = setInterval(async () => {
    try {
      const project = getProject();
      await saveProject(project);
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
