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
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")
TIMEOUT_S = float(os.environ.get("OLLAMA_TIMEOUT", "30"))

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
    if not _reachable():
        return LlmStatus(
            available=False, url=OLLAMA_URL, model=OLLAMA_MODEL, models_present=[],
            detail=f"Nothing is listening at {OLLAMA_URL}. Start it with `ollama serve`, or "
                   "leave it off — the copilot falls back to deterministic routing.",
        )
    try:
        with urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=3) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        names = [m.get("name", "") for m in payload.get("models", [])]
        has_model = any(n == OLLAMA_MODEL or n.startswith(f"{OLLAMA_MODEL}:") for n in names)
        return LlmStatus(
            available=has_model,
            url=OLLAMA_URL,
            model=OLLAMA_MODEL,
            models_present=names,
            detail=(
                f"Ollama is running with '{OLLAMA_MODEL}'."
                if has_model
                else f"Ollama is running but '{OLLAMA_MODEL}' is not pulled. Run: ollama pull {OLLAMA_MODEL}"
            ),
        )
    except Exception as exc:  # noqa: BLE001 — any failure means "not usable"
        return LlmStatus(
            available=False, url=OLLAMA_URL, model=OLLAMA_MODEL, models_present=[],
            detail=f"Ollama not reachable at {OLLAMA_URL} ({exc.__class__.__name__}). "
                   "Start it with `ollama serve`, or leave it off — the copilot falls back "
                   "to deterministic routing.",
        )


def _generate(prompt: str, *, system: str, json_mode: bool = False) -> str:
    body = {
        "model": OLLAMA_MODEL,
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
    "site_search": "Find and rank the best parcels for a new facility or development.",
    "explain_parcel": "Explain why a specific, named parcel scores as it does.",
    "infrastructure_gaps": "Rank wards by how poorly served they are.",
    "government_land": "List government-owned land, optionally vacant or above a size.",
    "zoning_conflicts": "Find where actual land use diverges from official zoning.",
    "land_use_change": "Find parcels converting to built-up land.",
    "help": "The question does not map to any tool.",
}

PROJECTS_HINT = (
    "hospital, school, park, fire_station, government_office, residential, "
    "affordable_housing, commercial, industrial, mixed_use"
)

INTENT_SYSTEM = (
    "You route urban-planning questions to analysis tools. "
    "Reply with JSON only, no prose, no code fences.\n"
    f"tools: {json.dumps(TOOLS)}\n"
    f"project types: {PROJECTS_HINT}\n"
    'Schema: {"tool": <tool name>, "project": <project type or null>, '
    '"service": <healthcare|education|parks|transportation|road_connectivity|null>, '
    '"parcel_id": <id like GJ-AHD-01070 or null>, "min_hectares": <number or null>, '
    '"vacant_only": <true|false>}'
)


def classify(question: str) -> dict | None:
    """Ask the model which tool to run. Returns None if unusable."""
    if not _reachable():
        return None
    try:
        raw = _generate(question, system=INTENT_SYSTEM, json_mode=True)
        parsed = json.loads(raw)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None
    if not isinstance(parsed, dict) or parsed.get("tool") not in TOOLS:
        return None
    return parsed


# --------------------------------------------------------------------------
# Step 2 — phrasing
# --------------------------------------------------------------------------

PHRASE_SYSTEM = (
    "You are an urban-planning assistant. You will be given a planner's question "
    "and the JSON result of a spatial analysis that has already run.\n"
    "Write two or three sentences answering the question.\n"
    "RULES:\n"
    "- Use ONLY figures that appear in the JSON. Never estimate, round differently, "
    "or introduce a number that is not there.\n"
    "- If the JSON does not answer the question, say so plainly.\n"
    "- Mention the parcel or ward identifiers exactly as written.\n"
    "- No preamble, no bullet points, no markdown."
)


def phrase(question: str, result: dict) -> str | None:
    """Restate a computed result in prose. Returns None if unusable."""
    # Trim list payloads: the model needs the shape and the headline figures,
    # not two hundred candidates.
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
