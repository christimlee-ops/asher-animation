import { supabase } from './supabase';
import type { Project } from '../types/animation';

const TABLE = 'projects';

// ─── Save ─────────────────────────────────────────────────────────

export async function saveProject(project: Project): Promise<Project> {
  const now = new Date().toISOString();
  const record = {
    id: project.id,
    name: project.name,
    data: JSON.stringify(project),
    updated_at: now,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(record, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw new Error(`Failed to save project: ${error.message}`);
  return JSON.parse(data.data) as Project;
}

// ─── Load ─────────────────────────────────────────────────────────

export async function loadProject(id: string): Promise<Project> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('data')
    .eq('id', id)
    .single();

  if (error) throw new Error(`Failed to load project: ${error.message}`);
  return JSON.parse(data.data) as Project;
}

// ─── List ─────────────────────────────────────────────────────────

export interface ProjectListItem {
  id: string;
  name: string;
  updated_at: string;
}

export async function listProjects(userId: string): Promise<ProjectListItem[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, name, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Failed to list projects: ${error.message}`);
  return (data ?? []) as ProjectListItem[];
}

// ─── Delete ───────────────────────────────────────────────────────

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(`Failed to delete project: ${error.message}`);
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
