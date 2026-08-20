import { httpBase } from "./config";
import { CampaignState, Report } from "./types";

export interface CampaignListItem { id: number; name: string; created_at: string; }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${httpBase()}${path}`, init);
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

function post<T>(path: string, body: object = {}): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function createCampaign(name?: string): Promise<CampaignState> {
  return post<CampaignState>("/api/campaigns", name ? { name } : {});
}

export function listCampaigns(): Promise<CampaignListItem[]> {
  return request<CampaignListItem[]>("/api/campaigns");
}

export function getCampaign(id: number): Promise<CampaignState> {
  return request<CampaignState>(`/api/campaigns/${id}`);
}

export function startScene(id: number): Promise<{ scene_id: number }> {
  return post<{ scene_id: number }>(`/api/campaigns/${id}/scenes`);
}

export function endScene(id: number): Promise<{ report: Report }> {
  return post<{ report: Report }>(`/api/campaigns/${id}/scenes/end`);
}
