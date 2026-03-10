const BASE_URL = import.meta.env.VITE_API_URL || '/api';

function getToken(): string | null {
  return localStorage.getItem('auth_token') ?? sessionStorage.getItem('auth_token');
}

export type AssetCategory = 'sounds' | 'characters' | 'backgrounds' | 'other';

export const ASSET_CATEGORIES: { key: AssetCategory; label: string; icon: string }[] = [
  { key: 'characters', label: 'Characters', icon: '👤' },
  { key: 'backgrounds', label: 'Backgrounds', icon: '🏞' },
  { key: 'sounds', label: 'Sounds', icon: '♪' },
  { key: 'other', label: 'Other', icon: '📁' },
];

export interface MediaAsset {
  id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  url: string;
  category: AssetCategory;
  created_at: string;
}

export async function uploadAsset(file: File, category: AssetCategory = 'other'): Promise<MediaAsset> {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);

  const res = await fetch(`${BASE_URL}/assets/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }

  const data = await res.json();
  return data.asset;
}

export async function listAssets(): Promise<MediaAsset[]> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/assets`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) throw new Error('Failed to fetch assets');
  const data = await res.json();
  return data.assets;
}

export async function updateAssetCategory(id: number, category: AssetCategory): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/assets/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ category }),
  });

  if (!res.ok) throw new Error('Failed to update asset');
}

export async function renameAsset(id: number, newName: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/assets/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ original_name: newName }),
  });

  if (!res.ok) throw new Error('Failed to rename asset');
}

export async function deleteAsset(id: number): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/assets/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) throw new Error('Failed to delete asset');
}

export function getAssetFullUrl(asset: MediaAsset): string {
  if (asset.url.startsWith('http')) return asset.url;
  const origin = BASE_URL.replace(/\/api$/, '');
  return `${origin}${asset.url}`;
}

export function isAudioAsset(asset: MediaAsset): boolean {
  return asset.mime_type.startsWith('audio/');
}

export function isImageAsset(asset: MediaAsset): boolean {
  return asset.mime_type.startsWith('image/');
}

// ─── Thumbnail cache ──────────────────────────────────────────────
// Generates small preview images client-side and caches them in memory
const thumbCache = new Map<number, string>();
const thumbLoading = new Set<number>();
const thumbListeners = new Set<() => void>();

export function onThumbnailReady(cb: () => void) {
  thumbListeners.add(cb);
  return () => { thumbListeners.delete(cb); };
}

function notifyThumbnailReady() {
  thumbListeners.forEach((cb) => cb());
}

export function getThumbnailUrl(asset: MediaAsset, size = 80): string | null {
  if (asset.mime_type.startsWith('audio/')) return null;
  if (thumbCache.has(asset.id)) return thumbCache.get(asset.id)!;

  // Start generating if not already loading
  if (!thumbLoading.has(asset.id)) {
    thumbLoading.add(asset.id);
    generateThumbnail(asset, size).then((dataUrl) => {
      if (dataUrl) thumbCache.set(asset.id, dataUrl);
      thumbLoading.delete(asset.id);
      notifyThumbnailReady();
    }).catch(() => {
      thumbLoading.delete(asset.id);
    });
  }

  return null; // Not ready yet
}

async function generateThumbnail(asset: MediaAsset, size: number): Promise<string | null> {
  const url = getAssetFullUrl(asset);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      // Cover fit
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function clearThumbnailCache(assetId?: number) {
  if (assetId !== undefined) {
    thumbCache.delete(assetId);
  } else {
    thumbCache.clear();
  }
}
