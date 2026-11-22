"""CLI: ``uv run python -m zsafety <step> [<step> ...]``.

Steps run in pipeline order: fetch → extract → analyze → tag → export → calibrate.
``all`` runs every step.

Each step runs in its own interpreter and exits with ``os._exit``: pyosmium's
reader thread pools can deadlock during interpreter shutdown on Windows, which
would leave a finished step hanging forever. Every step closes its output files
explicitly before returning, so skipping the normal shutdown is safe.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time

STEPS = ("fetch", "extract", "analyze", "tag", "export", "calibrate")


def _run(step: str) -> None:
    if step == "fetch":
        from . import fetch

        fetch.run()
    elif step == "extract":
        from . import extract

        extract.run()
    elif step == "analyze":
        from . import analyze

        analyze.run()
    elif step == "tag":
        from . import tag

        tag.run()
    elif step == "export":
        from . import export

        export.run()
    elif step == "calibrate":
        from . import calibrate

        calibrate.run()
    else:
        raise SystemExit(f"Unknown step {step!r}. Steps: {', '.join(STEPS)}, all")


def main(argv: list[str]) -> int:
    steps = list(STEPS) if not argv or argv == ["all"] else argv
    unknown = [s for s in steps if s not in STEPS]
    if unknown:
        print(f"Unknown step(s): {', '.join(unknown)}. Steps: {', '.join(STEPS)}, all", file=sys.stderr)
        return 2
    if len(steps) > 1:
        for step in steps:
            code = subprocess.call([sys.executable, "-u", "-m", "zsafety", step])
            if code != 0:
                print(f"== {step} failed (exit {code}) ==", file=sys.stderr, flush=True)
                return code
        return 0

    step = steps[0]
    t0 = time.time()
    print(f"== {step} ==", flush=True)
    try:
        _run(step)
    except SystemExit as exc:
        print(exc, file=sys.stderr, flush=True)
        return exc.code if isinstance(exc.code, int) else 1
    print(f"== {step} done in {time.time() - t0:.1f}s ==", flush=True)
    return 0


if __name__ == "__main__":
    code = main(sys.argv[1:])
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(code)
