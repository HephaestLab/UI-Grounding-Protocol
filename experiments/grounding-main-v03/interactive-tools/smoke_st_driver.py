import json
import os
import sys
from tempfile import TemporaryDirectory
from pathlib import Path

import gymnasium as gym

EXPERIMENT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(EXPERIMENT_ROOT / "vendor" / "st-webagentbench"))
sys.path.insert(0, str(EXPERIMENT_ROOT / "interactive-driver"))

os.environ.setdefault("WA_SUITECRM", "http://localhost:8080")
os.environ.setdefault("GITLAB", "http://localhost:8023")
os.environ.setdefault("SHOPPING_ADMIN", "http://localhost:7780/admin")

import browsergym.stwebagentbench  # noqa: E402,F401
from browsergym.core.action.highlevel import HighLevelActionSet  # noqa: E402
from driver_common import (  # noqa: E402
    accessible_nodes,
    dom_semantic_nodes,
    materialize_step,
    public_chat_messages,
    read_json,
    runtime_adapter_metadata,
    runtime_snapshot,
    save_screenshot,
    write_json,
)
from run_st_episode import answer  # noqa: E402


def main() -> None:
    action_set = HighLevelActionSet(
        custom_actions=[answer],
        subsets=["bid", "coord", "chat", "nav", "custom"],
        strict=False,
        multiaction=False,
    )
    environment = gym.make(
        "browsergym/STWebAgentBenchEnv.286",
        headless=True,
        action_mapping=action_set.to_python_code,
        timeout=30_000,
    )
    observation, _ = environment.reset(seed=0)
    full_snapshot = runtime_snapshot(environment, capsule_budget=None)
    snapshot = runtime_snapshot(environment)
    if snapshot["adapterId"] != "suitecrm-8.8.1-runtime-v8":
        raise RuntimeError("Installed application sidecar is not v8")
    if snapshot["quality"]["blankLabelCount"] != 0:
        raise RuntimeError("Runtime sidecar emitted blank labels")
    if snapshot["quality"]["opaqueLocalizationLabelCount"] != 0:
        raise RuntimeError("Runtime sidecar emitted opaque localization labels")
    if not snapshot["interactionBindings"]:
        raise RuntimeError("Runtime sidecar emitted no live interaction Bindings")
    if not snapshot["referentIndex"] or not snapshot["capsules"]:
        raise RuntimeError("Runtime sidecar emitted no referent-level Capsules")
    if len(full_snapshot["referentIndex"]) != len(full_snapshot["capsules"]):
        raise RuntimeError("Unbounded referent index and Capsule counts differ")
    if len(snapshot["referentIndex"]) != len(full_snapshot["referentIndex"]):
        raise RuntimeError("Capsule budget changed the complete referent index")
    if len(snapshot["capsules"]) > 48:
        raise RuntimeError("Capsule budget was not enforced")
    if snapshot["quality"]["componentDescriptionCoverage"] != 1:
        raise RuntimeError("Component Description coverage is incomplete")
    with TemporaryDirectory(prefix="ugp-v8-smoke-") as temporary:
        temporary_root = Path(temporary)
        screenshot_path = temporary_root / "screen.png"
        observation_path = temporary_root / "observation.json"
        task_path = temporary_root / "task.json"
        save_screenshot(observation, screenshot_path)
        policies = environment.unwrapped.task.get_policies()
        write_json(
            observation_path,
            {
                "schemaVersion": "0.3.0",
                "sourceTaskId": "st:286",
                "benchmarkId": "st-webagentbench-cup",
                "domain": "suitecrm",
                "taskFamily": "suitecrm:smoke",
                "instruction": observation["goal"],
                "policies": policies,
                "consentContinuation": False,
                "step": 1,
                "maxSteps": 40,
                "url": observation["url"],
                "viewport": {
                    "width": int(observation["screenshot"].shape[1]),
                    "height": int(observation["screenshot"].shape[0]),
                },
                "screenshotPath": str(screenshot_path.resolve()),
                "focusedElementId": observation.get("focused_element_bid") or None,
                "nodes": accessible_nodes(observation),
                "domNodes": dom_semantic_nodes(observation),
                "ugpRuntime": snapshot,
                "runtimeAdapter": runtime_adapter_metadata("suitecrm"),
                "surface": "st-webagentbench/st:286/step-1",
                "previousAction": None,
                "publicHistory": [],
            },
        )
        materialize_step(observation_path, task_path)
        materialized = read_json(task_path)
        ugp = materialized["sourceObservation"]["channels"]["ugp"][
            "representation"
        ]
        if ugp["kind"] != "ugp-referent-set":
            raise RuntimeError("Materializer did not preserve the referent set")
        if len(ugp["referentIndex"]) < len(ugp["capsules"]):
            raise RuntimeError("Materialized Capsules exceed the referent index")
        if ugp["capsuleSelection"]["selected"] != len(ugp["capsules"]):
            raise RuntimeError("Materialized Capsule selection is inconsistent")
    observation, _, consent_terminated, _, _ = environment.step(
        "send_msg_to_user('May I proceed with the requested change?')"
    )
    messages = public_chat_messages(observation)
    if not any(message["role"] == "user" for message in messages):
        raise RuntimeError("Official public user confirmation was not observed")
    _, _, answer_terminated, _, _ = environment.step("answer('Done')")
    environment.close()
    if consent_terminated or not answer_terminated:
        raise RuntimeError("Consent and completion actions have incorrect lifecycle")
    print(
        json.dumps(
            {
                "adapterId": snapshot["adapterId"],
                "bindings": len(snapshot["interactionBindings"]),
                "referents": len(snapshot["referentIndex"]),
                "materializedReferents": len(ugp["referentIndex"]),
                "materializedCapsules": len(ugp["capsules"]),
                "quality": snapshot["quality"],
                "publicChatMessages": messages,
                "consentTerminated": consent_terminated,
                "answerTerminated": answer_terminated,
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
