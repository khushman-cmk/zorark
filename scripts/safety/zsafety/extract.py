"""Clip the Geofabrik zone extracts to a bounding box and merge them.

Delhi NCR straddles two Geofabrik zones (Delhi/Gurgaon/Faridabad in
northern-zone, Noida/Ghaziabad in central-zone). For each zone we keep:

* ways relevant to routing or analysis that touch the bbox (complete, i.e.
  with all their nodes, so roads crossing the edge stay routable),
* untagged member ways of relevant multipolygons (water bodies, farmland),
* turn-restriction and relevant multipolygon relations touching the bbox,
* place nodes (village / suburb names for explanations),

then merge both clips with duplicate removal (ways on the Delhi-UP border
appear in both zones).
"""

from __future__ import annotations

import time
from pathlib import Path

import osmium

from . import config

WAY_KEYS = ("highway", "waterway", "natural", "landuse", "leisure", "water", "place")
MP_KEYS = ("natural", "landuse", "leisure", "water", "waterway", "place")


def _in_bbox(bbox, lon: float, lat: float) -> bool:
    return bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]


def _log(t0: float, msg: str) -> None:
    print(f"[extract] +{time.time() - t0:6.1f}s {msg}", flush=True)


def clip_zone(src: Path, dst: Path, bbox) -> dict:
    """Write the bbox clip of one zone file to ``dst``."""
    t0 = time.time()
    tracker = osmium.IdTracker()

    # 1. Candidate relations and the member ways they need.
    rel_members: dict[int, list[int]] = {}
    mp_way_ids: set[int] = set()
    for r in osmium.FileProcessor(str(src), osmium.osm.RELATION):
        rtype = r.tags.get("type")
        if rtype == "restriction" or (rtype or "").startswith("restriction:"):
            pass
        elif rtype == "multipolygon" and any(k in r.tags for k in MP_KEYS):
            pass
        else:
            continue
        ways = [m.ref for m in r.members if m.type == "w"]
        if not ways:
            continue
        rel_members[r.id] = ways
        if rtype == "multipolygon":
            mp_way_ids.update(ways)
    _log(t0, f"{src.name}: {len(rel_members)} candidate relations")

    # 2. Relevant ways touching the bbox (node locations cached in C++).
    kept_ways = 0
    proc = (
        osmium.FileProcessor(str(src), osmium.osm.NODE | osmium.osm.WAY)
        .with_locations("flex_mem")
        .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
    )
    for seen, w in enumerate(proc, 1):
        if seen % 1_000_000 == 0:
            _log(t0, f"  ... {seen:,} ways scanned, {kept_ways:,} kept")
        tags = w.tags
        if not (any(k in tags for k in WAY_KEYS) or w.id in mp_way_ids):
            continue
        for n in w.nodes:
            loc = n.location
            if loc.valid() and _in_bbox(bbox, loc.lon, loc.lat):
                tracker.add_way(w.id)
                kept_ways += 1
                break
    _log(t0, f"{kept_ways} ways touch the bbox")

    # 3. Relations with at least one kept member way.
    way_ids = tracker.way_ids()
    kept_rels = 0
    for rid, ways in rel_members.items():
        if any(wid in way_ids for wid in ways):
            tracker.add_relation(rid)
            kept_rels += 1

    # 4. Place nodes inside the bbox (filtered in C++ first).
    kept_places = 0
    for n in osmium.FileProcessor(str(src), osmium.osm.NODE).with_filter(osmium.filter.KeyFilter("place")):
        if _in_bbox(bbox, n.location.lon, n.location.lat):
            tracker.add_node(n.id)
            kept_places += 1
    _log(t0, f"{kept_rels} relations, {kept_places} places")

    # 5. Pull in every node / member way the kept objects reference.
    tracker.complete_backward_references(str(src), relation_depth=0)
    _log(t0, "references completed")

    dst.unlink(missing_ok=True)
    # Close writers explicitly: left to the garbage collector, the writer's
    # thread pool deadlocks at interpreter exit on Windows.
    writer = osmium.WriteHandler(str(dst))
    try:
        osmium.apply(str(src), tracker.id_filter(), writer)
    finally:
        writer.close()
    return {
        "zone": src.name,
        "ways": kept_ways,
        "relations": kept_rels,
        "places": kept_places,
        "seconds": round(time.time() - t0, 1),
    }


def merge(parts: list[Path], dst: Path) -> None:
    dst.unlink(missing_ok=True)
    reader = osmium.MergeInputReader()
    for p in parts:
        reader.add_file(str(p))
    writer = osmium.WriteHandler(str(dst))
    try:
        reader.apply(writer, simplify=True)
    finally:
        writer.close()


def run(bbox=None, zones=config.ZONES, dst: Path = config.NCR_PBF) -> None:
    config.ensure_dirs()
    bbox = bbox or config.load()["region"]["bbox"]
    parts = []
    for zone in zones:
        src = config.RAW_DIR / f"{zone}-latest.osm.pbf"
        if not src.exists():
            raise SystemExit(f"Missing {src} — run `python -m zsafety fetch` first")
        part = dst.with_name(f"{dst.stem.removesuffix('.osm')}.{zone}.osm.pbf")
        stats = clip_zone(src, part, bbox)
        print(f"[extract] {stats}")
        parts.append(part)
    if len(parts) == 1:
        dst.unlink(missing_ok=True)
        parts[0].replace(dst)
    else:
        merge(parts, dst)
        for p in parts:
            p.unlink(missing_ok=True)
    print(f"[extract] wrote {dst} ({dst.stat().st_size / 1e6:.1f} MB)")
