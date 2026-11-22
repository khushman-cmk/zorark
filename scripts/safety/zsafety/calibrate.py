"""Check the model against ground truth; fail the build if it regresses.

Labelled places live in ``config/safety-checkpoints.json``: known urban
villages / old-city / unauthorised colonies vs planned sectors and colonies.
We score each by the mean unplanned score U within a 300 m radius and require
that the two groups separate well (ROC AUC, median gap, flag rates), that
water checkpoints sit near water, and that the share of minor-road km at risk
level ≥ 4 stays in a sane range.
"""

from __future__ import annotations

import numpy as np
import orjson

from . import config


def _disk(g: config.Grid, low: np.ndarray, lat: float, lng: float, radius_m: float) -> np.ndarray:
    x, y = g.to_xy(lng, lat)
    ix, iy = int(x // g.cell_m), int(y // g.cell_m)
    k = int(radius_m // g.cell_m)
    out = []
    for dy in range(-k, k + 1):
        for dx in range(-k, k + 1):
            if dx * dx + dy * dy <= k * k:
                i = (iy + dy) * g.nx + ix + dx
                if 0 <= iy + dy < g.ny and 0 <= ix + dx < g.nx and not low[i]:
                    out.append(i)
    return np.asarray(out, dtype=np.int64)


def _auc(pos: np.ndarray, neg: np.ndarray) -> float:
    return float((pos[:, None] > neg[None, :]).mean() + 0.5 * (pos[:, None] == neg[None, :]).mean())


def run() -> None:
    cfg = config.load()
    cp = orjson.loads(config.CHECKPOINTS_PATH.read_bytes())
    th = cp["thresholds"]
    g = config.grid()
    a = np.load(config.OUT_DIR / "analysis.npz")
    U, low, wdist = a["U"], a["low_data"], a["water_dist"]
    band1 = cfg["unplanned"]["bands"][0]

    def score(p):
        idx = _disk(g, low, p["lat"], p["lng"], cp["radiusM"])
        return float(U[idx].mean()) if len(idx) else float("nan")

    rows = []
    for label in ("unplanned", "planned"):
        for p in cp[label]:
            rows.append({"label": label, "name": p["name"], "u": round(score(p), 3)})

    vill = np.array([r["u"] for r in rows if r["label"] == "unplanned" and r["u"] == r["u"]])
    plan = np.array([r["u"] for r in rows if r["label"] == "planned" and r["u"] == r["u"]])
    auc = _auc(vill, plan)
    gap = float(np.median(vill) - np.median(plan))
    plan_flag = float((plan >= band1).mean())
    vill_flag = float((vill >= band1).mean())

    water_rows = []
    for p in cp["water"]:
        idx = _disk(g, np.zeros_like(low), p["lat"], p["lng"], cp["radiusM"])
        d = float(wdist[idx].min()) if len(idx) else float("inf")
        water_rows.append({"name": p["name"], "nearestM": round(d, 1), "ok": d <= p["maxM"]})

    classes = orjson.loads((config.OUT_DIR / "analysis.meta.json").read_bytes())["classes"]
    minor_codes = [classes.index(c) for c in cfg["unplanned"]["minorClasses"]]
    minor = np.isin(a["way_cls"], minor_codes)
    length = a["way_length"]
    lvl = a["way_level"]
    share4 = float(length[minor & (lvl >= 4)].sum() / max(length[minor].sum(), 1.0))
    by_level = {f"L{i}": round(float(length[lvl == i].sum()) / 1000, 1) for i in range(7)}
    hv = (a["way_u_spread"] >= 0.4) & (length >= 300) & minor
    high_var_km = float(length[hv].sum() / 1000)

    lo, hi = th["minorKmAtLevel4Plus"]
    checks = {
        f"AUC >= {th['minAuc']}": auc >= th["minAuc"],
        f"median gap >= {th['minUnplannedMedianGap']}": gap >= th["minUnplannedMedianGap"],
        f"planned flagged <= {th['maxPlannedFlaggedShare']:.0%}": plan_flag <= th["maxPlannedFlaggedShare"],
        f"villages flagged >= {th['minUnplannedFlaggedShare']:.0%}": vill_flag >= th["minUnplannedFlaggedShare"],
        f"minor km at L4+ in [{lo:.0%}, {hi:.0%}]": lo <= share4 <= hi,
        "water checkpoints near water": all(w["ok"] for w in water_rows),
    }

    for label in ("unplanned", "planned"):
        print(f"\n{label.upper()} (U, flag at >= {band1})")
        for r in sorted((r for r in rows if r["label"] == label), key=lambda r: -r["u"]):
            mark = "*" if r["u"] >= band1 else " "
            print(f"  {mark} {r['u']:.3f}  {r['name']}")
    print("\nWATER")
    for w in water_rows:
        print(f"  {'ok ' if w['ok'] else 'BAD'} {w['nearestM']:>7} m  {w['name']}")
    print(f"\nAUC {auc:.3f} | median gap {gap:.3f} | villages flagged {vill_flag:.0%} | planned flagged {plan_flag:.0%}")
    print(f"minor-road km at level>=4: {share4:.1%} | km by level {by_level} | high-variance minor km {high_var_km:.0f}")

    report = {
        "configHash": config.config_hash(),
        "auc": round(auc, 4), "medianGap": round(gap, 4),
        "villagesFlagged": round(vill_flag, 4), "plannedFlagged": round(plan_flag, 4),
        "minorShareLevel4Plus": round(share4, 4), "kmByLevel": by_level, "highVarianceMinorKm": round(high_var_km, 1),
        "checkpoints": rows, "water": water_rows, "checks": checks,
    }
    (config.OUT_DIR / "report.json").write_bytes(orjson.dumps(report, option=orjson.OPT_INDENT_2))

    failed = [k for k, ok in checks.items() if not ok]
    print("\n" + "\n".join(f"  [{'PASS' if ok else 'FAIL'}] {k}" for k, ok in checks.items()))
    if failed:
        raise SystemExit(f"calibration failed: {', '.join(failed)}")
