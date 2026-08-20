import importlib.util, sys, traceback
from pathlib import Path
p = Path(__file__).resolve().parent / "build-observed.py"
spec = importlib.util.spec_from_file_location("build_observed", p)
b = importlib.util.module_from_spec(spec)
sys.modules["build_observed"] = b
spec.loader.exec_module(b)
try:
    res = b.process_city("ahmedabad")
    print("OK built px per year:", {y: int(v.sum()) for y, v in res["built_cnt"].items()})
except Exception:
    traceback.print_exc()