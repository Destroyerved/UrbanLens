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
import urllib.error
import urllib.request
from dataclasses import dataclass

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")
TIMEOUT_S = float(os.environ.get("OLLAMA_TIMEOUT", "30"))


@dataclass
class LlmStatus:
    available: bool
    url: str
    model: str
    models_present: list[str]
    detail: str


def status() -> LlmStatus:
    """Whether Ollama is reachable and whether the configured model is pulled."""
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
