"""FastAPI backend: upload PLY → seg3d selectables → list / download objects."""

from __future__ import annotations

import json
import os
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

DATA_ROOT = Path(os.environ.get("ORT_DATA_DIR", Path(__file__).resolve().parents[1] / "data"))
DATA_ROOT.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Open Reality Twin API",
    description="Upload point clouds / Gaussian PLYs and run selectable-object segmentation.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SegmentRequest(BaseModel):
    job_id: str
    max_planes: int = Field(6, ge=0, le=32)
    plane_dist: float = Field(0.03, gt=0)
    min_object_points: int = Field(80, ge=10)
    max_objects: int = Field(40, ge=1, le=200)
    method: str = Field("graph", pattern="^(graph|dbscan)$")
    skip_downsample: bool = True
    voxel: float = 0.0


def _job_dir(job_id: str) -> Path:
    path = DATA_ROOT / job_id
    if not path.exists():
        raise HTTPException(404, f"Unknown job_id: {job_id}")
    return path


def _run_selectables(
    input_ply: Path,
    out_dir: Path,
    req: SegmentRequest,
) -> dict[str, Any]:
    try:
        from seg3d.objects import ObjectConfig
        from seg3d.graph import GraphConfig
        from seg3d.preprocess import PreprocessConfig
        from seg3d.segment import SegmentConfig
        from seg3d.selectables import SelectablesConfig, run_selectables
    except ImportError as exc:
        raise HTTPException(
            503,
            "seg3d is not installed. See api/requirements.txt "
            "(pip install the Segmentation_Multi-Order-RANSAC-DBSCAN package).",
        ) from exc

    out_dir.mkdir(parents=True, exist_ok=True)
    pre = PreprocessConfig(
        skip_downsample=req.skip_downsample or req.voxel <= 0,
        voxel_size=0.0 if req.skip_downsample else req.voxel,
        skip_outlier=False,
    )
    objects = ObjectConfig(
        segment=SegmentConfig(
            max_planes=req.max_planes,
            distance_threshold=req.plane_dist,
            min_plane_inliers=50,
            dbscan_eps=0.15,
            dbscan_min_points=20,
        ),
        graph=GraphConfig(),
        method=req.method,
        min_object_points=req.min_object_points,
        max_objects=req.max_objects,
    )
    cfg = SelectablesConfig(
        input_path=input_ply,
        output_dir=out_dir,
        preprocess=pre,
        objects=objects,
        include_noise=False,
        write_labels_npy=False,
    )
    return run_selectables(cfg)


@app.get("/health")
def health() -> dict[str, Any]:
    seg3d_ok = False
    try:
        import seg3d  # noqa: F401

        seg3d_ok = True
    except ImportError:
        pass
    return {"ok": True, "seg3d": seg3d_ok, "data_root": str(DATA_ROOT)}


@app.post("/jobs")
async def create_job(file: UploadFile = File(...)) -> dict[str, Any]:
    name = file.filename or "upload.ply"
    if not name.lower().endswith((".ply", ".pcd")):
        raise HTTPException(400, "MVP accepts .ply or .pcd uploads")

    job_id = uuid.uuid4().hex[:12]
    job = DATA_ROOT / job_id
    job.mkdir(parents=True, exist_ok=True)
    dest = job / f"source{Path(name).suffix.lower()}"
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    meta = {
        "job_id": job_id,
        "filename": name,
        "bytes": dest.stat().st_size,
        "source": dest.name,
        "status": "uploaded",
    }
    (job / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


@app.post("/jobs/{job_id}/segment")
def segment_job(job_id: str, req: SegmentRequest | None = None) -> dict[str, Any]:
    job = _job_dir(job_id)
    body = req or SegmentRequest(job_id=job_id)
    body.job_id = job_id

    sources = list(job.glob("source.*"))
    if not sources:
        raise HTTPException(400, "No uploaded source file on this job")
    source = sources[0]
    out_dir = job / "selectables"
    if out_dir.exists():
        shutil.rmtree(out_dir)

    try:
        manifest = _run_selectables(source, out_dir, body)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — surface pipeline errors to client
        raise HTTPException(500, f"Segmentation failed: {exc}") from exc

    # Strip absolute host paths from public response
    public_objects = []
    for obj in manifest.get("objects", []):
        public_objects.append(
            {
                "id": obj.get("id"),
                "kind": obj.get("kind"),
                "label": obj.get("label"),
                "shape": obj.get("shape"),
                "aabb": obj.get("aabb"),
                "centroid": obj.get("centroid"),
                "point_count": obj.get("point_count"),
                "path": obj.get("path"),
            }
        )

    result = {
        "job_id": job_id,
        "status": "segmented",
        "is_gaussian": manifest.get("is_gaussian"),
        "working_points": manifest.get("working_points"),
        "object_count": manifest.get("object_count"),
        "structure_count": manifest.get("structure_count"),
        "selectable_count": manifest.get("selectable_count"),
        "objects": public_objects,
        "overview": "selectables/overview.ply" if (out_dir / "overview.ply").exists() else None,
    }
    (job / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    job = _job_dir(job_id)
    meta = json.loads((job / "meta.json").read_text(encoding="utf-8"))
    result_path = job / "result.json"
    if result_path.exists():
        meta["result"] = json.loads(result_path.read_text(encoding="utf-8"))
    return meta


@app.get("/jobs/{job_id}/files/{file_path:path}")
def get_file(job_id: str, file_path: str) -> FileResponse:
    job = _job_dir(job_id)
    target = (job / file_path).resolve()
    if not str(target).startswith(str(job.resolve())):
        raise HTTPException(400, "Invalid path")
    if not target.is_file():
        raise HTTPException(404, "File not found")
    media = "application/octet-stream"
    if target.suffix.lower() == ".ply":
        media = "application/x-ply"
    elif target.suffix.lower() == ".json":
        media = "application/json"
    return FileResponse(target, media_type=media, filename=target.name)
