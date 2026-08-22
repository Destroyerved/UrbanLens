"""Ollama client for the planning copilot (PRD §28–29).

WHAT THE MODEL IS AND IS NOT ALLOWED TO DO
------------------------------------------
The brief is explicit (§29): the LLM never computes a spatial result. It does
two jobs only —

  1. read a planner's question and choose a tool plus its arguments,
  2. phrase the tool's structured output as prose.

Every number the copilot utters comes from the GIS engine. The model is never
given latitude to invent one: step 2 receives the already-computed result and is
instructed to reuse its figures verbatim, and the raw result is returned to the
caller alongside the prose so the UI can render the real values rather than
parsing them back out of a sentence.

If Ollama is unreachable the copilot falls back to the deterministic pattern
router in app.gis.copilot. That is not a degraded curiosity — it is how the demo
runs on a machine with no model pulled, and it answers the same questions.
"""

from __future__ import annotations

import json
import os
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
PREFERRED_MODELS = [
    "llama3.1:8b",
    "llama3.1",
    "qwen2.5:7b",
    "qwen2.5:14b",
    "mistral",
    "llama3.2:latest",
    "llama3.2",
]
TIMEOUT_S = float(os.environ.get("OLLAMA_TIMEOUT", "30"))


def get_active_model() -> str:
    """Return the configured or auto-detected best available model."""
    if "OLLAMA_MODEL" in os.environ:
        return os.environ["OLLAMA_MODEL"]
    try:
        with urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=2) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        names = [m.get("name", "") for m in payload.get("models", [])]
        for pref in PREFERRED_MODELS:
            for name in names:
                if name == pref or name.startswith(f"{pref}:") or (pref in name):
                    return name
    except Exception:
        pass
    return "llama3.1:8b"


# Property for backward compatibility
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")

# How long a reachability verdict is trusted before being re-checked. "Up" is
# re-checked often so a model going away is noticed; "down" is re-checked slowly
# because a machine deliberately running without Ollama would otherwise pay the
# probe over and over for an answer that will not change.
PROBE_TTL_UP_S = float(os.environ.get("OLLAMA_PROBE_TTL", "15"))
PROBE_TTL_DOWN_S = float(os.environ.get("OLLAMA_PROBE_TTL_DOWN", "60"))
# A local Ollama accepts a connection in about a millisecond. A closed port here
# does not refuse — it silently drops, so this timeout is what a "no" costs, per
# resolved address. Remote hosts get a longer allowance below.
PROBE_TIMEOUT_S = float(os.environ.get("OLLAMA_PROBE_TIMEOUT", "0.15"))

_LOOPBACK = {"localhost", "127.0.0.1", "::1"}

_probe: tuple[float, bool] | None = None


def _reachable() -> bool:
    """Is anything listening on the Ollama port? Cached.

    Running without an LLM is a supported mode — the deterministic router in
    app.gis.copilot answers the same questions. But finding that out used to
    cost a full HTTP connection attempt per question, and a closed port here
    does not refuse the connection, it drops it: urllib waited out its timeout
    against ::1, then again against 127.0.0.1, so every copilot answer sat ~4s
    behind a connection that was never going to open. That reads as a hung
    assistant rather than a deliberate fallback.

    A short socket probe settles it instead, and the verdict is cached so a
    conversation costs at most one probe per TTL.
    """
    global _probe
    now = time.monotonic()
    if _probe is not None:
        age, verdict = now - _probe[0], _probe[1]
        if age < (PROBE_TTL_UP_S if verdict else PROBE_TTL_DOWN_S):
            return verdict

    parts = urllib.parse.urlsplit(OLLAMA_URL)
    host = parts.hostname or "localhost"
    port = parts.port or (443 if parts.scheme == "https" else 11434)
    # localhost resolves to both ::1 and 127.0.0.1 and Ollama may bind only one,
    # so a single address is not enough to conclude "down" — try each, stopping
    # at the first that answers.
    timeout = PROBE_TIMEOUT_S if host in _LOOPBACK else max(PROBE_TIMEOUT_S, 1.5)
    up = False
    try:
        addrs = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError:
        addrs = []
    for family, socktype, proto, _canon, sockaddr in addrs:
        try:
            with socket.socket(family, socktype, proto) as s:
                s.settimeout(timeout)
                s.connect(sockaddr)
            up = True
            break
        except OSError:
            continue

    _probe = (now, up)
    return up


def reset_probe() -> None:
    """Forget the cached verdict — used by /api/copilot/status so an explicit
    check always reflects the present moment."""
    global _probe
    _probe = None


@dataclass
class LlmStatus:
    available: bool
    url: str
    model: str
    models_present: list[str]
    detail: str


def status() -> LlmStatus:
    """Whether Ollama is reachable and whether the configured model is pulled."""
    reset_probe()
    model = get_active_model()
    if not _reachable():
        return LlmStatus(
            available=False, url=OLLAMA_URL, model=model, models_present=[],
            detail=f"Nothing is listening at {OLLAMA_URL}. Start it with `ollama serve`, or "
                   "leave it off — the copilot falls back to deterministic routing.",
        )
    try:
        with urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=3) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        names = [m.get("name", "") for m in payload.get("models", [])]
        has_model = any(n == model or n.startswith(f"{model}:") or (model in n) for n in names)
        return LlmStatus(
            available=has_model,
            url=OLLAMA_URL,
            model=model,
            models_present=names,
            detail=(
                f"Ollama is running with '{model}'."
                if has_model
                else f"Ollama is running but '{model}' is not pulled. Run: ollama pull {model}"
            ),
        )
    except Exception as exc:  # noqa: BLE001 — any failure means "not usable"
        return LlmStatus(
            available=False, url=OLLAMA_URL, model=model, models_present=[],
            detail=f"Ollama not reachable at {OLLAMA_URL} ({exc.__class__.__name__}). "
                   "Start it with `ollama serve`, or leave it off — the copilot falls back "
                   "to deterministic routing.",
        )


def _generate(prompt: str, *, system: str, json_mode: bool = False) -> str:
    model = get_active_model()
    body = {
        "model": model,
        "prompt": prompt,
        "system": system,
        "stream": False,
        # Low temperature: this is intent classification and faithful
        # restatement, not creative writing.
        "options": {"temperature": 0.1},
    }
    if json_mode:
        body["format"] = "json"
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/generate",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return json.loads(resp.read().decode("utf-8")).get("response", "")


# --------------------------------------------------------------------------
# Step 1 — intent
# --------------------------------------------------------------------------

TOOLS = {
    "locate_place": "Find, geocode, and fly to a specific place, university, institute, landmark, hospital, building, address, or location (e.g. Institute of Advanced Research, GIFT City, IIM, IIT, Science City, stadium, etc.).",
    "site_search": "Find and rank the best parcels for a new facility or development.",
    "explain_parcel": "Explain why a specific, named parcel scores as it does.",
    "infrastructure_gaps": "Rank wards by how poorly served they are or identify service gaps.",
    "government_land": "List government-owned land, optionally vacant or above a size.",
    "zoning_conflicts": "Find where actual land use diverges from official zoning.",
    "land_use_change": "Find parcels converting to built-up land or historical urban growth.",
    "switch_mode": "Switch UI panel or mode (overview, growth, infrastructure, land, sites, simulator, equity, corridor, conservation, encroachment).",
    "toggle_layer": "Turn a map layer or heatmap on or off (thermal-heat/UHI, ndvi-heat/vegetation, flood, roads, facilities, parcels, wards, prediction, builtup, greenspace, gap-heat, growth-heat, population).",
    "switch_basemap": "Change the map basemap style (satellite, hybrid, streets, terrain, dark, light).",
    "switch_city": "Switch active study area or district (ahmedabad, gandhinagar, surat, vadodara, rajkot, aravalli).",
    "run_simulation": "Run an intervention simulation for a proposed facility on a parcel or coordinates.",
    "time_machine": "Show historical observation year (2018, 2022, 2024) or enable 2030 prediction.",
    "reset_view": "Reset camera view or tilt to 3D perspective.",
    "help": "The question does not map to any tool.",
}

PROJECTS_HINT = (
    "hospital, school, park, fire_station, government_office, residential, "
    "affordable_housing, commercial, industrial, mixed_use"
)

INTENT_SYSTEM = (
    "You route urban-planning commands and questions to GIS spatial analysis and UI control tools.\n"
    "Reply with JSON only, without markdown code fences or conversational preamble.\n"
    f"Tools: {json.dumps(TOOLS)}\n"
    f"Project types: {PROJECTS_HINT}\n"
    'Schema: {\n'
    '  "tool": "<tool name>",\n'
    '  "location_query": "<name of place, landmark, institute, or address or null>",\n'
    '  "project": "<project type or null>",\n'
    '  "service": "<healthcare|education|parks|transportation|road_connectivity|null>",\n'
    '  "parcel_id": "<parcel id like GJ-AHM-13791 or null>",\n'
    '  "min_hectares": <number or null>,\n'
    '  "vacant_only": <true|false>,\n'
    '  "mode": "<overview|growth|infrastructure|land|sites|simulator|equity|corridor|conservation|encroachment|null>",\n'
    '  "layer_id": "<thermal-heat|ndvi-heat|flood|roads|facilities|parcels|wards|prediction|builtup|greenspace|gap-heat|growth-heat|population|null>",\n'
    '  "layer_state": <true|false|null>,\n'
    '  "basemap": "<satellite|hybrid|streets|terrain|dark|light|null>",\n'
    '  "city_id": "<ahmedabad|gandhinagar|surat|vadodara|rajkot|aravalli|null>",\n'
    '  "year": <2018|2022|2024|2030|null>,\n'
    '  "pitch": <number or null>\n'
    '}\n'
    "Examples:\n"
    '- "Search for Institute of Advanced Research": {"tool": "locate_place", "location_query": "Institute of Advanced Research"}\n'
    '- "Where is IAR Gandhinagar?": {"tool": "locate_place", "location_query": "Institute of Advanced Research"}\n'
    '- "Take me to GIFT City": {"tool": "locate_place", "location_query": "GIFT City"}\n'
    '- "Find Narendra Modi Stadium": {"tool": "locate_place", "location_query": "Narendra Modi Stadium"}\n'
    '- "Where should we build a new hospital?": {"tool": "site_search", "project": "hospital", "service": "healthcare", "parcel_id": null, "min_hectares": null, "vacant_only": false}\n'
    '- "Why is parcel GJ-AHM-13791 a good site for a hospital?": {"tool": "explain_parcel", "project": "hospital", "service": null, "parcel_id": "GJ-AHM-13791", "min_hectares": null, "vacant_only": false}\n'
    '- "Turn on urban heat island layer": {"tool": "toggle_layer", "layer_id": "thermal-heat", "layer_state": true}\n'
    '- "Switch to satellite basemap": {"tool": "switch_basemap", "basemap": "satellite"}\n'
    '- "Switch city to Gandhinagar": {"tool": "switch_city", "city_id": "gandhinagar"}\n'
    '- "Open equity panel": {"tool": "switch_mode", "mode": "equity"}\n'
    '- "Simulate a hospital on GJ-AHM-13791": {"tool": "run_simulation", "project": "hospital", "parcel_id": "GJ-AHM-13791"}\n'
    '- "Tilt map to 3D": {"tool": "reset_view", "pitch": 55}\n'
    '- "Reset view": {"tool": "reset_view"}'
)


def classify(question: str) -> dict | None:
    """Ask the model which tool to run. Returns None if unusable."""
    if not _reachable():
        return None
    try:
        raw = _generate(question, system=INTENT_SYSTEM, json_mode=True)
        # Strip potential markdown fences if returned
        clean = raw.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        parsed = json.loads(clean)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None
    if not isinstance(parsed, dict) or parsed.get("tool") not in TOOLS:
        return None
    return parsed


# --------------------------------------------------------------------------
# Step 2 — phrasing
# --------------------------------------------------------------------------

PHRASE_SYSTEM = (
    "You are an expert AI urban planning intelligence advisor for the UrbanLens platform.\n"
    "You will receive a planner's question and the structured JSON output of spatial analysis computed by the GIS engine.\n"
    "Write a concise, high-impact, professional synthesis answering the question directly.\n\n"
    "ACCURACY & FORMATTING RULES:\n"
    "- Grounding: Use ONLY figures and metrics present in the JSON. Never extrapolate, hallucinate, or round differently.\n"
    "- Identifiers: Always write parcel IDs (e.g. GJ-AHM-13791) and ward names exactly as given.\n"
    "- Bolding: Use **bold** for key parcel IDs, scores, and headline metrics (e.g. **GJ-AHM-13791**, **63/100**, **582,752 residents**, **0.2 km**).\n"
    "- Structure:\n"
    "  1. Direct Answer: Start immediately with the key conclusion or top recommendation.\n"
    "  2. Supporting Evidence: Highlight core advantages (population catchment, arterial road proximity, government ownership, flood safety).\n"
    "  3. Caveats/Risks: If tradeoffs or concerns are listed in the JSON, mention them clearly.\n"
    "- Style: Executive, objective, and authoritative for urban planners. Keep paragraphs tight and informative."
)


def phrase(question: str, result: dict) -> str | None:
    """Restate a computed result in prose. Returns None if unusable."""
    if not _reachable():
        return None
    trimmed = dict(result)
    if isinstance(trimmed.get("items"), list):
        trimmed["items"] = trimmed["items"][:5]
    try:
        out = _generate(
            f"Question: {question}\n\nAnalysis result:\n{json.dumps(trimmed, default=str)[:6000]}",
            system=PHRASE_SYSTEM,
        )
    except (urllib.error.URLError, TimeoutError, OSError):
        return None
    out = out.strip()
    return out or None
