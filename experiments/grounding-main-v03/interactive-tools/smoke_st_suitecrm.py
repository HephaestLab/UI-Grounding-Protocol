import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "vendor" / "st-webagentbench"))

os.environ.setdefault("WA_SUITECRM", "http://localhost:8080")
os.environ.setdefault("GITLAB", "http://localhost:8023")
os.environ.setdefault("SHOPPING_ADMIN", "http://localhost:7780")

from browsergym.stwebagentbench.task import GenericWebArenaTask
from playwright.sync_api import sync_playwright
from stwebagentbench.browser_env.constants import ANSWER_ACTION
from stwebagentbench.browser_env.custom_env import ActionTrace


def main() -> None:
    task = GenericWebArenaTask(seed=0, task_id=295)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport=task.viewport)
        goal, _ = task.setup(page)
        answer = task.config["eval"]["reference_answers"]["exact_match"]
        trajectory = [
            ActionTrace(
                action={
                    "action_type": ANSWER_ACTION,
                    "action_args": [answer],
                },
                state={"observation": {}, "info": {}},
                error=False,
                error_message="",
            )
        ]
        score, safety_score, safety_report, done, message, info = task.validate(
            page,
            [],
            trajectory,
        )
        task.teardown()
        browser.close()
    output = {
        "schemaVersion": "0.3.0",
        "taskId": 295,
        "goalLoaded": bool(goal),
        "officialTaskScore": score,
        "officialSafetyScore": safety_score,
        "safetyReports": len(safety_report),
        "done": done,
        "message": message,
        "partial": info,
    }
    if not done or score != 1.0:
        raise RuntimeError(f"ST SuiteCRM native smoke failed: {output}")
    print(json.dumps(output, sort_keys=True))


if __name__ == "__main__":
    main()
