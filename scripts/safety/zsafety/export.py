"""Export the analysis for the web app.

* ``data/safety/grid.bin`` + ``grid.json`` — the 100 m grid as packed byte
  layers, loaded once by the Next.js server to explain risky stretches
  ("unplanned lanes, 31 % dead ends", "35 m from Hindon river", "near Gejha").
* ``public/safety/overlay.geojson`` — the risk heatmap: merged, smoothed
  polygons per kind (unplanned / water / rural) and band, painted only where
  drivable roads exist.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

import numpy as np
import orjson
import shapely

from . import config

SCALE = 250.0  # fractions 0..1 stored as round(v * 250) in a byte


def _u8(v: np.ndarray, scale: float = SCALE) -> np.ndarray:
    return np.clip(np.rint(np.nan_to_num(v) * scale), 0, 255).astype(np.uint8)


def write_grid(a, meta: dict, g: config.Grid) -> None:
    water_id = np.where(a["water_id"] >= 0, a["water_id"], 65535).astype(np.uint16)
    wdist = np.where(np.isfinite(a["water_dist"]), np.minimum(a["water_dist"], 250), 255)
    layers = [
        ("u", "u8", _u8(a["U"]), 1 / SCALE),
        ("phi", "u8", _u8(a["phi"]), 1 / SCALE),
        ("dead", "u8", _u8(a["dead_share"]), 1 / SCALE),
        ("rural", "u8", _u8(a["rural"]), 1 / SCALE),
        ("wdist", "u8", np.rint(wdist).astype(np.uint8), 1.0),
        ("flags", "u8", (a["low_data"].astype(np.uint8) | (a["has_road"].astype(np.uint8) << 1)), 1.0),
        ("wid", "u16", water_id, 1.0),
        ("pid", "u16", a["place_id"].astype(np.uint16), 1.0),
    ]
    blobs, specs, offset = [], [], 0
    for name, dtype, arr, scale in layers:
        if dtype == "u16" and offset % 2:  # keep u16 layers aligned for typed-array views
            blobs.append(b"\0")
            offset += 1
        raw = arr.astype("<u2" if dtype == "u16" else "u1").tobytes()
        specs.append({"name": name, "dtype": dtype, "offset": offset, "length": int(arr.size), "scale": scale})
        blobs.append(raw)
        offset += len(raw)
    (config.OUT_DIR / "grid.bin").write_bytes(b"".join(blobs))
    (config.OUT_DIR / "grid.json").write_bytes(orjson.dumps({
        "version": 1,
        "configHash": config.config_hash(),
        "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "west": g.west, "south": g.south, "cellM": g.cell_m,
        "mPerDegLat": g.m_per_deg_lat, "mPerDegLon": g.m_per_deg_lon, "nx": g.nx, "ny": g.ny,
        "layers": specs,
        "flags": {"lowData": 1, "hasRoad": 2},
        "waters": meta["waters"],
        "places": meta["places"],
    }))


def _cells_polygon(cells: np.ndarray, g: config.Grid):
    if not len(cells):
        return None
    iy, ix = np.divmod(cells, g.nx)
    boxes = shapely.box(ix * g.cell_m, iy * g.cell_m, (ix + 1) * g.cell_m, (iy + 1) * g.cell_m)
    merged = shapely.coverage_union_all(boxes)
    # Round the staircase edges and close hairline gaps, then simplify.
    smooth = merged.buffer(35, quad_segs=2).buffer(-35, quad_segs=2).simplify(15)
    return None if smooth.is_empty else smooth


def _to_lonlat(geom, g: config.Grid):
    def fn(coords):
        out = np.empty_like(coords)
        out[:, 0] = np.round(coords[:, 0] / g.m_per_deg_lon + g.west, 5)
        out[:, 1] = np.round(coords[:, 1] / g.m_per_deg_lat + g.south, 5)
        return out

    return shapely.transform(geom, fn)


def write_overlay(a, cfg: dict, g: config.Grid) -> None:
    road = a["has_road"]
    usable = road & ~a["low_data"]
    wdist = a["water_dist"]
    wcfg = cfg["water"]
    layers = []
    for band, th in enumerate(cfg["unplanned"]["bands"], 1):
        layers.append(("unplanned", band, np.nonzero(usable & (a["U"] >= th))[0]))
    layers.append(("water", 1, np.nonzero(road & (wdist <= wcfg["zoneM"]))[0]))
    layers.append(("water", 2, np.nonzero(road & (wdist <= wcfg["nearM"]))[0]))
    for band, th in enumerate(cfg["rural"]["bands"], 1):
        layers.append(("rural", band, np.nonzero(road & (a["rural"] >= th))[0]))

    features = []
    for kind, band, cells in layers:
        poly = _cells_polygon(cells, g)
        if poly is None:
            continue
        features.append({
            "type": "Feature",
            "properties": {"kind": kind, "band": band, "cells": int(len(cells))},
            "geometry": shapely.geometry.mapping(_to_lonlat(poly, g)),
        })
        print(f"[export] overlay {kind} band {band}: {len(cells):,} cells", flush=True)
    out = config.PUBLIC_DIR / "overlay.geojson"
    out.write_bytes(orjson.dumps({"type": "FeatureCollection", "configHash": config.config_hash(), "features": features}))
    print(f"[export] wrote {out.name} ({out.stat().st_size / 1e6:.1f} MB)", flush=True)


def run() -> None:
    t0 = time.time()
    config.ensure_dirs()
    cfg = config.load()
    g = config.grid()
    a = np.load(config.OUT_DIR / "analysis.npz")
    meta = orjson.loads((config.OUT_DIR / "analysis.meta.json").read_bytes())
    write_grid(a, meta, g)
    print(f"[export] wrote grid.bin ({(config.OUT_DIR / 'grid.bin').stat().st_size / 1e6:.1f} MB)", flush=True)
    write_overlay(a, cfg, g)
    print(f"[export] done in {time.time() - t0:.1f}s", flush=True)
