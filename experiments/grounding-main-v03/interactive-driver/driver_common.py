import hashlib
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

from PIL import Image


EXPERIMENT_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = EXPERIMENT_ROOT.parents[1]
RUNS_ROOT = Path(
    os.environ.get("UGP_RUNS_ROOT", str(EXPERIMENT_ROOT / ".runs"))
).resolve()
SCRIPTS_ROOT = EXPERIMENT_ROOT / "scripts"
RUNTIME_SIDECAR_ROOT = EXPERIMENT_ROOT / "runtime-injection"


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def run_node(script: str, arguments: list[str]) -> str:
    command = ["node", str(SCRIPTS_ROOT / script), *arguments]
    completed = subprocess.run(
        command,
        cwd=WORKSPACE_ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"{' '.join(command)} failed ({completed.returncode}): "
            f"{completed.stderr.strip() or completed.stdout.strip()}"
        )
    return completed.stdout.strip()


def accessible_nodes(observation: dict[str, Any]) -> list[dict[str, Any]]:
    extra = observation.get("extra_element_properties", {})
    output = []
    for raw in observation.get("axtree_object", {}).get("nodes", []):
        bid = raw.get("browsergym_id")
        if bid is None or raw.get("ignored"):
            continue
        identifier = str(bid)
        properties = extra.get(identifier, {})
        bbox = properties.get("bbox")
        if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
            continue
        x, y, width, height = (float(value) for value in bbox)
        role = raw.get("role", {}).get("value") or "ui.element"
        name = raw.get("name", {}).get("value") or ""
        state = {}
        for item in raw.get("properties", []):
            key = item.get("name")
            value = item.get("value", {}).get("value")
            if key and value is not None and isinstance(value, (str, int, float, bool)):
                state[key] = value
        output.append(
            {
                "id": identifier,
                "role": str(role),
                "name": str(name)[:2048],
                "bounds": [x, y, x + width, y + height],
                "visibility": float(properties.get("visibility", 0)),
                "clickable": bool(properties.get("clickable", False)),
                "state": state,
            }
        )
    return output


def dom_semantic_nodes(
    observation: dict[str, Any], *, max_nodes: int = 256
) -> list[dict[str, Any]]:
    """Project the benchmark DOM snapshot into bounded public semantic facts.

    BrowserGym's accessibility tree intentionally omits some DOM-only facts.
    ST-WebAgentBench includes modality tasks whose public evidence lives in
    hidden/off-screen attributes, so those facts must remain available to
    structural representations without exposing the raw multi-megabyte DOM.
    """

    snapshot = observation.get("dom_object") or {}
    strings = snapshot.get("strings") or []
    candidates = []
    allowed_attributes = {
        "alt",
        "class",
        "href",
        "id",
        "name",
        "placeholder",
        "role",
        "title",
        "type",
        "value",
    }
    secret_markers = ("csrf", "password", "passwd", "session", "authenticity")

    def string_at(index: Any) -> str:
        if isinstance(index, int) and 0 <= index < len(strings):
            return str(strings[index])
        return ""

    for document_index, document in enumerate(snapshot.get("documents") or []):
        nodes = document.get("nodes") or {}
        names = nodes.get("nodeName") or []
        values = nodes.get("nodeValue") or []
        parents = nodes.get("parentIndex") or []
        attribute_rows = nodes.get("attributes") or []
        backend_ids = nodes.get("backendNodeId") or []
        direct_text: dict[int, list[str]] = {}
        for index, name_index in enumerate(names):
            if string_at(name_index) != "#text" or index >= len(values):
                continue
            value = " ".join(string_at(values[index]).split())
            if not value or index >= len(parents):
                continue
            direct_text.setdefault(int(parents[index]), []).append(value)

        for index, name_index in enumerate(names):
            tag = string_at(name_index).lower()
            if not tag or tag.startswith("#") or tag in {"script", "style"}:
                continue
            raw_attributes = attribute_rows[index] if index < len(attribute_rows) else []
            attributes = {
                string_at(raw_attributes[offset]).lower(): string_at(
                    raw_attributes[offset + 1]
                )
                for offset in range(0, len(raw_attributes) - 1, 2)
            }
            visibility_text = attributes.get("browsergym_visibility_ratio", "0")
            try:
                visibility = float(visibility_text)
            except ValueError:
                visibility = 0.0
            public_attributes = {
                key: value[:1024]
                for key, value in attributes.items()
                if key in allowed_attributes
                or key.startswith("aria-")
                or (key.startswith("data-") and not key.startswith("data-ugp-"))
            }
            identity = " ".join(
                public_attributes.get(key, "") for key in ("id", "name", "type")
            ).lower()
            if public_attributes.get("type", "").lower() == "password" or any(
                marker in identity for marker in secret_markers
            ):
                if "value" in public_attributes:
                    public_attributes["value"] = "[redacted-credential]"
            text = " ".join(direct_text.get(index, []))[:2048]
            if not public_attributes and not text:
                continue
            identifier = attributes.get("bid") or (
                str(backend_ids[index]) if index < len(backend_ids) else str(index)
            )
            score = (
                5 * int("id" in public_attributes)
                + 4 * int("value" in public_attributes)
                + 4 * sum(key.startswith("data-") for key in public_attributes)
                + 3 * sum(key.startswith("aria-") for key in public_attributes)
                + 2 * int(bool(text))
                + 2 * int(public_attributes.get("type") == "hidden")
                + int(visibility <= 0)
            )
            candidates.append(
                {
                    "document": document_index,
                    "order": index,
                    "score": score,
                    "node": {
                        "id": identifier,
                        "tag": tag,
                        "text": text,
                        "attributes": public_attributes,
                        "visibility": visibility,
                        "documentOrder": index,
                    },
                }
            )

    selected = sorted(
        sorted(candidates, key=lambda item: (-item["score"], item["document"], item["order"]))[
            :max_nodes
        ],
        key=lambda item: (item["document"], item["order"]),
    )
    return [item["node"] for item in selected]


def runtime_adapter_metadata(application: str) -> dict[str, str]:
    """Return frozen sidecar provenance without modifying the browser runtime.

    The application image/volume must install and load the sidecar before the
    benchmark starts. Keeping this function read-only makes harness-side
    ``add_init_script`` treatment impossible by construction.
    """

    adapter_root = RUNTIME_SIDECAR_ROOT / f"{application}-v8"
    adapter_path = adapter_root / "adapter.js"
    manifest_path = adapter_root / "authority-manifest.json"
    metadata_path = adapter_root / "adapter-metadata.json"
    adapter_source = adapter_path.read_text(encoding="utf-8")
    manifest = read_json(manifest_path)
    metadata = read_json(metadata_path)
    adapter_digest = hashlib.sha256(adapter_source.encode("utf-8")).hexdigest()
    manifest_digest = sha256(stable_json(manifest))
    return {
        "adapterId": str(metadata["adapterId"]),
        "adapterDigest": adapter_digest,
        "authorityManifestDigest": manifest_digest,
    }


def runtime_snapshot(
    environment: Any, *, capsule_budget: int | None = 48
) -> dict[str, Any]:
    page = environment.unwrapped.page
    snapshot = page.evaluate(
        """async (capsuleBudget) => {
          const bridge = globalThis.__UGP_EXPERIMENT_BRIDGE__;
          if (
            !bridge ||
            typeof bridge.snapshot !== 'function' ||
            typeof bridge.describe !== 'function'
          ) return null;
          const snapshot = await bridge.snapshot();
          const referentIndex = Array.isArray(snapshot?.referentIndex)
            ? snapshot.referentIndex
            : [];
          const frameRanks = {
            'crm.module': 0,
            'crm.field': 1,
            'crm.application-action': 2,
            'crm.record': 3,
          };
          const ranked = [...referentIndex].sort((left, right) =>
            Number(Boolean(right.visible)) - Number(Boolean(left.visible)) ||
            (frameRanks[left.frameType] ?? 9) -
              (frameRanks[right.frameType] ?? 9) ||
            left.nodeId.localeCompare(right.nodeId)
          );
          const selected = capsuleBudget === null
            ? ranked
            : ranked.slice(0, capsuleBudget);
          const capsules = [];
          for (const referent of selected) {
            capsules.push(await bridge.describe(referent.capsuleHandle));
          }
          return {
            ...snapshot,
            capsules,
            capsuleSelection: {
              policy: 'visible-then-frame-type-then-node-id',
              budget: capsuleBudget,
              indexed: referentIndex.length,
              selected: selected.length,
            },
          };
        }""",
        capsule_budget,
    )
    if not isinstance(snapshot, dict):
        raise RuntimeError("Application runtime did not expose a UGP bridge snapshot")
    return snapshot


def public_chat_messages(observation: dict[str, Any]) -> list[dict[str, str]]:
    """Project the benchmark's public chat into a stable actor-visible form."""

    output = []
    for raw in observation.get("chat_messages") or []:
        if not isinstance(raw, dict):
            continue
        role = str(raw.get("role") or "user")[:64]
        message = str(raw.get("message") or raw.get("msg") or "").strip()
        if not message:
            continue
        output.append({"role": role, "message": message[:4096]})
    return output


def save_screenshot(observation: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(observation["screenshot"]).save(path, format="PNG")


def actor_step(
    *,
    run_id: str,
    method: str,
    model: str,
    replicate: int,
    task_path: Path,
    max_infra_retries: int = 3,
) -> tuple[str, dict[str, Any], bool]:
    prepared = run_node(
        "prepare.mjs",
        [
            "--task",
            str(task_path),
            "--method",
            method,
            "--model",
            model,
            "--run-id",
            run_id,
            "--replicate",
            str(replicate),
        ],
    )
    episode_id = json.loads(prepared.splitlines()[-1])["episodeId"]
    episode_root = RUNS_ROOT / run_id / "episodes" / episode_id
    request_path = episode_root / "request.json"
    last_error = None
    for attempt in range(max_infra_retries + 1):
        try:
            run_node("run-codex-actor.mjs", ["--request", str(request_path)])
            last_error = None
            break
        except RuntimeError as error:
            last_error = error
            if attempt < max_infra_retries:
                time.sleep(min(30, 2 * (2**attempt)))
    if last_error is not None:
        raise last_error
    response_path = episode_root / "response.json"
    run_node(
        "record.mjs",
        ["--request", str(request_path), "--response", str(response_path)],
    )
    trajectory = read_json(episode_root / "trajectory.json")
    return episode_id, trajectory["response"]["output"], trajectory["validation"]["valid"]


def materialize_step(input_path: Path, task_path: Path) -> None:
    run_node(
        "materialize-interactive-step.mjs",
        ["--input", str(input_path), "--output", str(task_path)],
    )


def action_string(
    output: dict[str, Any],
    *,
    stop_function: str = "send_msg_to_user",
    answer_function: str | None = None,
) -> str:
    kind = output["kind"]
    if kind == "answer":
        function_name = answer_function or stop_function
        return f"{function_name}({str(output.get('answer') or '')!r})"
    if kind == "click":
        target = str(output.get("target", ""))
        if target.startswith(("http://", "https://")):
            return f"goto({target!r})"
        if output.get("x") is not None and output.get("y") is not None:
            return f"mouse_click({float(output['x'])}, {float(output['y'])})"
        return f"click({target!r})"
    if kind == "type":
        target = str(output.get("target", ""))
        text = str(output.get("text", ""))
        if target == "focused":
            return f"keyboard_type({text!r})"
        return f"fill({target!r}, {text!r})"
    if kind == "scroll":
        direction = str(output.get("direction", "down"))
        amount = abs(float(output.get("amount") or 500))
        dx = amount if direction == "right" else -amount if direction == "left" else 0
        dy = amount if direction == "down" else -amount if direction == "up" else 0
        return f"scroll({dx}, {dy})"
    if kind == "select":
        return f"select_option({str(output.get('target', ''))!r}, {str(output.get('value', ''))!r})"
    if kind == "stop":
        return f"{stop_function}({str(output.get('reason') or 'Done')!r})"
    raise ValueError(f"Unsupported actor action: {kind}")
