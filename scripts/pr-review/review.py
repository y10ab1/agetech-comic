#!/usr/bin/env python3
"""Trusted local controller for event-driven OpenCode PR reviews (stdlib only)."""

import fcntl
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import subprocess
import tempfile

REPO = "y10ab1/agetech-comic"
HOME = Path.home()
INSTALL = Path(__file__).resolve().parent
STATE = HOME / ".local/share/agetech-pr-review"
TRUSTED = {"OWNER", "MEMBER", "COLLABORATOR"}


def run(args, *, cwd=None, env=None, timeout=120, check=True):
    result = subprocess.run(args, cwd=cwd, env=env, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, errors="replace",
                            timeout=timeout)
    if check and result.returncode:
        # Avoid dumping environment, credentials, or model logs into public Actions logs.
        raise RuntimeError(f"{args[0]} {args[1]} failed (exit {result.returncode})")
    return result


def api(endpoint, payload=None):
    args = ["gh", "api", endpoint]
    if payload is None:
        return json.loads(run(args).stdout)
    result = subprocess.run(args + ["--method", "POST", "--input", "-"],
                            input=json.dumps(payload), text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
    if result.returncode:
        raise RuntimeError(f"GitHub review submission failed (exit {result.returncode})")
    return json.loads(result.stdout)


def all_items(endpoint):
    # --slurp is unavailable on older distro-packaged gh versions.
    output = run(["gh", "api", "--paginate", "--jq", ".[] | @json", endpoint]).stdout
    return [json.loads(line) for line in output.splitlines() if line.strip()]


def eligible(pr):
    return (pr["state"] == "open" and not pr["draft"]
            and pr["base"]["repo"]["full_name"] == REPO
            and bool(pr["head"].get("repo"))
            and pr["author_association"] in TRUSTED)


def marker(pr):
    return f"<!-- opencode-local-review:v1:{pr['head']['sha']}:{pr['base']['sha']} -->"


def already_reviewed(reviews, pr, login):
    return any(r["user"]["login"] == login and r["state"] != "DISMISSED"
               and marker(pr) in (r.get("body") or "") for r in reviews)


def parse_result(events_text):
    events = [json.loads(line) for line in events_text.splitlines() if line.strip()]
    if any(e.get("type") == "error" for e in events):
        raise ValueError("OpenCode emitted an error")
    texts = [e["part"]["text"] for e in events if e.get("type") == "text"]
    finishes = [e for e in events if e.get("type") == "step_finish"]
    if not texts or not finishes or finishes[-1]["part"].get("reason") != "stop":
        raise ValueError("OpenCode did not finish normally")
    result = json.loads(texts[-1])
    if result.get("decision") not in {"APPROVE", "REQUEST_CHANGES", "COMMENT"}:
        raise ValueError("Invalid decision")
    if type(result.get("verification_complete")) is not bool:
        raise ValueError("Missing verification status")
    if not isinstance(result.get("summary"), str) or not result["summary"].strip():
        raise ValueError("Missing summary")
    findings = result.get("findings")
    if not isinstance(findings, list):
        raise ValueError("Invalid findings")
    for finding in findings:
        if (finding.get("priority") not in {"P1", "P2", "P3"}
                or not isinstance(finding.get("path"), str)
                or not finding["path"].strip()
                or PurePosixPath(finding["path"]).is_absolute()
                or ".." in PurePosixPath(finding["path"]).parts
                or type(finding.get("line")) is not int or finding["line"] < 1
                or not isinstance(finding.get("body"), str) or not finding["body"].strip()):
            raise ValueError("Invalid finding")
    return result


def has_blocking(result):
    return any(f["priority"] in {"P1", "P2"} for f in result["findings"])


def publication_decision(result, checks_ok, author, login):
    """Derive the GitHub event from findings, not from the model's free choice.

    Any P1/P2 finding requests changes, even if some verification is missing.
    Approval requires the model's APPROVE, complete verification, passing checks
    and no blocking findings (P3 suggestions may accompany an approval).
    """
    if has_blocking(result):
        event = "REQUEST_CHANGES"
    elif (result["decision"] == "APPROVE" and checks_ok
            and result["verification_complete"]):
        event = "APPROVE"
    else:
        event = "COMMENT"
    if author == login:
        return "COMMENT"  # GitHub prohibits self-approval and self-request-changes.
    return event


def same_revision(before, after):
    return (eligible(after) and before["head"]["sha"] == after["head"]["sha"]
            and before["base"]["sha"] == after["base"]["sha"])


def sandbox_check(source, image, command, name, log):
    container = f"agetech-review-{os.getpid()}-{name}"
    args = ["docker", "run", "--rm", "--name", container,
            "--cpus", "2", "--memory", "4g", "--pids-limit", "512",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
            "--mount", f"type=bind,src={source},dst=/src,readonly",
            "--workdir", "/work", image, "sh", "-lc",
            "cp -R /src/. /work/ && " + command]
    try:
        result = run(args, timeout=900, check=False)
        log.write(f"\n## {name}: exit {result.returncode}\n{result.stdout}\n{result.stderr}\n")
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        log.write(f"\n## {name}: timed out after 900 seconds\n")
        return False
    finally:
        run(["docker", "rm", "-f", container], check=False)


def checks(source, changed, log_path):
    results = {}
    with log_path.open("w") as log:
        if any(p.startswith(("frontend/", "shared/")) for p in changed):
            results["frontend"] = sandbox_check(
                source, "node:24-bookworm-slim",
                "cd frontend && npm ci --no-audit --no-fund && npm run lint && "
                "npm run build && npx --no-install tsc --noEmit", "frontend", log)
        if any(p.startswith(("backend/", "shared/")) for p in changed):
            results["backend"] = sandbox_check(
                source, "python:3.12-slim",
                "cd backend && pip install --disable-pip-version-check . pytest && "
                "python -m pytest", "backend", log)
        if any(p.startswith("scripts/pr-review/") for p in changed):
            results["review-controller"] = sandbox_check(
                source, "python:3.12-slim",
                "python -m unittest discover -s scripts/pr-review -p 'test_*.py' -v",
                "controller", log)
        if not results:
            log.write("No preset executable checks apply. Assess whether static review is sufficient.\n")
    return results


def review(number, expected_sha=""):
    endpoint = f"repos/{REPO}/pulls/{number}"
    pr = api(endpoint)
    if not eligible(pr) or (expected_sha and expected_sha != pr["head"]["sha"]):
        print("Skipped: closed/draft/untrusted PR or superseded event.")
        return
    permission = api(f"repos/{REPO}/collaborators/{pr['user']['login']}/permission")
    if permission["permission"] not in {"admin", "maintain", "write"}:
        print("Skipped: PR author does not currently have repository write access.")
        return
    login = api("user")["login"]
    reviews = all_items(endpoint + "/reviews?per_page=100")
    if already_reviewed(reviews, pr, login):
        print("Skipped: this head/base pair was already reviewed.")
        return
    jobs = STATE / "jobs"
    jobs.mkdir(parents=True, exist_ok=True)
    job = Path(tempfile.mkdtemp(prefix=f"pr-{number}-{pr['head']['sha'][:8]}-", dir=jobs))
    source = job / "source"
    try:
        print(f"Preparing PR #{number} at {pr['head']['sha'][:12]}.", flush=True)
        run(["git", "clone", "--quiet", "--no-checkout", f"https://github.com/{REPO}.git", str(source)])
        run(["git", "-C", str(source), "config", "core.hooksPath", "/dev/null"])
        run(["git", "-C", str(source), "fetch", "--quiet", "origin",
             f"refs/pull/{number}/head", pr["base"]["sha"]])
        run(["git", "-C", str(source), "checkout", "--quiet", "--detach", pr["head"]["sha"]])
        diff_args = ["git", "-C", str(source), "diff", "--no-ext-diff", "--no-textconv"]
        revision = f"{pr['base']['sha']}...{pr['head']['sha']}"
        changed = run(diff_args + ["--name-only", "-z", revision]).stdout.strip("\0").split("\0")
        # Do not trust a PR-supplied context directory (including a symlink).
        context = source / ".review-context"
        if context.exists() or context.is_symlink():
            raise RuntimeError("Reserved .review-context path already exists")
        print("Running applicable checks in Docker.", flush=True)
        results = checks(source, changed, job / "checks.log")
        context.mkdir()
        shutil.copyfile(job / "checks.log", context / "checks.log")
        (context / "diff.patch").write_text(run(diff_args + [revision]).stdout)
        merge_base = run(["git", "-C", str(source), "merge-base", pr["base"]["sha"], pr["head"]["sha"]]).stdout.strip()
        for name in changed:
            if not name or PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts:
                continue
            old = run(["git", "-C", str(source), "show", f"{merge_base}:{name}"], check=False)
            if old.returncode == 0:
                target = context / "base" / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(old.stdout)
        issues = [i for i in all_items(f"repos/{REPO}/issues?state=open&per_page=100")
                  if "pull_request" not in i]
        # Also include explicitly referenced closed issues.
        references = set(re.findall(r"(?<![\w/])#(\d+)\b", pr.get("body") or ""))
        known = {i["number"] for i in issues}
        for reference in sorted(references)[:20]:
            if int(reference) not in known:
                item = api(f"repos/{REPO}/issues/{reference}")
                if "pull_request" not in item:
                    issues.append(item)
        for issue in issues:
            issue["discussion"] = all_items(f"repos/{REPO}/issues/{issue['number']}/comments?per_page=100")
        (context / "context.json").write_text(json.dumps({
            "pr": pr, "reviews": reviews, "checks": results, "changed_files": changed,
            "comments": all_items(f"repos/{REPO}/issues/{number}/comments?per_page=100"),
            "inline_comments": all_items(endpoint + "/comments?per_page=100"),
            "issues": issues,
        }, ensure_ascii=False, indent=2))
        config = json.loads((INSTALL / "opencode.json").read_text())
        config["agent"]["pr-reviewer"]["prompt"] = (INSTALL / "prompt.md").read_text()
        env = os.environ.copy()
        for key in ("GH_TOKEN", "GITHUB_TOKEN", "OPENCODE_CONFIG", "OPENCODE_CONFIG_DIR"):
            env.pop(key, None)
        env.update({"OPENCODE_DISABLE_PROJECT_CONFIG": "1",
                    "OPENCODE_DISABLE_EXTERNAL_SKILLS": "1",
                    "OPENCODE_CONFIG_CONTENT": json.dumps(config)})
        opencode = str(HOME / ".opencode/bin/opencode")
        print("Running local OpenCode review.", flush=True)
        output = run([opencode, "run", "--pure", "--dir", str(source),
                      "--agent", "pr-reviewer", "--model", config["model"], "--format", "json",
                      f"審查 PR #{number}，head {pr['head']['sha']}。從 .review-context/context.json 開始。"],
                     env=env, timeout=1800, check=False)
        (job / "opencode.jsonl").write_text(output.stdout)
        (job / "opencode.stderr.log").write_text(output.stderr)
        if output.returncode:
            raise RuntimeError(f"OpenCode failed (exit {output.returncode}); no review published")
        result = parse_result(output.stdout)
        (job / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
        if os.environ.get("REVIEW_DRY_RUN") == "1":
            print(f"Dry run complete: {result['decision']}; checks={results}; diagnostics={job}")
            return
        fresh = api(endpoint)
        if not same_revision(pr, fresh):
            print("Skipped publication: PR changed during review.")
            return
        if already_reviewed(all_items(endpoint + "/reviews?per_page=100"), fresh, login):
            print("Skipped publication: review already exists.")
            return
        event = publication_decision(result, all(results.values()), pr["user"]["login"], login)
        body = f"## 本機 OpenCode 自動審查\n\n{result['summary']}\n\n"
        for finding in result["findings"]:
            body += (f"### [{finding['priority']}] `{finding['path']}:{finding['line']}`\n\n"
                     f"{finding['body']}\n\n")
        body += "### 自動驗證\n" + ("\n".join(
            f"- {name}: {'通過' if ok else '失敗／逾時'}" for name, ok in results.items())
            or "- 無適用的預設測試；詳見上述靜態審查與驗證限制。")
        body += f"\n\n模型：`{config['model']}`；head：`{pr['head']['sha']}`。"
        if pr["user"]["login"] == login:
            body += ("\n\n以留言發布：作者是目前 reviewer 本人，GitHub 不允許自我 approve／request changes"
                     + ("；上列 P1/P2 問題需修正後才可合併。" if has_blocking(result) else "。"))
        elif event == "COMMENT":
            body += "\n\n以留言發布：無阻擋問題，但必要驗證未完成或檢查失敗，因此不自動 approve。"
        if os.environ.get("GITHUB_RUN_ID"):
            body += f"\n\n[Actions 執行紀錄](https://github.com/{REPO}/actions/runs/{os.environ['GITHUB_RUN_ID']})"
        # An incomplete run must remain retryable on the same SHA.
        if event != "COMMENT" or (all(results.values()) and result["verification_complete"]):
            body += "\n\n" + marker(pr)
        published = api(endpoint + "/reviews", {"commit_id": pr["head"]["sha"], "event": event, "body": body})
        (job / "published.json").write_text(json.dumps(published, ensure_ascii=False, indent=2))
        print(f"Published {event}: {published['html_url']}")
    finally:
        # Keep diagnostics/results but not source checkouts or dependency trees.
        shutil.rmtree(source, ignore_errors=True)


def main():
    def terminate(_signum, _frame):
        raise SystemExit("Review cancelled; no further publication")

    signal.signal(signal.SIGTERM, terminate)
    number = os.environ.get("REVIEW_PR", "")
    expected = os.environ.get("REVIEW_EXPECTED_SHA", "")
    if not re.fullmatch(r"[1-9][0-9]*", number):
        raise ValueError("REVIEW_PR must be a positive integer")
    if expected and not re.fullmatch(r"[0-9a-f]{40}", expected):
        raise ValueError("Invalid expected SHA")
    STATE.mkdir(parents=True, exist_ok=True)
    with (STATE / "review.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        review(int(number), expected)


if __name__ == "__main__":
    main()
