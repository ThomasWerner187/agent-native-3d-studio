export interface CreativeRequest {
  id: string;
  text: string;
  scene_version: number;
  selected_id: string | null;
  created_at: string;
}

const requests: CreativeRequest[] = [];
let sequence = 0;

/** A shared brief for the connected browser agent, never a simulated response. */
export function addCreativeRequest(text: string, sceneVersion: number, selectedId: string | null): CreativeRequest {
  const request: CreativeRequest = {
    id: `request_${++sequence}`, text: text.trim().slice(0, 1200),
    scene_version: sceneVersion, selected_id: selectedId, created_at: new Date().toISOString(),
  };
  if (!request.text) throw new Error('Write a request first.');
  requests.push(request);
  if (requests.length > 12) requests.shift();
  return { ...request };
}

export function getCreativeRequests(): CreativeRequest[] {
  return requests.map(request => ({ ...request }));
}

export function clearCreativeRequests(): void { requests.length = 0; }
