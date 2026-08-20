#!/usr/bin/env python3
"""Terrace Solar hero film — Runway image-to-video runner.

Python port of tools/runway-generate.mjs, because there is no JavaScript runtime
on this machine. Standard library only.

SAFETY MODEL
------------
Nothing is submitted, and nothing can be charged, until BOTH are true:

  1. PAYLOAD_CONFIRMED below is set to True, by a human, after checking the
     request body against the current official Runway API documentation.
  2. --submit is passed explicitly. The default mode is --dry-run.

Dry run prints the exact request that would be sent, with the secret redacted.

Spend control: two attempts per scene, maximum. A scene that already has a
successful take is never re-run and its output is never overwritten.

Usage
-----
  python tools/runway_generate.py --list
  python tools/runway_generate.py 02-panel-handling            # dry run
  python tools/runway_generate.py 02-panel-handling --submit   # spends money
  python tools/runway_generate.py --status
"""

import argparse
import base64
import json
import mimetypes
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_PATH = os.path.join(ROOT, "assets", "video", "generation.json")
OUTPUT_DIR = os.path.join(ROOT, "assets", "video")

# ---------------------------------------------------------------------------
# GATE. Flip to True only after verifying build_payload() against the current
# official Runway docs (docs.dev.runwayml.com) or the request example in your
# Runway dashboard. Leaving this False is what stops accidental spend.
# ---------------------------------------------------------------------------
PAYLOAD_CONFIRMED = False

# ---------------------------------------------------------------------------
# UNVERIFIED CONFIG. Every value here still needs confirming against official
# docs. They are defaults to check, not defaults to trust.
#
# Confirmed so far: env var name RUNWAYML_API_SECRET; endpoint /v1/image_to_video;
# async submit-then-poll; X-Runway-Version header; as of API version 2024-11-06
# `ratio` takes an explicit resolution such as 1280:768, not "16:9"; duration
# 2-10s; input images cap at 20MB; `seed` supported.
#
# NOT confirmed: base URL, the current X-Runway-Version value, the model name,
# and whether promptImage accepts a data URI or requires a public HTTPS URL.
# ---------------------------------------------------------------------------
API_URL = os.environ.get("RUNWAY_API_URL", "")          # e.g. https://api.dev.runwayml.com
API_VERSION = os.environ.get("RUNWAY_API_VERSION", "")  # e.g. 2024-11-06
MODEL = os.environ.get("RUNWAY_MODEL", "")              # e.g. gen4_turbo

RATIO = "1280:768"        # 16:9 master. Verify against the current version.
DURATION_SECONDS = 5      # 5s generated, trimmed to ~2.5-3s in the cut.
MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_PROMPT_CHARS = 1000   # documented positive-prompt limit
MAX_ATTEMPTS_PER_SCENE = 2
POLL_INTERVAL_SECONDS = 10
POLL_TIMEOUT_SECONDS = 900

# ---------------------------------------------------------------------------
# Scene table — authoritative. Prompts are the ones reviewed in
# assets/video/PROMPTS.md.
#
# Scenes 03 and 04 deliberately do NOT use the references named in
# generation.json:
#   03: mounting-reference.png is a watermarked third-party render of glass-panel
#       hardware, i.e. the wrong product and not ours to send to a third party.
#   04: system-reference.png has headline text, a price range, a courier name and
#       setup-time claims baked into the artwork — all withheld claims, and
#       reference text bleeds into output.
# The reference actually used is recorded back into generation.json on each run.
# ---------------------------------------------------------------------------
NEGATIVE = (
    "Preserve the supplied product design: ultra-thin semi-flexible solar panel with "
    "aluminum frame, only slight realistic flex. No thick rooftop panel, no warped cells, "
    "no extra cables, no floating hardware, no text, no logos, no unsafe installation, "
    "no rolling or folding, no sagging, nobody standing on a panel, no railing or roof work, "
    "no invented hardware, no glowing wires or animated electricity."
)

SCENES = {
    "01-arrival": {
        "reference": "assets/img/panels-outdoor.jpg",
        "prompt": (
            "Slow lateral dolly, left to right, across a residential back terrace in early "
            "morning. Four ultra-thin semi-flexible solar panels sit low on matte black aluminum "
            "stands on pale stone paving, angled toward a low sun, a warm timber screen behind "
            "them softly out of focus. The panels stay completely rigid and still; only the camera "
            "moves. Warm low-angle daylight, long soft shadows, faint morning haze. Camera at 1.2 m, "
            "35 mm equivalent, steady slow lateral move, no shake. Upper left of frame stays open. "
            "Photoreal, natural colour."
        ),
    },
    "02-panel-handling": {
        "reference": "assets/img/panel-handling.jpg",
        "prompt": (
            "Slow push-in toward the long edge of a single ultra-thin semi-flexible solar panel. "
            "One adult in a plain grey t-shirt, both feet planted on the ground, lifts the panel "
            "with two hands on its frame, holds it level, and sets it back onto a low matte black "
            "aluminum stand. Slow, controlled, deliberate. The panel stays flat and level with only "
            "a few millimetres of natural flex; it never bows, curls or folds. Slim edge profile in "
            "sharp focus against a defocused background. Warm early morning light from the left. "
            "Camera at 1.1 m, 50 mm equivalent, slow push-in, shallow depth of field. Photoreal."
        ),
    },
    "03-mounting-detail": {
        "reference": "assets/img/panel-handling.jpg",
        "prompt": (
            "Extreme close-up of the join where an ultra-thin solar panel's aluminum frame meets a "
            "matte black perforated aluminum stand. The bracket, its row of perforations and the "
            "panel's thin edge are crisply visible. Very slow camera drift to the right, revealing "
            "the stand's leg meeting pale stone paving. Nothing is touched or assembled; this is a "
            "still observation of hardware already in place. Warm raking morning light picking out "
            "machined edges. Macro, 85 mm equivalent, very slow drift, very shallow depth of field. "
            "Photoreal, natural colour."
        ),
    },
    "04-connected-system": {
        "reference": "assets/img/power-meter.jpg",
        "prompt": (
            "A small matte black power meter module with a plain LCD display and two split-core "
            "current clamps rests on a clean pale surface, cables coiled neatly beside it. Very slow "
            "camera drift left to right across the module, bringing the display and then the clamps "
            "through focus. The device is inert and still: the display does not change, nothing "
            "blinks or glows, no light travels along any cable. Soft even cool-neutral daylight from "
            "a window off frame. 60 mm equivalent, slow drift, shallow depth of field. Photoreal."
        ),
    },
    "05-lifestyle": {
        "reference": "assets/img/battery-home.jpg",
        "prompt": (
            "A tall cylindrical matte black battery unit stands on a warm wooden floor in a calm, "
            "lived-in living room, a bicycle leaning against the wall behind it, a potted plant "
            "catching light to the right. Very slow push-in past the plant toward the battery, soft "
            "morning light moving almost imperceptibly across the floor. The room is still and empty "
            "of people. The thin warm light ring at the base stays constant and subtle; it does not "
            "pulse or sweep. 40 mm equivalent, slow push-in, shallow depth of field, warm interior "
            "grade. Photoreal, natural colour."
        ),
    },
    "06-loop-return": {
        "reference": "assets/img/panels-outdoor.jpg",
        "prompt": (
            "Slow lateral dolly continuing left to right across the same residential terrace, pulling "
            "back slightly to a wider view of four ultra-thin semi-flexible panels on low matte black "
            "stands, pale stone paving, warm timber screen behind. The panels are rigid and "
            "motionless. Light, colour and camera speed match the opening shot so the end of the move "
            "can be cross-dissolved into its beginning. Camera at 1.2 m, 35 mm equivalent, steady "
            "slow lateral move easing slightly at the end. Photoreal, natural colour."
        ),
    },
}


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_dotenv():
    """Read .env into os.environ without overwriting anything already set."""
    path = os.path.join(ROOT, ".env")
    if not os.path.isfile(path):
        return False
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip().strip('"').strip("'")
            if key and value and key not in os.environ:
                os.environ[key] = value
    return True


def load_state():
    with open(STATE_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def save_state(state):
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(state, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    os.replace(tmp, STATE_PATH)


def scene_state(state, scene_id):
    for entry in state.get("scenes", []):
        if entry.get("id") == scene_id:
            return entry
    raise SystemExit("Unknown scene: %s" % scene_id)


def compose_prompt(scene_id):
    text = SCENES[scene_id]["prompt"] + " " + NEGATIVE
    return " ".join(text.split())


def encode_reference(rel_path):
    """Return (data_uri, size_bytes). Runway fetches promptImage, so a local file
    has to travel either as a data URI or via a public URL you host."""
    abs_path = os.path.join(ROOT, rel_path.replace("/", os.sep))
    if not os.path.isfile(abs_path):
        raise SystemExit("Reference image not found: %s" % rel_path)
    size = os.path.getsize(abs_path)
    if size > MAX_IMAGE_BYTES:
        raise SystemExit("Reference %s is %.1f MB, over the %d MB limit."
                         % (rel_path, size / 1e6, MAX_IMAGE_BYTES // (1024 * 1024)))
    mime = mimetypes.guess_type(abs_path)[0] or "image/jpeg"
    with open(abs_path, "rb") as fh:
        blob = base64.b64encode(fh.read()).decode("ascii")
    return "data:%s;base64,%s" % (mime, blob), size


def build_payload(scene_id, prompt_image):
    """The request body. VERIFY THIS against current official docs before setting
    PAYLOAD_CONFIRMED = True. Field names below are the documented shape as far as
    it could be confirmed; the model name and ratio in particular need checking."""
    return {
        "model": MODEL,
        "promptImage": prompt_image,
        "promptText": compose_prompt(scene_id),
        "ratio": RATIO,
        "duration": DURATION_SECONDS,
    }


def request_json(url, method="GET", body=None, headers=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", "replace")[:800]
        return err.code, {"error": detail}


def auth_headers(secret):
    return {
        "Authorization": "Bearer %s" % secret,
        "X-Runway-Version": API_VERSION,
    }


def poll_task(task_id, secret):
    deadline = time.time() + POLL_TIMEOUT_SECONDS
    url = "%s/v1/tasks/%s" % (API_URL.rstrip("/"), task_id)
    while time.time() < deadline:
        status_code, payload = request_json(url, headers=auth_headers(secret))
        if status_code >= 400:
            return "FAILED", payload
        state = (payload.get("status") or "").upper()
        print("    task %s: %s" % (task_id, state or "?"))
        if state in ("SUCCEEDED", "FAILED", "CANCELLED"):
            return state, payload
        time.sleep(POLL_INTERVAL_SECONDS)
    return "TIMEOUT", {"error": "Polling exceeded %ds" % POLL_TIMEOUT_SECONDS}


def download(url, dest):
    if os.path.exists(dest):
        raise SystemExit("Refusing to overwrite existing take: %s" % dest)
    with urllib.request.urlopen(url, timeout=300) as resp, open(dest, "wb") as fh:
        fh.write(resp.read())
    return dest


def cmd_list():
    print("Scenes (prompt limit %d chars):\n" % MAX_PROMPT_CHARS)
    over = 0
    for scene_id, cfg in SCENES.items():
        text = compose_prompt(scene_id)
        flag = "OK " if len(text) <= MAX_PROMPT_CHARS else "OVER"
        if flag == "OVER":
            over += 1
        ref = cfg["reference"]
        exists = "" if os.path.isfile(os.path.join(ROOT, ref.replace("/", os.sep))) else "  [MISSING]"
        print("  %-20s %s %4d chars   %s%s" % (scene_id, flag, len(text), ref, exists))
    if over:
        print("\n%d scene(s) exceed the prompt limit - trim before submitting." % over)


def cmd_status():
    state = load_state()
    print("provider=%s  status=%s\n" % (state.get("provider"), state.get("status")))
    for entry in state.get("scenes", []):
        print("  %-20s %-10s attempts=%s output=%s"
              % (entry.get("id"), entry.get("status"),
                 entry.get("attempts", 0), entry.get("output")))


def run_scene(scene_id, submit):
    if scene_id not in SCENES:
        raise SystemExit("Unknown scene: %s. Try --list." % scene_id)

    state = load_state()
    entry = scene_state(state, scene_id)

    if entry.get("status") == "succeeded":
        print("%s already succeeded (%s). Not re-running." % (scene_id, entry.get("output")))
        return 0

    attempts = int(entry.get("attempts") or 0)
    if attempts >= MAX_ATTEMPTS_PER_SCENE:
        print("%s has used %d/%d attempts. Stopping - record the blocker and review before more spend."
              % (scene_id, attempts, MAX_ATTEMPTS_PER_SCENE))
        return 1

    reference = SCENES[scene_id]["reference"]
    prompt_image, size = encode_reference(reference)
    prompt_text = compose_prompt(scene_id)

    if len(prompt_text) > MAX_PROMPT_CHARS:
        raise SystemExit("Prompt for %s is %d chars, over the %d limit. Trim it."
                         % (scene_id, len(prompt_text), MAX_PROMPT_CHARS))

    payload = build_payload(scene_id, prompt_image)
    redacted = dict(payload)
    redacted["promptImage"] = "<data uri, %s, %.1f KB base64>" % (reference, len(prompt_image) / 1024)

    print("Scene:      %s" % scene_id)
    print("Reference:  %s (%.1f KB)" % (reference, size / 1024))
    print("Prompt:     %d chars" % len(prompt_text))
    print("Attempt:    %d of %d" % (attempts + 1, MAX_ATTEMPTS_PER_SCENE))
    print("Endpoint:   %s/v1/image_to_video" % (API_URL.rstrip("/") or "<RUNWAY_API_URL unset>"))
    print("Version:    %s" % (API_VERSION or "<RUNWAY_API_VERSION unset>"))
    print("Payload:    %s" % json.dumps(redacted, indent=2)[:1200])

    if not submit:
        print("\nDry run. Nothing submitted, nothing charged.")
        print("Add --submit to spend, once PAYLOAD_CONFIRMED is True and .env has your key.")
        return 0

    if not PAYLOAD_CONFIRMED:
        raise SystemExit(
            "\nRefusing to submit: PAYLOAD_CONFIRMED is False.\n"
            "Check build_payload() against the current official Runway docs, or the request\n"
            "example in your Runway dashboard, then set PAYLOAD_CONFIRMED = True in this file."
        )

    secret = os.environ.get("RUNWAYML_API_SECRET")
    missing = [name for name, value in
               (("RUNWAYML_API_SECRET", secret), ("RUNWAY_API_URL", API_URL),
                ("RUNWAY_API_VERSION", API_VERSION), ("RUNWAY_MODEL", MODEL)) if not value]
    if missing:
        raise SystemExit("Missing required settings: %s. Put them in .env (gitignored)."
                         % ", ".join(missing))

    entry["attempts"] = attempts + 1
    entry["status"] = "submitting"
    entry["reference_used"] = reference
    entry["last_attempt_at"] = now_iso()
    save_state(state)

    print("\nSubmitting...")
    code, response = request_json("%s/v1/image_to_video" % API_URL.rstrip("/"),
                                  method="POST", body=payload, headers=auth_headers(secret))

    if code >= 400 or not response.get("id"):
        entry["status"] = "failed"
        entry["error"] = json.dumps(response)[:1000]
        save_state(state)
        print("Submit failed (HTTP %s): %s" % (code, entry["error"]))
        return 1

    task_id = response["id"]
    entry["task_id"] = task_id
    entry["status"] = "running"
    entry["error"] = None
    save_state(state)
    print("  task id: %s" % task_id)

    final_state, result = poll_task(task_id, secret)

    if final_state != "SUCCEEDED":
        entry["status"] = "failed"
        entry["error"] = json.dumps(result)[:1000]
        save_state(state)
        print("Task ended %s: %s" % (final_state, entry["error"][:300]))
        return 1

    urls = result.get("output") or []
    if not urls:
        entry["status"] = "failed"
        entry["error"] = "Task succeeded but returned no output URL."
        save_state(state)
        print(entry["error"])
        return 1

    dest = os.path.join(OUTPUT_DIR, "%s.mp4" % scene_id)
    download(urls[0], dest)
    entry["status"] = "succeeded"
    entry["output"] = os.path.relpath(dest, ROOT).replace(os.sep, "/")
    entry["error"] = None
    entry["completed_at"] = now_iso()
    save_state(state)
    print("Saved %s" % entry["output"])
    return 0


def main():
    parser = argparse.ArgumentParser(description="Runway image-to-video runner for the Terrace Solar hero film.")
    parser.add_argument("scene", nargs="?", help="scene id, e.g. 02-panel-handling")
    parser.add_argument("--submit", action="store_true", help="actually submit (spends money)")
    parser.add_argument("--dry-run", action="store_true", help="default; print the request only")
    parser.add_argument("--list", action="store_true", help="list scenes and prompt lengths")
    parser.add_argument("--status", action="store_true", help="show generation.json state")
    args = parser.parse_args()

    load_dotenv()

    if args.list:
        return cmd_list()
    if args.status:
        return cmd_status()
    if not args.scene:
        parser.print_help()
        return 0
    return run_scene(args.scene, submit=args.submit and not args.dry_run)


if __name__ == "__main__":
    sys.exit(main() or 0)
