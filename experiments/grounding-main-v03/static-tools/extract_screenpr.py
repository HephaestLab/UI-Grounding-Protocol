import argparse
import hashlib
import json
import math
import os
import tempfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

from PIL import Image, ImageDraw
from rapidocr import RapidOCR

OCR_ENGINE = None


def stable_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def write_json_atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False, newline="\n"
    ) as handle:
        json.dump(value, handle, ensure_ascii=False, sort_keys=True, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(path)


def rectangle_from_box(box):
    xs = [float(point[0]) for point in box]
    ys = [float(point[1]) for point in box]
    return [round(min(xs)), round(min(ys)), round(max(xs)), round(max(ys))]


def contains(rectangle, point):
    left, top, right, bottom = rectangle
    x, y = point
    return left <= x <= right and top <= y <= bottom


def distance(rectangle, point):
    left, top, right, bottom = rectangle
    center_x = (left + right) / 2
    center_y = (top + bottom) / 2
    return math.hypot(center_x - point[0], center_y - point[1])


def marked_crop(image, point, scale):
    width, height = image.size
    crop_width = max(1, round(width * scale))
    crop_height = max(1, round(height * scale))
    left = max(0, min(width - crop_width, round(point[0] - crop_width / 2)))
    top = max(0, min(height - crop_height, round(point[1] - crop_height / 2)))
    crop = image.crop((left, top, left + crop_width, top + crop_height)).convert("RGB")
    local_point = (point[0] - left, point[1] - top)
    radius = max(7, round(min(crop.size) * 0.018))
    draw = ImageDraw.Draw(crop)
    draw.ellipse(
        (
            local_point[0] - radius,
            local_point[1] - radius,
            local_point[0] + radius,
            local_point[1] + radius,
        ),
        outline=(255, 0, 0),
        width=max(3, radius // 3),
    )
    draw.line(
        (
            local_point[0] - radius * 2,
            local_point[1],
            local_point[0] + radius * 2,
            local_point[1],
        ),
        fill=(255, 0, 0),
        width=max(2, radius // 4),
    )
    draw.line(
        (
            local_point[0],
            local_point[1] - radius * 2,
            local_point[0],
            local_point[1] + radius * 2,
        ),
        fill=(255, 0, 0),
        width=max(2, radius // 4),
    )
    return crop, [left, top, left + crop_width, top + crop_height]


def process_one(task, dataset_root, output_root):
    global OCR_ENGINE
    safe_id = task["sourceTaskId"].replace(":", "-")
    record_path = output_root / "records" / f"{safe_id}.json"
    if record_path.exists():
        return {"sourceTaskId": task["sourceTaskId"], "status": "cached"}

    image_path = dataset_root / task["image"]
    if not image_path.is_file():
        raise FileNotFoundError(image_path)
    image = Image.open(image_path).convert("RGB")
    width, height = image.size
    point = [round(float(task["point"][0])), round(float(task["point"][1]))]
    if not (0 <= point[0] < width and 0 <= point[1] < height):
        raise ValueError(f"Point {point} falls outside {image_path} ({width}x{height})")

    if OCR_ENGINE is None:
        OCR_ENGINE = RapidOCR()
    result = OCR_ENGINE(str(image_path))
    texts = tuple(result.txts or ())
    scores = tuple(result.scores or ())
    boxes = tuple(result.boxes if result.boxes is not None else ())
    nodes = []
    for index, (text, score, box) in enumerate(zip(texts, scores, boxes)):
        if not str(text).strip() or float(score) < 0.5:
            continue
        nodes.append(
            {
                "id": f"ocr-{index}",
                "text": str(text).strip(),
                "confidence": round(float(score), 5),
                "bounds": rectangle_from_box(box),
            }
        )
    target_nodes = [node for node in nodes if contains(node["bounds"], point)]
    if not target_nodes and nodes:
        target_nodes = sorted(nodes, key=lambda node: distance(node["bounds"], point))[:3]

    assets_root = output_root / "assets" / safe_id
    assets_root.mkdir(parents=True, exist_ok=True)
    rendered = []
    for label, scale in (("screen", 1.0), ("region", 0.6), ("local", 0.3)):
        crop, source_bounds = marked_crop(image, point, scale)
        destination = assets_root / f"{label}.png"
        crop.save(destination, format="PNG", optimize=True)
        rendered.append(
            {
                "level": label,
                "path": str(destination.resolve()),
                "sourceBounds": source_bounds,
                "width": crop.width,
                "height": crop.height,
            }
        )

    image_digest = hashlib.sha256(image_path.read_bytes()).hexdigest()
    record = {
        "schemaVersion": "0.3.0",
        "extractor": {
            "id": "rapidocr-screenpr-v1",
            "rapidocr": "3.9.2",
            "pointMarker": "red-ring-cross-v1",
        },
        "sourceTaskId": task["sourceTaskId"],
        "modality": task["modality"],
        "sourceId": task["sourceId"],
        "sourceImage": str(image_path.resolve()),
        "sourceImageDigest": image_digest,
        "viewport": {"width": width, "height": height},
        "point": point,
        "ocrNodes": nodes,
        "targetNodeIds": [node["id"] for node in target_nodes],
        "renderedImages": rendered,
    }
    record["recordDigest"] = sha256(stable_json(record))
    write_json_atomic(record_path, record)
    return {
        "sourceTaskId": task["sourceTaskId"],
        "status": "extracted",
        "ocrNodes": len(nodes),
        "targetNodes": len(target_nodes),
    }


def main():
    parser = argparse.ArgumentParser()
    default_experiment = Path(__file__).resolve().parents[1]
    parser.add_argument(
        "--selection",
        type=Path,
        default=default_experiment / ".runs/source-data/screenpr/selection.json",
    )
    parser.add_argument(
        "--dataset-root",
        type=Path,
        default=default_experiment / "vendor/screenpr-data",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=default_experiment / ".runs/source-data/screenpr/extracted",
    )
    parser.add_argument(
        "--workers", type=int, default=max(1, min(4, (os.cpu_count() or 2) // 2))
    )
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()

    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    tasks = selection["tasks"][: args.limit] if args.limit else selection["tasks"]
    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(process_one, task, args.dataset_root, args.output): task
            for task in tasks
        }
        for completed, future in enumerate(as_completed(futures), start=1):
            result = future.result()
            results.append(result)
            print(
                json.dumps(
                    {"progress": completed, "total": len(tasks), **result},
                    ensure_ascii=False,
                ),
                flush=True,
            )

    summary = {
        "schemaVersion": "0.3.0",
        "extractor": "rapidocr-screenpr-v1",
        "selectionDigest": selection["selectionDigest"],
        "count": len(results),
        "extracted": sum(row["status"] == "extracted" for row in results),
        "cached": sum(row["status"] == "cached" for row in results),
        "resultDigest": sha256(stable_json(sorted(results, key=lambda row: row["sourceTaskId"]))),
    }
    write_json_atomic(args.output / "summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
