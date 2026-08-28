import argparse
import json
import sys
from pathlib import Path

import gymnasium as gym

import browsergym.webmall  # noqa: F401
from browsergym.core.action.highlevel import HighLevelActionSet

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "interactive-driver"))

from driver_common import (
    RUNS_ROOT,
    accessible_nodes,
    action_string,
    actor_step,
    materialize_step,
    read_json,
    save_screenshot,
    sha256,
    stable_json,
    write_json,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--method", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--replicate", type=int, default=1)
    parser.add_argument("--max-steps", type=int, default=40)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    condition = {
        "sourceTaskId": args.task_id,
        "method": args.method,
        "model": args.model,
        "replicate": args.replicate,
    }
    job_id = sha256(stable_json({"runId": args.run_id, **condition}))[:24]
    job_root = RUNS_ROOT / args.run_id / "tasks" / job_id
    official_score_path = job_root / "official-score.json"
    if official_score_path.exists():
        print(json.dumps({"status": "skipped", **read_json(official_score_path)}))
        return

    action_set = HighLevelActionSet(
        subsets=["bid", "coord", "chat", "nav"],
        strict=False,
        multiaction=False,
    )
    environment = gym.make(
        f"browsergym/webmall.{args.task_id}",
        headless=True,
        action_mapping=action_set.to_python_code,
    )
    observation, _ = environment.reset(seed=0)
    task_config = environment.unwrapped.task.task_config
    episode_ids = []
    actions = []
    rewards = []
    terminated = False
    truncated = False
    invalid_actor_output = False
    actor_stopped = False
    public_history = []
    for step in range(1, args.max_steps + 1):
        screenshot_path = job_root / "screens" / f"step-{step:02d}.png"
        observation_path = job_root / "observations" / f"step-{step:02d}.json"
        task_path = job_root / "tasks" / f"step-{step:02d}.json"
        save_screenshot(observation, screenshot_path)
        host_observation = {
            "schemaVersion": "0.3.0",
            "sourceTaskId": args.task_id,
            "benchmarkId": "webmall-action",
            "domain": "commerce",
            "taskFamily": task_config["category"],
            "instruction": observation["goal"],
            "step": step,
            "maxSteps": args.max_steps,
            "url": observation["url"],
            "viewport": {
                "width": int(observation["screenshot"].shape[1]),
                "height": int(observation["screenshot"].shape[0]),
            },
            "screenshotPath": str(screenshot_path.resolve()),
            "focusedElementId": observation.get("focused_element_bid") or None,
            "nodes": accessible_nodes(observation),
            "surface": f"webmall/{job_id}/step-{step}",
            "previousAction": public_history[-1]["action"] if public_history else None,
            "publicHistory": public_history,
        }
        write_json(observation_path, host_observation)
        materialize_step(observation_path, task_path)
        episode_id, output, valid = actor_step(
            run_id=args.run_id,
            method=args.method,
            model=args.model,
            replicate=args.replicate,
            task_path=task_path,
        )
        episode_ids.append(episode_id)
        if not valid:
            invalid_actor_output = True
            break
        action = action_string(output)
        actions.append(action)
        observation, reward, terminated, truncated, _ = environment.step(action)
        rewards.append(float(reward))
        public_history.append(
            {
                "step": step,
                "action": action,
                "result": {
                    "url": observation["url"],
                },
            }
        )
        if output["kind"] == "stop":
            actor_stopped = True
        if terminated or truncated or actor_stopped:
            break

    official_score = float(environment.unwrapped.task.checklist.total_score())
    environment.close()
    result = {
        "schemaVersion": "0.3.0",
        "benchmarkId": "webmall-action",
        "sourceTaskId": args.task_id,
        "domain": "commerce",
        "taskFamily": task_config["category"],
        "condition": condition,
        "strictSuccess": int(
            not invalid_actor_output and official_score >= 1.0 - 1e-9
        ),
        "officialScore": official_score,
        "steps": len(episode_ids),
        "terminated": bool(terminated),
        "truncated": bool(truncated),
        "actorStopped": actor_stopped,
        "invalidActorOutput": invalid_actor_output,
        "episodeIds": episode_ids,
        "actions": actions,
        "stepRewards": rewards,
    }
    write_json(official_score_path, result)
    print(json.dumps({"status": "completed", **result}, sort_keys=True))


if __name__ == "__main__":
    main()
