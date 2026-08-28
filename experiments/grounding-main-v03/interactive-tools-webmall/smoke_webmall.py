import json

from browsergym.webmall.task import WebMallTask
from playwright.sync_api import sync_playwright


def main() -> None:
    task = WebMallTask("webmall.Webmall_Find_Specific_Product_Task1", seed=0)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        goal, _ = task.setup(page)
        answers = task.task_config["correct_answer"]["answers"]
        checkpoint_scores = []
        for answer in answers:
            page.goto(answer)
            checkpoint_score, *_ = task.validate(page, [])
            checkpoint_scores.append(checkpoint_score)
        page.goto(task.urls["FRONTEND_URL"])
        page.fill("#finalInput", "###".join(answers))
        page.click("#submitBtn")
        final_step_score, done, message, info = task.validate(
            page,
            [{"role": "assistant", "message": "Done"}],
        )
        score = task.checklist.total_score()
        browser.close()
    output = {
        "schemaVersion": "0.3.0",
        "taskId": task.get_task_id(),
        "goalLoaded": bool(goal),
        "officialScore": score,
        "checkpointStepScores": checkpoint_scores,
        "finalStepScore": final_step_score,
        "done": done,
        "message": message,
        "checkedCheckpoints": len(
            info["checklist"]["checkpoints"]
            if isinstance(info["checklist"], dict)
            else info["checklist"]
        ),
    }
    if not done or score != 1.0:
        raise RuntimeError(f"WebMall native smoke failed: {output}")
    print(json.dumps(output, sort_keys=True))


if __name__ == "__main__":
    main()
