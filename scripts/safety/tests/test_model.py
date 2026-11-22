import math

import numpy as np
import orjson

from zsafety import analyze, config


def test_grid_matches_shared_vectors():
    """Same vectors are checked by the TypeScript grid (e2e/safety/unit.spec.ts)."""
    tv = orjson.loads(config.TESTVECTORS_PATH.read_bytes())
    g = config.grid()
    assert (g.nx, g.ny) == (tv["nx"], tv["ny"])
    assert math.isclose(g.m_per_deg_lon, tv["mPerDegLon"], rel_tol=0, abs_tol=1e-9)
    for v in tv["vectors"]:
        assert int(g.cell_index(v["lng"], v["lat"])) == v["cell"], v["name"]


def _hist(bearings, lengths=None):
    lengths = np.ones(len(bearings)) if lengths is None else np.asarray(lengths)
    b = (np.floor((np.asarray(bearings) % 180.0) / 10.0).astype(int)) % 18
    return np.bincount(b, weights=lengths, minlength=18)[None, :]


def test_orientation_order_grid_is_one():
    assert analyze.orientation_order(_hist([0, 90] * 20))[0] == 1.0


def test_orientation_order_single_direction_is_one():
    assert analyze.orientation_order(_hist([45] * 10))[0] == 1.0


def test_orientation_order_uniform_is_zero():
    assert analyze.orientation_order(_hist(np.arange(0, 180, 10) + 5))[0] < 1e-6


def test_orientation_order_rotated_grid_stays_high():
    # A grid rotated by 35° (like Noida's sectors) is just as ordered.
    assert analyze.orientation_order(_hist([35, 125] * 20))[0] == 1.0


def test_orientation_order_village_is_low():
    rng = np.random.default_rng(7)
    village = analyze.orientation_order(_hist(rng.uniform(0, 180, 200)))[0]
    assert village < 0.2


def test_ramp_is_direction_agnostic():
    v = np.array([0.0, 0.5, 1.0])
    assert np.allclose(analyze._ramp(v, 0.0, 1.0), [0, 0.5, 1])
    assert np.allclose(analyze._ramp(v, 1.0, 0.0), [1, 0.5, 0])


def test_disk_kernel_is_250m_radius():
    k = analyze._disk_kernel(250, 100)
    assert k.shape == (5, 5)
    assert k.sum() == 21  # 5x5 minus the four corners


def test_model_weights_sum_to_one():
    feats = config.load()["unplanned"]["features"]
    assert math.isclose(sum(f["w"] for f in feats.values()), 1.0)
