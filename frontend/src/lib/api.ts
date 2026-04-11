import type {
  LiveUpdate,
  OverlaysResponse,
  RouteRequestPayload,
  RouteResponse,
  WildfireStatus,
} from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

const buildUrl = (path: string) => `${API_BASE_URL}${path}`;

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchHealth(): Promise<{ status: string }> {
  const res = await fetch(buildUrl('/health'));
  return handleResponse(res);
}

export async function fetchStatus(): Promise<WildfireStatus> {
  const res = await fetch(buildUrl('/api/status'), { cache: 'no-store' });
  return handleResponse(res);
}

export async function fetchRoutes(payload: RouteRequestPayload): Promise<RouteResponse> {
  const res = await fetch(buildUrl('/api/routes'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function fetchOverlays(): Promise<OverlaysResponse> {
  const res = await fetch(buildUrl('/api/overlays'), { cache: 'no-store' });
  return handleResponse(res);
}

export async function fetchUpdates(): Promise<LiveUpdate[]> {
  const res = await fetch(buildUrl('/api/updates'), { cache: 'no-store' });
  return handleResponse(res);
}
