const BASE_URL = import.meta.env.VITE_API_URL || '/api';

function getToken(): string | null {
  return localStorage.getItem('auth_token') ?? sessionStorage.getItem('auth_token');
}

export interface MediaAsset {
  id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  url: string;
  created_at: string;
}

export async function uploadAsset(file: File): Promise<MediaAsset> {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);

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

export async function deleteAsset(id: number): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/assets/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) throw new Error('Failed to delete asset');
}

export function getAssetFullUrl(asset: MediaAsset): string {
  // If the URL is already absolute, return as-is
  if (asset.url.startsWith('http')) return asset.url;
  // Otherwise, prepend the base URL (without /api suffix)
  const origin = BASE_URL.replace(/\/api$/, '');
  return `${origin}${asset.url}`;
}

export function isAudioAsset(asset: MediaAsset): boolean {
  return asset.mime_type.startsWith('audio/');
}

export function isImageAsset(asset: MediaAsset): boolean {
  return asset.mime_type.startsWith('image/');
}
