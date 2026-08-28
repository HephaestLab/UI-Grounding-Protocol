import hashlib
import json
import subprocess
import time
from pathlib import Path
from typing import Any

from PIL import Image


EXPERIMENT_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = EXPERIMENT_ROOT.parents[1]
RUNS_ROOT = EXPERIMENT_ROOT / ".runs"
SCRIPTS_ROOT = EXPERIMENT_ROOT / "scripts"


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
    output: dict[str, Any], *, stop_function: str = "send_msg_to_user"
) -> str:
    kind = output["kind"]
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
