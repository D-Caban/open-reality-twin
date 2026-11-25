import type { SegObject } from './api'
import type { PlyCloud } from './ply'

/** Map each cloud point to a segmented object index (-1 = none). Overlaps → nearest centroid. */
export function buildPointObjectIndex(cloud: PlyCloud, objects: SegObject[]): Int32Array {
  const n = cloud.count
  const out = new Int32Array(n)
  out.fill(-1)
  if (!objects.length) return out

  const centroids = objects.map((o) => {
    const c = o.centroid
    return [c[0], c[1], c[2]] as [number, number, number]
  })

  for (let i = 0; i < n; i++) {
    const x = cloud.positions[i * 3]
    const y = cloud.positions[i * 3 + 1]
    const z = cloud.positions[i * 3 + 2]
    let best = -1
    let bestDist = Infinity
    for (let oi = 0; oi < objects.length; oi++) {
      const { min, max } = objects[oi].aabb
      if (
        x < min[0] ||
        x > max[0] ||
        y < min[1] ||
        y > max[1] ||
        z < min[2] ||
        z > max[2]
      ) {
        continue
      }
      const [cx, cy, cz] = centroids[oi]
      const d = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2
      if (d < bestDist) {
        bestDist = d
        best = oi
      }
    }
    out[i] = best
  }
  return out
}

export function objectAtPoint(
  cloud: PlyCloud,
  objects: SegObject[],
  pointIndex: number,
  pointObjectIndex?: Int32Array | null,
): SegObject | null {
  if (pointIndex < 0 || pointIndex >= cloud.count || !objects.length) return null
  if (pointObjectIndex && pointObjectIndex.length === cloud.count) {
    const oi = pointObjectIndex[pointIndex]
    return oi >= 0 ? objects[oi] ?? null : null
  }
  const x = cloud.positions[pointIndex * 3]
  const y = cloud.positions[pointIndex * 3 + 1]
  const z = cloud.positions[pointIndex * 3 + 2]
  let best: SegObject | null = null
  let bestDist = Infinity
  for (const obj of objects) {
    const { min, max } = obj.aabb
    if (x < min[0] || x > max[0] || y < min[1] || y > max[1] || z < min[2] || z > max[2]) {
      continue
    }
    const [cx, cy, cz] = obj.centroid
    const d = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2
    if (d < bestDist) {
      bestDist = d
      best = obj
    }
  }
  return best
}
