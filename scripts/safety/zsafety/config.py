"""Shared configuration, paths and the 100 m analysis grid.

``config/safety-model.json`` is the single source of truth for every weight and
threshold; the Next.js server reads the same file. The grid maths here is
mirrored in ``src/lib/safety/grid.ts`` and pinned by
``config/safety-testvectors.json`` so both sides index cells identically.
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from functools import cache
from pathlib import Path

import numpy as np
import orjson

ROOT = Path(__file__).resolve().parents[3]
CONFIG_PATH = ROOT / "config" / "safety-model.json"
CHECKPOINTS_PATH = ROOT / "config" / "safety-checkpoints.json"
TESTVECTORS_PATH = ROOT / "config" / "safety-testvectors.json"

RAW_DIR = ROOT / "data" / "osm" / "raw"
OSM_DIR = ROOT / "data" / "osm"
OUT_DIR = ROOT / "data" / "safety"
PUBLIC_DIR = ROOT / "public" / "safety"

ZONES = ("northern-zone", "central-zone")
NCR_PBF = OSM_DIR / "ncr.osm.pbf"
SAFETY_PBF = OSM_DIR / "ncr.safety.osm.pbf"


@cache
def load() -> dict:
    return orjson.loads(CONFIG_PATH.read_bytes())


def config_hash() -> str:
    """Content hash of the model file, line endings normalised (git autocrlf)."""
    raw = CONFIG_PATH.read_bytes().replace(b"\r\n", b"\n")
    return hashlib.sha256(raw).hexdigest()[:12]


@dataclass(frozen=True)
class Grid:
    west: float
    south: float
    east: float
    north: float
    cell_m: float
    m_per_deg_lat: float
    m_per_deg_lon: float
    nx: int
    ny: int

    @property
    def size(self) -> int:
        return self.nx * self.ny

    def to_xy(self, lon, lat):
        """Local metres from the grid's south-west corner (equirectangular)."""
        x = (np.asarray(lon, dtype=np.float64) - self.west) * self.m_per_deg_lon
        y = (np.asarray(lat, dtype=np.float64) - self.south) * self.m_per_deg_lat
        return x, y

    def to_lonlat(self, x, y):
        lon = np.asarray(x, dtype=np.float64) / self.m_per_deg_lon + self.west
        lat = np.asarray(y, dtype=np.float64) / self.m_per_deg_lat + self.south
        return lon, lat

    def cell_index(self, lon, lat):
        """Flat cell index ``iy * nx + ix``; -1 outside the grid."""
        x, y = self.to_xy(lon, lat)
        ix = np.floor(x / self.cell_m).astype(np.int64)
        iy = np.floor(y / self.cell_m).astype(np.int64)
        inside = (ix >= 0) & (ix < self.nx) & (iy >= 0) & (iy < self.ny)
        return np.where(inside, iy * self.nx + ix, -1)

    def cell_center(self, idx):
        idx = np.asarray(idx, dtype=np.int64)
        iy, ix = np.divmod(idx, self.nx)
        return self.to_lonlat((ix + 0.5) * self.cell_m, (iy + 0.5) * self.cell_m)

    def contains(self, lon: float, lat: float) -> bool:
        return self.west <= lon <= self.east and self.south <= lat <= self.north


@cache
def grid() -> Grid:
    cfg = load()
    west, south, east, north = cfg["region"]["bbox"]
    g = cfg["grid"]
    m_lat = float(g["mPerDegLat"])
    m_lon = m_lat * math.cos(math.radians(g["lat0"]))
    cell = float(g["cellM"])
    nx = math.ceil((east - west) * m_lon / cell)
    ny = math.ceil((north - south) * m_lat / cell)
    return Grid(west, south, east, north, cell, m_lat, m_lon, nx, ny)


def ensure_dirs() -> None:
    for d in (RAW_DIR, OSM_DIR, OUT_DIR, PUBLIC_DIR):
        d.mkdir(parents=True, exist_ok=True)
