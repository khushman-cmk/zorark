"""Write per-way risk into the OSM file GraphHopper imports.

GraphHopper can only route on values it parses at import time, and adding a
new parser needs Java code. Instead we reuse three tags whose parsers ship with
GraphHopper and which car routing ignores (verified against the 11.1 sources):

=============  =================  ==========================================
OSM tag        encoded value      meaning here
=============  =================  ==========================================
mtb:scale      mtb_rating 1..6    combined risk level L (mtb:scale = L - 1)
sac_scale      hike_rating 1..2   water band (hiking / mountain_hiking)
horse_scale    horse_rating 1..3  unplanned band (common/demanding/difficult)
=============  =================  ==========================================

Level 0 and band 0 are encoded by leaving the tag off (rating 0). Any of
these tags already present on a highway are stripped first, so real MTB or
hiking grades can never leak into car routing. OSM ids are untouched, so turn
restrictions keep pointing at the right ways.
"""

from __future__ import annotations

import time

import numpy as np
import osmium

from . import config

OUR_TAGS = ("mtb:scale", "sac_scale", "horse_scale")
SAC = {1: "hiking", 2: "mountain_hiking"}
HORSE = {1: "common", 2: "demanding", 3: "difficult"}


def run() -> None:
    t0 = time.time()
    a = np.load(config.OUT_DIR / "analysis.npz")
    risk = {
        int(w): (int(lv), int(wb), int(ub))
        for w, lv, wb, ub in zip(a["way_id"], a["way_level"], a["way_wb"], a["way_ub"])
        if lv or wb or ub
    }
    print(f"[tag] {len(risk):,} ways carry risk", flush=True)

    tagged = stripped = 0
    config.SAFETY_PBF.unlink(missing_ok=True)
    with osmium.SimpleWriter(str(config.SAFETY_PBF)) as writer:
        for obj in osmium.FileProcessor(str(config.NCR_PBF)):
            if not (obj.is_way() and "highway" in obj.tags):
                writer.add(obj)
                continue
            r = risk.get(obj.id)
            has_ours = any(k in obj.tags for k in OUR_TAGS)
            if r is None and not has_ours:
                writer.add(obj)
                continue
            tags = {t.k: t.v for t in obj.tags if t.k not in OUR_TAGS}
            stripped += has_ours
            if r is not None:
                level, wb, ub = r
                if level:
                    tags["mtb:scale"] = str(level - 1)
                if wb:
                    tags["sac_scale"] = SAC[wb]
                if ub:
                    tags["horse_scale"] = HORSE[ub]
                tagged += 1
            writer.add_way(obj.replace(tags=tags))
    size = config.SAFETY_PBF.stat().st_size / 1e6
    print(f"[tag] tagged {tagged:,} ways, stripped foreign grades from {stripped:,}; "
          f"wrote {config.SAFETY_PBF.name} ({size:.1f} MB) in {time.time() - t0:.1f}s", flush=True)
