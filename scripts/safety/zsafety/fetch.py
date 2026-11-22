"""Download the Geofabrik zone extracts covering Delhi NCR (resumable, md5-checked)."""

from __future__ import annotations

import hashlib
import shutil
import urllib.request
from pathlib import Path

from . import config

BASE = "https://download.geofabrik.de/asia/india"


def _md5(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _expected_md5(zone: str) -> str:
    with urllib.request.urlopen(f"{BASE}/{zone}-latest.osm.pbf.md5", timeout=30) as r:
        return r.read().decode().split()[0]


def _download(url: str, dst: Path) -> None:
    part = dst.with_suffix(dst.suffix + ".part")
    have = part.stat().st_size if part.exists() else 0
    req = urllib.request.Request(url, headers={"Range": f"bytes={have}-"} if have else {})
    with urllib.request.urlopen(req, timeout=60) as r, part.open("ab" if have else "wb") as f:
        if have and r.status != 206:  # server ignored the range: start over
            f.seek(0)
            f.truncate()
        shutil.copyfileobj(r, f, 1 << 20)
    part.replace(dst)


def run(force: bool = False) -> None:
    config.ensure_dirs()
    for zone in config.ZONES:
        dst = config.RAW_DIR / f"{zone}-latest.osm.pbf"
        expected = _expected_md5(zone)
        if dst.exists() and not force and _md5(dst) == expected:
            print(f"[fetch] {dst.name} is current")
            continue
        print(f"[fetch] downloading {zone} ...", flush=True)
        _download(f"{BASE}/{zone}-latest.osm.pbf", dst)
        if _md5(dst) != expected:
            dst.unlink()
            raise SystemExit(f"[fetch] checksum mismatch for {zone}; deleted, please retry")
        print(f"[fetch] {dst.name} OK ({dst.stat().st_size / 1e6:.0f} MB)")
