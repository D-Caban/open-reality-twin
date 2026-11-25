const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8787'

export type SegObject = {
  id: string
  kind: string
  label: string
  shape?: string
  aabb: { min: number[]; max: number[] }
  centroid: number[]
  point_count: number
  path: string
}

export type SegmentResult = {
  job_id: string
  status: string
  is_gaussian?: boolean
  working_points?: number
  object_count?: number
  structure_count?: number
  selectable_count?: number
  objects: SegObject[]
  overview?: string | null
}

export async function uploadPly(file: File): Promise<{ job_id: string; filename: string; bytes: number }> {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch(`${API_BASE}/jobs`, { method: 'POST', body })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function segmentJob(
  jobId: string,
  opts?: Partial<{
    max_planes: number
    plane_dist: number
    min_object_points: number
    max_objects: number
    method: string
  }>,
): Promise<SegmentResult> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/segment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId, ...opts }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export function objectDownloadUrl(jobId: string, relPath: string): string {
  return `${API_BASE}/jobs/${jobId}/files/${relPath}`
}

export async function health(): Promise<{ ok: boolean; seg3d: boolean }> {
  const res = await fetch(`${API_BASE}/health`)
  if (!res.ok) throw new Error('API unreachable')
  return res.json()
}
