import json
import os
import re
import sys
import time
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
from driver_common import runtime_snapshot  # noqa: E402
from run_st_episode import answer  # noqa: E402

OPAQUE_LABEL = re.compile(r"^(?:LBL|NTC|ERR|MSG)_[A-Z0-9_]+$")


def activate(environment, snapshot, label):
    binding = next(
        item
        for item in snapshot["interactionBindings"]
        if item["label"] == label and "ui.activate" in item["operations"]
    )
    observation, *_ = environment.step(f"click('{binding['targetId']}')")
    return observation, runtime_snapshot(environment)


def main() -> None:
    action_set = HighLevelActionSet(
        custom_actions=[answer],
        subsets=["bid", "coord", "chat", "nav", "custom"],
        strict=False,
        multiaction=False,
    )
    environment = gym.make(
        "browsergym/STWebAgentBenchEnv.47",
        headless=True,
        action_mapping=action_set.to_python_code,
        timeout=30_000,
    )
    try:
        environment.reset(seed=0)
        snapshot = runtime_snapshot(environment)
        if snapshot["adapterId"] != "suitecrm-8.8.1-runtime-v8":
            raise RuntimeError("Installed application sidecar is not v8")
        _, snapshot = activate(environment, snapshot, "Accounts")
        _, snapshot = activate(environment, snapshot, "Create Account")
        assigned = next(
            item
            for item in snapshot["interactionBindings"]
            if item.get("fieldName") == "assigned_user_name"
            and item["role"] == "combobox"
        )
        if assigned["priorityClass"] != "editable-field":
            raise RuntimeError("Relationship combobox is not editable priority")
        assigned_capsule = next(
            capsule
            for capsule in snapshot["capsules"]
            if capsule.get("referent", {}).get("nodeId")
            == assigned.get("referentNodeId")
        )
        if assigned_capsule["description"]["frame"]["type"] != "crm.field":
            raise RuntimeError("Relationship control did not resolve to a field Capsule")
        if "targetId" in json.dumps(assigned_capsule["description"]["frame"]):
            raise RuntimeError("Field Description leaked a transient target ID")
        if OPAQUE_LABEL.fullmatch(assigned["label"]):
            raise RuntimeError("Relationship combobox retained an opaque label")
        environment.step(f"click('{assigned['targetId']}')")
        popup_snapshot = runtime_snapshot(environment)
        relationship_input = next(
            item
            for item in popup_snapshot["interactionBindings"]
            if item.get("fieldName") == "assigned_user_name"
            and item["elementTag"] == "input"
        )
        if relationship_input["operations"] != ["ui.choice.query"]:
            raise RuntimeError("Relationship query input is exposed as field mutation")
        if relationship_input.get("currentValue") is not None:
            raise RuntimeError("Relationship query text is exposed as selected value")
        if relationship_input.get("relationshipValueState") != "query":
            raise RuntimeError("Relationship query state is missing")
        environment.step(f"fill('{relationship_input['targetId']}', 'asmith')")
        time.sleep(1)
        result_snapshot = runtime_snapshot(environment)
        opaque = [
            item["label"]
            for item in result_snapshot["interactionBindings"]
            if OPAQUE_LABEL.fullmatch(item["label"])
        ]
        relationship_options = [
            item
            for item in result_snapshot["interactionBindings"]
            if item.get("fieldName") == "assigned_user_name"
            and item["role"] == "option"
        ]
        query_binding = next(
            item
            for item in result_snapshot["interactionBindings"]
            if item.get("fieldName") == "assigned_user_name"
            and item.get("relationshipValueState") == "query"
        )
        if query_binding.get("queryValue") != "asmith":
            raise RuntimeError("Relationship query value was not preserved as query state")
        if query_binding.get("currentValue") is not None:
            raise RuntimeError("Relationship query leaked into current value")
        if opaque:
            raise RuntimeError(f"Opaque runtime labels remain: {opaque}")
        if result_snapshot["quality"]["ambiguousRelationshipValueCount"] != 0:
            raise RuntimeError("Relationship query/candidate leaked into current value")
        if result_snapshot["quality"]["relationshipQueryBindingCount"] < 1:
            raise RuntimeError("Relationship query binding was not counted")
        if result_snapshot["quality"]["nonActionableBindingCount"] != 0:
            raise RuntimeError("Non-actionable descendants leaked into interaction Bindings")
        if relationship_options:
            raise RuntimeError("Empty relationship result exposed a false candidate")
        if result_snapshot["quality"]["blockedCommitBindingCount"] < 1:
            raise RuntimeError("Unresolved relationship query did not block commit")
        if result_snapshot["quality"]["commitBindingCount"] != 0:
            raise RuntimeError("Commit remained actionable during unresolved selection")
        if any(
            "ui.activate" in item["operations"]
            and item["label"].lower().startswith(("save", "submit", "create", "update"))
            for item in result_snapshot["interactionBindings"]
        ):
            raise RuntimeError("A commit target leaked during unresolved selection")
        if any(
            item["priorityClass"] != "editable-field"
            or item["label"].lower() == "empty"
            or item.get("relationshipValueState") != "candidate"
            for item in relationship_options
        ):
            raise RuntimeError("Relationship options lost semantic label or priority")
        more_information = next(
            item
            for item in result_snapshot["interactionBindings"]
            if item["label"].casefold() == "more information"
            and "ui.activate" in item["operations"]
        )
        environment.step(f"click('{more_information['targetId']}')")
        time.sleep(1)
        hidden_field_snapshot = runtime_snapshot(environment)
        if hidden_field_snapshot["quality"]["pendingRelationshipSelectionCount"] < 1:
            raise RuntimeError("Hidden relationship field lost its pending transition")
        if (
            hidden_field_snapshot["quality"][
                "hiddenPendingRelationshipSelectionCount"
            ]
            < 1
        ):
            raise RuntimeError("Hidden pending relationship transition was not reported")
        if hidden_field_snapshot["quality"]["blockedCommitBindingCount"] < 1:
            raise RuntimeError("Local tab change released the relationship commit blocker")
        if hidden_field_snapshot["quality"]["commitBindingCount"] != 0:
            raise RuntimeError("Commit reappeared while a hidden relationship query was pending")
        cancel = next(
            item
            for item in hidden_field_snapshot["interactionBindings"]
            if item["label"] == "Cancel" and "ui.activate" in item["operations"]
        )
        environment.step(f"click('{cancel['targetId']}')")
        time.sleep(1)
        cancelled_snapshot = runtime_snapshot(environment)
        if cancelled_snapshot["quality"]["relationshipUnresolvedBindingCount"] != 0:
            raise RuntimeError("Cancelled relationship surface remained unresolved")
        if cancelled_snapshot["quality"]["blockedCommitBindingCount"] != 0:
            raise RuntimeError("Cancelled relationship surface retained a commit blocker")
        print(
            json.dumps(
                {
                    "adapterId": popup_snapshot["adapterId"],
                    "assignedBinding": assigned,
                    "opaqueLabels": opaque,
                    "popupEditableBindings": [
                        item
                        for item in result_snapshot["interactionBindings"]
                        if item["priorityClass"] == "editable-field"
                    ],
                    "relationshipInput": relationship_input,
                    "relationshipOptions": relationship_options,
                    "quality": result_snapshot["quality"],
                    "hiddenFieldQuality": hidden_field_snapshot["quality"],
                    "cancelledQuality": cancelled_snapshot["quality"],
                },
                sort_keys=True,
            )
        )
    finally:
        environment.close()


if __name__ == "__main__":
    main()
