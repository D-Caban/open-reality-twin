# Open Reality Twin

Open-source **web app** for uploading point clouds and Gaussian splat PLYs, navigating them in the browser, running **object segmentation** into selectable assets, highlighting objects, and exporting per-object PLY.

**Inspired by** publicly documented Prevu3D RealityPlatform / RealityTwin capabilities (viewer, RealityAssets-style objects, splat + point-cloud roles).  
**Not affiliated with, endorsed by, or derived from Prevu3D.** No proprietary Prevu3D code is used.

## Features (MVP)

- Drag-and-drop **PLY** upload (XYZRGB point clouds and Graphdeco-style Gaussian training PLYs)
- WebGL viewer with **orbit** controls (React Three Fiber)
- Optional **height (Y) filter**
- Local **FastAPI** job that runs `seg3d selectables` (plane RANSAC + residual graph/DBSCAN → object PLYs + manifest)
- Object list → click to highlight AABB / tint → **download object PLY**
- **Viewport picking:** click a point belonging to a segmented object to select it (syncs Objects panel)

## Stack

| Part | Tech |
|---|---|
| Web | Vite, React, TypeScript, Three.js / R3F / drei |
| API | FastAPI + [seg3d](https://github.com/D-Caban/Segmentation_Multi-Order-RANSAC-DBSCAN) (Open3D) |
| License | MIT |

## Formats

| Format | MVP |
|---|---|
| `.ply` point cloud | Yes (client view + API seg) |
| `.ply` Graphdeco Gaussian | Yes (view as colored points; seg preserves Gaussian attrs via seg3d) |
| `.pcd` | Upload accepted by API when Open3D can read it; client preview is PLY-first |
| `.las` / `.sog` / `.ksplat` / `.splat` / `.spz` | Later — convert to PLY for now |

## Quick start

### 1. Segmentation API

```bash
# Optional: reuse a local seg3d checkout
export LD_LIBRARY_PATH="$HOME/.local/lib:$LD_LIBRARY_PATH"   # Linux Open3D / libusb

cd api
python3.11 -m venv .venv   # 3.10–3.12 recommended (Open3D wheels)
source .venv/bin/activate
pip install -r requirements.txt
pip install -e ../../Segmentation_Multi-Order-RANSAC-DBSCAN
# or: pip install "git+https://github.com/D-Caban/Segmentation_Multi-Order-RANSAC-DBSCAN.git"

uvicorn app.main:app --reload --host 127.0.0.1 --port 8787
```

Health check: http://127.0.0.1:8787/health — `"seg3d": true` means segmentation is ready.

### 2. Web app

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173 — drop a PLY, or load the sample room. With the API up, click **Segment objects**.

Set `VITE_API_URL` if the API is not on `http://127.0.0.1:8787`.

## Demo data

- Built-in sample: `web/public/samples/demo-room.ply`
- Larger Gaussian smoke: Faber House Graphdeco PLY (local), e.g.  
  `Faber_House_8M/Train_Splat/point_cloud_2.ply` (~2M Gaussians — expect longer segment times / more RAM)

## MVP vs later

| In MVP | Later |
|---|---|
| Orbit viewer, PLY upload, height clip | Fly navigation, photospheres |
| Classical selectables seg (planes + graph) | Browser neural “Magic Wand” AI |
| Object list + AABB highlight + PLY export | Multi-box refine UX, rich metadata forms |
| Local API on one machine | Container deploy / WASM-in-browser seg |
| | BIM/CAD floating layers, LAS native, compressed splat formats |

## Disclaimer

This project is an independent open-source experiment. Prevu3D® and related product names are trademarks of their respective owners. Capability ideas were taken from **public documentation only**.

## License

MIT — see [LICENSE](./LICENSE).
