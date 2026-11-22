"""Road-safety analysis on the clipped NCR extract.

The idea is a "snapshot" of the street network around every point: within a
250 m radius, planned sectors have straight, grid-aligned streets with few dead
ends, while urban villages and unauthorised colonies have chaotic,
dead-end-heavy lanes. We measure that on a 100 m grid:

* orientation order φ (Boeing 2019): how concentrated street bearings are,
* dead-end share among junction-like nodes,
* share of 4-way junctions (grids) vs T-junctions,
* metres of street per junction and street density,

then combine them into an "unplanned" score U per cell. Water proximity and
rural land use are measured alongside, and each drivable OSM way receives a
risk level 0-6 that GraphHopper uses for routing (see tag.py).

The "street fabric" fed into the chaos metrics is the local network only:
minor roads (private sector roads included — Noida's sector grids are tagged
access=private) plus footway/path lanes, which is how many village galis are
mapped. Excluded: arterials (the safe alternative skirting a village is usually
one), parking aisles and gated-society service roads, sidewalks/crossings, and
footpaths inside parks, campuses and cemeteries, which are curvy for unrelated
reasons.
"""

from __future__ import annotations

import math
import re
import time
from dataclasses import dataclass

import numpy as np
import orjson
import osmium
import shapely
from scipy import ndimage
from scipy.spatial import cKDTree

from . import config

DRIVABLE = (
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link", "unclassified",
    "residential", "living_street", "service", "track", "road",
)
LANES = ("pedestrian", "footway", "path", "steps")
ALL_CLASSES = DRIVABLE + LANES
CLASS_CODE = {c: i for i, c in enumerate(ALL_CLASSES)}
MOTORWAY_CODES = (CLASS_CODE["motorway"], CLASS_CODE["motorway_link"])
PLACE_KINDS = {"village", "hamlet", "suburb", "neighbourhood", "quarter", "town", "city", "locality", "isolated_dwelling"}
GENERIC_AREA = re.compile(
    r"^\W*(?:[a-z0-9]{1,2}[\s\-]*)?(?:block|blk|pocket|phase|tower)\b|\b(?:block|blk|pocket)\W*[a-z0-9]{0,3}\W*$|^.{0,3}$",
    re.IGNORECASE,
)
N_BINS = 18  # bearings folded to [0, 180): an 18-bin histogram equals a symmetric 36-bin one
BIN_OFFSETS = (0.0, 2.5, 5.0, 7.5)  # stops grids rotated onto a bin edge looking disordered
SAMPLE_M = 20.0


def _log(t0: float, msg: str) -> None:
    print(f"[analyze] +{time.time() - t0:6.1f}s {msg}", flush=True)


# ─── Loading ─────────────────────────────────────────────────────────────────


@dataclass
class Roads:
    way_id: np.ndarray  # int64 [W]
    cls: np.ndarray  # uint8 [W] index into ALL_CLASSES
    drivable: np.ndarray  # bool [W]  routable by car (gets a risk level)
    fabric: np.ndarray  # bool [W]    feeds the chaos metrics
    lane: np.ndarray  # bool [W]      footway/path lane (subject to area exclusion)
    bridge: np.ndarray  # bool [W]    bridge / tunnel: no area or water risk
    offsets: np.ndarray  # int64 [W+1] into the node arrays
    node_id: np.ndarray  # int64 [N]
    lon: np.ndarray  # float64 [N]
    lat: np.ndarray  # float64 [N]

    def subset(self, mask: np.ndarray) -> "Roads":
        idx = np.nonzero(mask)[0]
        counts = np.diff(self.offsets)[idx]
        starts = self.offsets[idx]
        take = np.repeat(starts, counts) + (np.arange(counts.sum()) - np.repeat(np.cumsum(counts) - counts, counts))
        return Roads(
            way_id=self.way_id[idx], cls=self.cls[idx], drivable=self.drivable[idx], fabric=self.fabric[idx],
            lane=self.lane[idx], bridge=self.bridge[idx],
            offsets=np.concatenate([[0], np.cumsum(counts)]).astype(np.int64),
            node_id=self.node_id[take], lon=self.lon[take], lat=self.lat[take],
        )

    @property
    def node_way(self) -> np.ndarray:
        return np.repeat(np.arange(len(self.way_id)), np.diff(self.offsets))


def _name(tags) -> str:
    return tags.get("name:en") or tags.get("name") or ""


def _tag_in(tags, spec: dict) -> bool:
    return any(tags.get(k) in set(v) for k, v in spec.items())


def load(cfg: dict, t0: float):
    wcfg, rcfg, ucfg = cfg["water"], cfg["rural"], cfg["unplanned"]
    minor_classes = set(ucfg["minorClasses"])
    lane_classes = set(ucfg["laneClasses"])
    excl_service = set(ucfg["excludeService"])
    excl_footway = set(ucfg["excludeFootway"])
    excl_private_service = bool(ucfg["excludePrivateService"])
    lane_excl_areas = ucfg["laneExcludeAreas"]
    line_kinds = wcfg["lineBufferM"]
    water_poly_tags = {k: set(v) for k, v in wcfg["polygonTags"].items()}
    rural_landuse = set(rcfg["landuse"]) | set(rcfg["landuseForest"])
    rural_natural = set(rcfg["natural"])

    way_ids, classes, drivables, fabrics, lanes, bridges, offsets = [], [], [], [], [], [], [0]
    node_ids: list[int] = []
    lons: list[float] = []
    lats: list[float] = []
    water_geoms, water_meta, rural_geoms, exclude_geoms, area_places = [], [], [], [], []
    wkb = osmium.geom.WKBFactory()

    proc = (
        osmium.FileProcessor(str(config.NCR_PBF))
        .with_locations()
        .with_areas()
        .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY | osmium.osm.AREA))
    )
    for obj in proc:
        tags = obj.tags
        if obj.is_area():
            kind = None
            for key, values in water_poly_tags.items():
                v = tags.get(key)
                if v is not None and ("*" in values or v in values):
                    kind = tags.get("water") or ("water" if key == "natural" and v == "water" else v)
                    break
            is_rural = tags.get("landuse") in rural_landuse or tags.get("natural") in rural_natural
            is_excl = _tag_in(tags, lane_excl_areas)
            area_name = _name(tags) if tags.get("landuse") == "residential" else ""
            if area_name and GENERIC_AREA.search(area_name):
                area_name = ""  # "A Block", "Pocket 3": no use as a landmark
            if kind is None and not is_rural and not is_excl and not area_name:
                continue
            try:
                geom = shapely.from_wkb(bytes.fromhex(wkb.create_multipolygon(obj)))
            except Exception:
                continue
            if kind is not None:
                water_geoms.append(geom)
                water_meta.append((kind, _name(tags)))
            if is_rural:
                rural_geoms.append(geom)
            if is_excl:
                exclude_geoms.append(geom)
            if area_name:
                pt = geom.representative_point()
                area_places.append((area_name, "area", pt.x, pt.y))
            continue

        hw = tags.get("highway")
        if hw in CLASS_CODE:
            nodes = obj.nodes
            if len(nodes) < 2:
                continue
            ids, xs, ys = [], [], []
            for n in nodes:
                loc = n.location
                if not loc.valid():
                    break
                ids.append(n.ref)
                xs.append(loc.lon)
                ys.append(loc.lat)
            else:
                access = tags.get("access")
                is_lane = hw in lane_classes and tags.get("footway") not in excl_footway
                is_minor = (
                    hw in minor_classes
                    and tags.get("service") not in excl_service
                    and not (excl_private_service and hw == "service" and access in ("private", "no"))
                )
                way_ids.append(obj.id)
                classes.append(CLASS_CODE[hw])
                drivables.append(hw in DRIVABLE)
                fabrics.append(is_minor or is_lane)
                lanes.append(is_lane)
                bridges.append(tags.get("bridge", "no") != "no" or tags.get("tunnel", "no") != "no")
                node_ids.extend(ids)
                lons.extend(xs)
                lats.extend(ys)
                offsets.append(len(node_ids))
            continue

        ww = tags.get("waterway")
        if ww in line_kinds and tags.get("tunnel", "no") in ("no", ""):
            try:
                line = shapely.from_wkb(bytes.fromhex(wkb.create_linestring(obj)))
            except Exception:
                continue
            water_geoms.append(("line", line, float(line_kinds[ww])))
            water_meta.append((ww, _name(tags)))

    roads = Roads(
        way_id=np.asarray(way_ids, dtype=np.int64),
        cls=np.asarray(classes, dtype=np.uint8),
        drivable=np.asarray(drivables, dtype=bool),
        fabric=np.asarray(fabrics, dtype=bool),
        lane=np.asarray(lanes, dtype=bool),
        bridge=np.asarray(bridges, dtype=bool),
        offsets=np.asarray(offsets, dtype=np.int64),
        node_id=np.asarray(node_ids, dtype=np.int64),
        lon=np.asarray(lons, dtype=np.float64),
        lat=np.asarray(lats, dtype=np.float64),
    )
    _log(t0, f"loaded {int(roads.drivable.sum()):,} drivable + {int((~roads.drivable).sum()):,} lane ways, "
             f"{len(node_ids):,} way nodes, {len(water_geoms):,} water features, {len(rural_geoms):,} rural areas, "
             f"{len(exclude_geoms):,} park/campus areas")

    places = []
    for n in osmium.FileProcessor(str(config.NCR_PBF), osmium.osm.NODE).with_filter(osmium.filter.KeyFilter("place")):
        if n.tags.get("place") in PLACE_KINDS and _name(n.tags):
            places.append((_name(n.tags), n.tags.get("place"), n.location.lon, n.location.lat))
    _log(t0, f"{len(places):,} named places, {len(area_places):,} named residential areas")
    return roads, water_geoms, water_meta, rural_geoms, exclude_geoms, places, area_places


# ─── Geometry helpers ────────────────────────────────────────────────────────


def _to_local(geom, g: config.Grid):
    def fn(coords):
        out = np.empty_like(coords)
        out[:, 0] = (coords[:, 0] - g.west) * g.m_per_deg_lon
        out[:, 1] = (coords[:, 1] - g.south) * g.m_per_deg_lat
        return out

    return shapely.transform(geom, fn)


def _disk_kernel(radius_m: float, cell_m: float) -> np.ndarray:
    r = radius_m / cell_m
    k = int(math.floor(r))
    yy, xx = np.mgrid[-k : k + 1, -k : k + 1]
    return (np.hypot(xx, yy) <= r + 1e-9).astype(np.float32)


def _smooth(flat: np.ndarray, g: config.Grid, kernel: np.ndarray) -> np.ndarray:
    grid2d = flat.reshape(g.ny, g.nx).astype(np.float32, copy=False)
    return ndimage.convolve(grid2d, kernel, mode="constant", cval=0.0).ravel()


def _ramp(v: np.ndarray, zero_at: float, one_at: float) -> np.ndarray:
    """Linear 0→1 between ``zero_at`` and ``one_at`` (either direction), clamped."""
    return np.clip((v - zero_at) / (one_at - zero_at), 0.0, 1.0)


def orientation_order(hist: np.ndarray) -> np.ndarray:
    """Orientation order φ from length-weighted bearing histograms.

    ``hist`` has shape (n, 18): bearings folded to [0°, 180°) in 10° bins. Counting
    each street in both directions makes the 36-bin entropy H36 = H18 + ln 2.
    φ = 1 − ((H36 − ln 4) / (ln 36 − ln 4))², so a perfect two-direction grid
    scores 1 and uniformly spread bearings score 0 (Boeing 2019).
    """
    h_max, h_grid = math.log(36), math.log(4)
    tot = hist.sum(axis=1, keepdims=True)
    with np.errstate(divide="ignore", invalid="ignore"):
        p = np.where(tot > 0, hist / tot, 0.0)
        h18 = -np.sum(np.where(p > 0, p * np.log(p), 0.0), axis=1)
    h36 = h18 + math.log(2)
    order = np.where(h36 < h_grid, 1.0, 1.0 - ((h36 - h_grid) / (h_max - h_grid)) ** 2)
    return np.clip(order, 0.0, 1.0).astype(np.float32)


def _cells_of(x: np.ndarray, y: np.ndarray, g: config.Grid):
    ix = np.floor(x / g.cell_m).astype(np.int64)
    iy = np.floor(y / g.cell_m).astype(np.int64)
    inside = (ix >= 0) & (ix < g.nx) & (iy >= 0) & (iy < g.ny)
    return np.where(inside, iy * g.nx + ix, 0), inside


def exclude_park_lanes(roads: Roads, exclude_geoms, g: config.Grid) -> int:
    """Drop footway/path lanes whose middle lies in a park, campus or cemetery."""
    lane_idx = np.nonzero(roads.lane & roads.fabric)[0]
    if not len(lane_idx) or not exclude_geoms:
        return 0
    mid = roads.offsets[lane_idx] + np.diff(roads.offsets)[lane_idx] // 2
    x, y = g.to_xy(roads.lon[mid], roads.lat[mid])
    tree = shapely.STRtree([_to_local(geom, g) for geom in exclude_geoms])
    hit, _ = tree.query(shapely.points(x, y), predicate="intersects")
    drop = np.unique(lane_idx[hit])
    roads.fabric[drop] = False
    return len(drop)


# ─── Network metrics ─────────────────────────────────────────────────────────


def network_metrics(roads: Roads, g: config.Grid, cfg: dict, t0: float) -> dict:
    ucfg = cfg["unplanned"]
    kernel = _disk_kernel(cfg["grid"]["snapshotRadiusM"], g.cell_m)
    disk_km2 = kernel.sum() * (g.cell_m / 1000.0) ** 2

    # Streets that define the local network: fabric + every drivable road
    # (so a lane ending on an arterial is a junction, not a dead end).
    net = roads.subset(roads.fabric | roads.drivable)
    x, y = g.to_xy(net.lon, net.lat)
    node_way = net.node_way

    # Fabric segments: length + bearing, binned at the segment midpoint.
    same_way = node_way[:-1] == node_way[1:]
    i0 = np.nonzero(same_way & net.fabric[node_way[:-1]])[0]
    dx = x[i0 + 1] - x[i0]
    dy = y[i0 + 1] - y[i0]
    seg_len = np.hypot(dx, dy)
    keep = seg_len > 0.5
    i0, dx, dy, seg_len = i0[keep], dx[keep], dy[keep], seg_len[keep]
    cell, inside = _cells_of((x[i0] + x[i0 + 1]) * 0.5, (y[i0] + y[i0 + 1]) * 0.5, g)
    cell, seg_len, dx, dy = cell[inside], seg_len[inside], dx[inside], dy[inside]
    lane_seg = net.lane[node_way[i0]][inside]
    bearing = np.degrees(np.arctan2(dx, dy)) % 180.0

    fabric_len = np.bincount(cell, weights=seg_len, minlength=g.size)
    lane_len = np.bincount(cell, weights=seg_len * lane_seg, minlength=g.size)
    L = _smooth(fabric_len, g, kernel)
    lane_share = np.where(L > 0, _smooth(lane_len, g, kernel) / np.maximum(L, 1e-9), 0.0)

    # Orientation order, best over a few bin offsets.
    phi = np.zeros(g.size, dtype=np.float32)
    for off in BIN_OFFSETS:
        b = (np.floor(((bearing + off) % 180.0) / 10.0).astype(np.int64)) % N_BINS
        hist = np.bincount(cell * N_BINS + b, weights=seg_len, minlength=g.size * N_BINS).reshape(g.size, N_BINS)
        sm = np.stack([_smooth(hist[:, k], g, kernel) for k in range(N_BINS)], axis=1)
        phi = np.maximum(phi, orientation_order(sm))
        del hist, sm
    _log(t0, f"orientation order over {len(cell):,} street segments")

    # Node degree; dead ends / junctions that touch the fabric.
    is_end = np.zeros(len(net.node_id), dtype=bool)
    is_end[net.offsets[:-1]] = True
    is_end[net.offsets[1:] - 1] = True
    _, first, inv = np.unique(net.node_id, return_index=True, return_inverse=True)
    deg = np.bincount(inv, weights=np.where(is_end, 1.0, 2.0))
    touches = np.bincount(inv, weights=net.fabric[node_way].astype(np.float64)) > 0
    ncell, ninside = _cells_of(x[first], y[first], g)
    ok = touches & ninside

    def count(mask):
        return np.bincount(ncell, weights=(mask & ok).astype(np.float64), minlength=g.size)

    D = _smooth(count(deg == 1), g, kernel)
    J = _smooth(count(deg >= 3), g, kernel)
    J4 = _smooth(count(deg >= 4), g, kernel)
    _log(t0, f"{int((deg == 1)[ok].sum()):,} dead ends, {int((deg >= 3)[ok].sum()):,} junctions")

    with np.errstate(divide="ignore", invalid="ignore"):
        dead_share = np.where(D + J > 0, D / (D + J), 0.0)
        four_way = np.where(J > 0, J4 / np.maximum(J, 1e-9), 0.0)
        m_per_j = np.where(J > 0, L / np.maximum(J, 1e-9), 999.0)
    density = L / 1000.0 / disk_km2

    f = ucfg["features"]
    feats = {
        "order": phi, "deadEnd": dead_share, "fourWay": four_way,
        "mPerJunction": m_per_j, "density": density, "laneShare": lane_share,
    }
    score = np.zeros(g.size, dtype=np.float32)
    for name, spec in f.items():
        if spec["w"]:
            score += spec["w"] * _ramp(feats[name], spec["zeroAt"], spec["oneAt"])
    confidence = np.clip(L / ucfg["fullConfidenceLenM"], 0.0, 1.0)
    low_data = L < ucfg["minLenM"]
    U = np.where(low_data, 0.0, score * confidence).astype(np.float32)
    return {
        "U": U,
        "phi": phi,
        "dead_share": dead_share.astype(np.float32),
        "four_way": four_way.astype(np.float32),
        "m_per_j": m_per_j.astype(np.float32),
        "density": density.astype(np.float32),
        "lane_share": lane_share.astype(np.float32),
        "low_data": low_data,
    }


# ─── Water & rural ───────────────────────────────────────────────────────────


def water_index(water_geoms, g: config.Grid):
    geoms = []
    for item in water_geoms:
        if isinstance(item, tuple):
            _, line, width = item
            geoms.append(_to_local(line, g).buffer(width / 2.0, quad_segs=4))
        else:
            geoms.append(_to_local(item, g))
    geoms = np.asarray(geoms, dtype=object)
    return geoms, shapely.STRtree(geoms)


def water_distance(tree: shapely.STRtree, x: np.ndarray, y: np.ndarray, max_m: float, chunk: int = 250_000):
    """Distance (m) to the nearest water feature; ``inf`` beyond ``max_m``."""
    dist = np.full(len(x), np.inf, dtype=np.float32)
    nearest = np.full(len(x), -1, dtype=np.int64)
    for s in range(0, len(x), chunk):
        pts = shapely.points(x[s : s + chunk], y[s : s + chunk])
        (pi, gi), d = tree.query_nearest(pts, max_distance=max_m, return_distance=True, all_matches=False)
        dist[s + pi] = d
        nearest[s + pi] = gi
    return dist, nearest


def rural_fraction(rural_geoms, g: config.Grid, kernel: np.ndarray, sub: int = 3) -> np.ndarray:
    """Share of each cell covered by rural land use, from a sub×sub sample lattice."""
    step = g.cell_m / sub
    sx, sy = g.nx * sub, g.ny * sub
    hits = np.zeros(sx * sy, dtype=bool)
    for geom in rural_geoms:
        lg = _to_local(geom, g)
        minx, miny, maxx, maxy = lg.bounds
        c0 = max(0, int(math.floor(minx / step - 0.5)))
        c1 = min(sx - 1, int(math.ceil(maxx / step - 0.5)))
        r0 = max(0, int(math.floor(miny / step - 0.5)))
        r1 = min(sy - 1, int(math.ceil(maxy / step - 0.5)))
        if c1 < c0 or r1 < r0:
            continue
        cc, rr = np.meshgrid(np.arange(c0, c1 + 1), np.arange(r0, r1 + 1))
        cc, rr = cc.ravel(), rr.ravel()
        inside = shapely.contains_xy(lg, (cc + 0.5) * step, (rr + 0.5) * step)
        if inside.any():
            hits[(rr * sx + cc)[inside]] = True
    frac = hits.reshape(g.ny, sub, g.nx, sub).mean(axis=(1, 3)).ravel()
    return (_smooth(frac, g, kernel) / kernel.sum()).astype(np.float32)


# ─── Per-way risk ────────────────────────────────────────────────────────────


def _per_way_quantile(way_idx: np.ndarray, values: np.ndarray, n_ways: int, q: float = 0.75) -> np.ndarray:
    order = np.lexsort((values, way_idx))
    w_sorted = way_idx[order]
    v_sorted = values[order]
    starts = np.searchsorted(w_sorted, np.arange(n_ways), side="left")
    counts = np.searchsorted(w_sorted, np.arange(n_ways), side="right") - starts
    out = np.zeros(n_ways, dtype=np.float32)
    has = counts > 0
    out[has] = v_sorted[starts[has] + np.floor(q * (counts[has] - 1)).astype(np.int64)]
    return out


def way_levels(roads: Roads, g: config.Grid, cfg: dict, U, rural, cell_water_dist, tree, t0: float) -> dict:
    """Risk bands and level for every drivable way (``roads`` = drivable subset)."""
    wcfg, comb = cfg["water"], cfg["combine"]
    x, y = g.to_xy(roads.lon, roads.lat)
    node_way = roads.node_way
    i0 = np.nonzero(node_way[:-1] == node_way[1:])[0]
    sx0, sy0 = x[i0], y[i0]
    dx, dy = x[i0 + 1] - sx0, y[i0 + 1] - sy0
    seg_len = np.hypot(dx, dy)
    seg_way = node_way[i0]

    n = np.maximum(1, np.ceil(seg_len / SAMPLE_M)).astype(np.int64)
    rep = np.repeat(np.arange(len(i0)), n)
    k = np.arange(len(rep)) - np.repeat(np.cumsum(n) - n, n)
    t = (k + 0.5) / n[rep]
    px = sx0[rep] + dx[rep] * t
    py = sy0[rep] + dy[rep] * t
    pw = seg_way[rep]
    plen = (seg_len / n)[rep]
    n_ways = len(roads.way_id)
    _log(t0, f"{len(px):,} samples along {n_ways:,} drivable ways")

    ix = np.clip(np.floor(px / g.cell_m).astype(np.int64), 0, g.nx - 1)
    iy = np.clip(np.floor(py / g.cell_m).astype(np.int64), 0, g.ny - 1)
    pcell = iy * g.nx + ix
    u_samples = U[pcell]
    u75 = _per_way_quantile(pw, u_samples, n_ways)
    r75 = _per_way_quantile(pw, rural[pcell], n_ways)
    u_max = np.zeros(n_ways, dtype=np.float32)
    np.maximum.at(u_max, pw, u_samples)
    u_min = np.full(n_ways, np.inf, dtype=np.float32)
    np.minimum.at(u_min, pw, u_samples)

    # Only samples whose cell centre is within reach of water need an exact query.
    reach = float(wcfg["zoneM"]) + g.cell_m * math.sqrt(2) / 2
    near = np.nonzero(cell_water_dist[pcell] <= reach)[0]
    dist = np.full(len(px), np.inf, dtype=np.float32)
    dist[near], _ = water_distance(tree, px[near], py[near], float(wcfg["zoneM"]))
    _log(t0, f"water distances for {len(near):,} samples near water")

    length = np.bincount(pw, weights=plen, minlength=n_ways)
    near_len = np.bincount(pw, weights=plen * (dist <= wcfg["nearM"]), minlength=n_ways)
    zone_len = np.bincount(pw, weights=plen * (dist <= wcfg["zoneM"]), minlength=n_ways)
    with np.errstate(divide="ignore", invalid="ignore"):
        near_share = np.where(length > 0, near_len / length, 0)
        zone_share = np.where(length > 0, zone_len / length, 0)
    wb = np.where(
        (near_share >= wcfg["nearShare"]) | (near_len >= wcfg["nearMinM"]), 2,
        np.where((zone_share >= wcfg["nearShare"]) | (zone_len >= wcfg["nearMinM"]), 1, 0),
    ).astype(np.uint8)
    ub = np.searchsorted(np.asarray(cfg["unplanned"]["bands"]), u75, side="right").astype(np.uint8)
    rb = np.searchsorted(np.asarray(cfg["rural"]["bands"]), r75, side="right").astype(np.uint8)

    exempt = roads.bridge | np.isin(roads.cls, MOTORWAY_CODES)
    ub[exempt] = 0
    wb[exempt] = 0
    rb[exempt] = 0

    sU, sW, sR = (np.asarray(comb[key], dtype=np.float32) for key in ("sU", "sW", "sR"))
    C = 1.0 - (1.0 - sU[ub]) * (1.0 - sW[wb]) * (1.0 - sR[rb])
    level = np.searchsorted(np.asarray(comb["levelThresholds"]), C + 1e-6, side="right").astype(np.uint8)
    return {
        "level": level, "ub": ub, "wb": wb, "rb": rb, "u75": u75,
        "u_spread": (u_max - u_min).astype(np.float32), "length": length.astype(np.float32),
    }


# ─── Orchestration ───────────────────────────────────────────────────────────


def run() -> None:
    t0 = time.time()
    cfg = config.load()
    g = config.grid()
    config.ensure_dirs()
    _log(t0, f"grid {g.nx}x{g.ny} = {g.size:,} cells of {g.cell_m:.0f} m")

    roads, water_geoms, water_meta, rural_geoms, exclude_geoms, places, area_places = load(cfg, t0)
    dropped = exclude_park_lanes(roads, exclude_geoms, g)
    _log(t0, f"{dropped:,} park/campus footpaths left out of the street fabric")
    net = network_metrics(roads, g, cfg, t0)

    kernel = _disk_kernel(cfg["grid"]["snapshotRadiusM"], g.cell_m)
    rural = rural_fraction(rural_geoms, g, kernel)
    _log(t0, "rural fraction")

    _, tree = water_index(water_geoms, g)
    cx, cy = g.to_xy(*g.cell_center(np.arange(g.size)))
    cdist, cnear = water_distance(tree, cx, cy, 250.0)
    _log(t0, "water distance per cell")

    drv = roads.subset(roads.drivable)
    ways = way_levels(drv, g, cfg, net["U"], rural, cdist, tree, t0)

    # Cells crossed by a drivable road (the overlay only paints those).
    dx_, dy_ = g.to_xy(drv.lon, drv.lat)
    nw = drv.node_way
    seg = np.nonzero(nw[:-1] == nw[1:])[0]
    rc, rin = _cells_of((dx_[seg] + dx_[seg + 1]) * 0.5, (dy_[seg] + dy_[seg + 1]) * 0.5, g)
    has_road = np.zeros(g.size, dtype=bool)
    has_road[rc[rin]] = True

    # Landmark per cell for "near X" explanations: an OSM place node (village,
    # suburb, …) within 1.5 km, or a named residential area (sector, colony,
    # society) within 700 m — the place node wins unless the area is much closer.
    landmarks = places + area_places
    cells_xy = np.column_stack([cx, cy])

    def nearest(items, max_m):
        if not items:
            return np.full(g.size, np.inf), np.zeros(g.size, dtype=np.int64)
        xy = np.column_stack(g.to_xy([p[2] for p in items], [p[3] for p in items]))
        return cKDTree(xy).query(cells_xy, distance_upper_bound=max_m)

    dn, i_node = nearest(places, 1500.0)
    da, i_area = nearest(area_places, 700.0)
    use_node = np.isfinite(dn) & (dn * 0.6 <= np.where(np.isfinite(da), da, np.inf))
    place_id = np.where(
        use_node, i_node, np.where(np.isfinite(da), len(places) + i_area, 65535)
    ).astype(np.uint16)

    np.savez_compressed(
        config.OUT_DIR / "analysis.npz",
        **{k: v for k, v in net.items()},
        rural=rural, water_dist=cdist, water_id=cnear, place_id=place_id, has_road=has_road,
        way_id=drv.way_id, way_cls=drv.cls, way_bridge=drv.bridge, way_fabric=drv.fabric,
        **{f"way_{k}": v for k, v in ways.items()},
    )
    (config.OUT_DIR / "analysis.meta.json").write_bytes(orjson.dumps({
        "configHash": config.config_hash(),
        "classes": list(ALL_CLASSES),
        "waters": [{"kind": k, "name": nm} for k, nm in water_meta],
        "places": [{"name": nm, "kind": kd, "lng": round(lo, 6), "lat": round(la, 6)} for nm, kd, lo, la in landmarks],
    }))
    lv = np.bincount(ways["level"], minlength=7)
    _log(t0, "ways per level " + ", ".join(f"L{i}={c:,}" for i, c in enumerate(lv)))
