import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { SceneViewer } from './components/SceneViewer'
import { health, objectDownloadUrl, segmentJob, uploadPly, type SegObject, type SegmentResult } from './lib/api'
import { buildPointObjectIndex } from './lib/pick'
import { loadPly, type PlyCloud } from './lib/ply'

type Mode = 'landing' | 'app'

export default function App() {
  const [mode, setMode] = useState<Mode>('landing')
  const [cloud, setCloud] = useState<PlyCloud | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [result, setResult] = useState<SegmentResult | null>(null)
  const [selected, setSelected] = useState<SegObject | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [apiOk, setApiOk] = useState<boolean | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [heightFilterOn, setHeightFilterOn] = useState(false)
  const [heightRange, setHeightRange] = useState<[number, number]>([0, 1])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const objectListRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    health()
      .then((h) => setApiOk(h.ok && h.seg3d))
      .catch(() => setApiOk(false))
  }, [])

  const yExtent = useMemo(() => {
    if (!cloud) return [0, 1] as [number, number]
    return [cloud.bbox.min[1], cloud.bbox.max[1]] as [number, number]
  }, [cloud])

  const objects = result?.objects ?? []

  const pointObjectIndex = useMemo(() => {
    if (!cloud || !objects.length) return null
    return buildPointObjectIndex(cloud, objects)
  }, [cloud, objects])

  const selectObject = useCallback((obj: SegObject | null) => {
    setSelected(obj)
  }, [])

  useEffect(() => {
    if (!selected) return
    const el = objectListRef.current?.querySelector<HTMLElement>(`[data-object-id="${selected.id}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  const ingestFile = useCallback(async (file: File) => {
    setError(null)
    setResult(null)
    setSelected(null)
    setJobId(null)
    setBusy('Parsing PLY…')
    try {
      const buf = await file.arrayBuffer()
      const ply = await loadPly(buf)
      setCloud(ply)
      setFileName(file.name)
      setHeightRange([ply.bbox.min[1], ply.bbox.max[1]])
      setMode('app')

      setBusy('Uploading to API…')
      try {
        const meta = await uploadPly(file)
        setJobId(meta.job_id)
        setApiOk(true)
      } catch {
        setJobId(null)
        setApiOk(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) void ingestFile(file)
    },
    [ingestFile],
  )

  const runSegment = useCallback(async () => {
    if (!jobId) {
      setError('Upload to API first (start the Python API, then re-drop the file).')
      return
    }
    setBusy('Running selectables segmentation…')
    setError(null)
    try {
      const res = await segmentJob(jobId, {
        max_planes: 6,
        plane_dist: 0.05,
        min_object_points: 40,
        max_objects: 30,
        method: 'graph',
      })
      setResult(res)
      setSelected(res.objects[0] ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }, [jobId])

  const loadDemo = useCallback(async () => {
    setBusy('Loading sample…')
    try {
      const res = await fetch('/samples/demo-room.ply')
      if (!res.ok) throw new Error('Sample missing — copy samples/demo-room.ply into web/public/samples/')
      const blob = await res.blob()
      const file = new File([blob], 'demo-room.ply', { type: 'application/octet-stream' })
      await ingestFile(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }, [ingestFile])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') === '1' || params.get('pickdemo') === '1') {
      setMode('app')
      void loadDemo()
    }
    // One-shot boot from ?demo=1 / ?pickdemo=1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-segment for pick demos once a job exists
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('pickdemo') !== '1') return
    if (!jobId || result || busy) return
    void runSegment()
  }, [jobId, result, busy, runSegment])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <strong>Open Reality Twin</strong>
          <span>point cloud · splat · selectables</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {mode === 'app' ? (
            <button type="button" className="ghost" onClick={() => setMode('landing')}>
              Home
            </button>
          ) : null}
          <button type="button" className="secondary" onClick={() => setMode('app')}>
            Open app
          </button>
        </div>
      </header>

      {mode === 'landing' ? (
        <main className="landing">
          <div className="hero">
            <h1>See the capture. Select the asset.</h1>
            <p>
              Open-source browser workspace for point clouds and Gaussian splat PLYs:
              orbit the scene, segment structure and objects, highlight selectables, and
              export per-object PLY — inspired by digital-twin workflows, built to stay free.
            </p>
            <div className="hero-actions">
              <button type="button" onClick={() => setMode('app')}>
                Enter workspace
              </button>
              <button type="button" className="secondary" onClick={() => void loadDemo()}>
                Load sample room
              </button>
            </div>
            <p className="disclaimer">
              Inspired by capabilities documented publicly for Prevu3D RealityPlatform /
              RealityTwin. Not affiliated with, endorsed by, or derived from Prevu3D
              proprietary software. MIT-licensed.
            </p>
          </div>
        </main>
      ) : (
        <div className="workspace">
          <aside className="side">
            <div
              className={`dropzone${dragOver ? ' active' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <strong>Drop PLY here</strong>
              <p>Point cloud or Graphdeco Gaussian · PCD via API later</p>
              <div style={{ marginTop: '0.75rem' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ply,.pcd"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void ingestFile(f)
                  }}
                />
                <button type="button" className="secondary" onClick={() => fileInputRef.current?.click()}>
                  Browse…
                </button>
              </div>
            </div>

            <div className="panel">
              <h2>Scene</h2>
              <div className="meta-row">
                <span>File</span>
                <span>{fileName ?? '—'}</span>
              </div>
              <div className="meta-row">
                <span>Points</span>
                <span>{cloud ? cloud.count.toLocaleString() : '—'}</span>
              </div>
              <div className="meta-row">
                <span>Kind</span>
                <span>{cloud ? (cloud.isGaussian ? 'Gaussian PLY' : 'Point cloud') : '—'}</span>
              </div>
              <div className="meta-row">
                <span>API</span>
                <span>{apiOk === null ? '…' : apiOk ? 'seg3d ready' : 'offline / no seg3d'}</span>
              </div>
              {busy ? <p className="status">{busy}</p> : null}
              {error ? <p className="status error">{error}</p> : null}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                <button type="button" disabled={!jobId || !!busy} onClick={() => void runSegment()}>
                  Segment objects
                </button>
                <button type="button" className="secondary" onClick={() => void loadDemo()}>
                  Sample
                </button>
              </div>
            </div>

            <div className="panel">
              <h2>Height filter</h2>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--muted)' }}>
                <input
                  type="checkbox"
                  checked={heightFilterOn}
                  onChange={(e) => setHeightFilterOn(e.target.checked)}
                />
                Clip by Y
              </label>
              <div className="slider-row">
                <label>
                  Min {heightRange[0].toFixed(2)}
                  <input
                    type="range"
                    min={yExtent[0]}
                    max={yExtent[1]}
                    step={(yExtent[1] - yExtent[0]) / 200 || 0.01}
                    value={heightRange[0]}
                    disabled={!heightFilterOn}
                    onChange={(e) =>
                      setHeightRange([Number(e.target.value), Math.max(Number(e.target.value), heightRange[1])])
                    }
                  />
                </label>
                <label>
                  Max {heightRange[1].toFixed(2)}
                  <input
                    type="range"
                    min={yExtent[0]}
                    max={yExtent[1]}
                    step={(yExtent[1] - yExtent[0]) / 200 || 0.01}
                    value={heightRange[1]}
                    disabled={!heightFilterOn}
                    onChange={(e) =>
                      setHeightRange([Math.min(heightRange[0], Number(e.target.value)), Number(e.target.value)])
                    }
                  />
                </label>
              </div>
            </div>

            <div className="panel">
              <h2>Objects {result ? `(${result.object_count ?? 0})` : ''}</h2>
              {!result ? (
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
                  Run segmentation to list structure planes and residual objects.
                </p>
              ) : (
                <ul className="object-list" ref={objectListRef}>
                  {result.objects.map((obj) => (
                    <li key={obj.id}>
                      <button
                        type="button"
                        data-object-id={obj.id}
                        className={selected?.id === obj.id ? 'selected' : ''}
                        onClick={() => selectObject(obj)}
                      >
                        <span>
                          {obj.label} · {obj.id}
                        </span>
                        <small>
                          {obj.kind} · {obj.shape ?? '—'} · {obj.point_count.toLocaleString()} pts
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selected && jobId ? (
                <div style={{ marginTop: '0.75rem' }}>
                  <a href={objectDownloadUrl(jobId, selected.path)} download>
                    Download object PLY
                  </a>
                </div>
              ) : null}
            </div>
          </aside>

          <div className="viewer-wrap">
            <SceneViewer
              cloud={cloud}
              objects={objects}
              selected={selected}
              pointObjectIndex={pointObjectIndex}
              heightMin={heightRange[0]}
              heightMax={heightRange[1]}
              heightFilterOn={heightFilterOn}
              onSelectObject={selectObject}
            />
            <div className="overlay-hint">
              Orbit drag · scroll zoom · click points to select objects
              {selected ? ` · selected ${selected.id}` : objects.length ? ' · segment ready' : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
