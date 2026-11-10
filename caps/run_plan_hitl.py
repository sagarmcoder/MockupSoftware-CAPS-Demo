"""Run CAPS plan-mode HITL with the demo app's payroll adapter overlay.

The overlay is deliberately limited to the payroll adapter. All policy,
review persistence, trace generation, and execution runtime code still comes
from the selected CAPS checkout.
"""

from __future__ import annotations

import importlib.util
import runpy
import sys
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1]
CAPS_ROOT = Path(sys.argv[1]).resolve()
CAPS_SCRIPT = CAPS_ROOT / "scripts" / "caps_plan_hitl.py"
ADAPTER_PATH = APP_ROOT / "caps" / "payroll_adapter.py"

if not CAPS_SCRIPT.is_file():
    raise SystemExit(f"CAPS plan runner is missing: {CAPS_SCRIPT}")

src_dir = CAPS_ROOT / "src"
sys.path.insert(0, str(src_dir))

# Import the CAPS package namespace first, then replace only the payroll
# adapter module before the runtime imports it.
import adapters  # noqa: E402

spec = importlib.util.spec_from_file_location("adapters.payroll_api", ADAPTER_PATH)
if spec is None or spec.loader is None:
    raise SystemExit(f"Payroll adapter overlay is missing: {ADAPTER_PATH}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
sys.modules["adapters.payroll_api"] = module
setattr(adapters, "payroll_api", module)

sys.argv = [str(CAPS_SCRIPT), *sys.argv[2:]]
runpy.run_path(str(CAPS_SCRIPT), run_name="__main__")
