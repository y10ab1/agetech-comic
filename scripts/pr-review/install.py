#!/usr/bin/env python3
"""Install/update the trusted controller and register a repo-scoped local runner."""

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request

HERE = Path(__file__).resolve().parent
HOME = Path.home()
DEST = HOME / ".local/share/agetech-pr-review"
RUNNER = DEST / "runner"
REPO = "y10ab1/agetech-comic"
VERSION = "2.337.0"
SHA256 = "70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613"


def main():
    for command in ["gh", "git", "docker"]:
        if not shutil.which(command):
            raise RuntimeError(f"Missing command: {command}")
    if not (HOME / ".opencode/bin/opencode").is_file():
        raise RuntimeError("Install local OpenCode first")
    subprocess.run(["gh", "api", "user", "--jq", ".login"], check=True)
    RUNNER.mkdir(parents=True, exist_ok=True)
    for name in ["review.py", "opencode.json", "prompt.md"]:
        shutil.copyfile(HERE / name, DEST / name)
    if not (RUNNER / "config.sh").exists():
        url = f"https://github.com/actions/runner/releases/download/v{VERSION}/actions-runner-linux-x64-{VERSION}.tar.gz"
        with tempfile.TemporaryDirectory(prefix="agetech-runner-") as temp:
            archive = Path(temp) / "runner.tar.gz"
            urllib.request.urlretrieve(url, archive)
            if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
                raise RuntimeError("Runner archive checksum mismatch")
            with tarfile.open(archive) as package:
                package.extractall(RUNNER, filter="data")
    if not (RUNNER / ".runner").exists():
        # Never print or persist the short-lived registration token.
        response = subprocess.check_output([
            "gh", "api", "--method", "POST", f"repos/{REPO}/actions/runners/registration-token"], text=True)
        token = json.loads(response)["token"]
        subprocess.run([str(RUNNER / "config.sh"), "--unattended",
                        "--url", f"https://github.com/{REPO}", "--token", token,
                        "--name", "agetech-local-opencode", "--labels", "agetech-opencode-review",
                        "--work", "_work"], cwd=RUNNER, check=True)
    # Keep the same user's model and gh credentials, with a stable executable PATH.
    path = ":".join(dict.fromkeys([
        str(HOME / ".opencode/bin"), str(Path(shutil.which("node") or "/usr/bin/node").parent),
        str(HOME / ".local/bin"), "/usr/local/bin", "/usr/bin", "/bin",
    ]))
    units = HOME / ".config/systemd/user"
    units.mkdir(parents=True, exist_ok=True)
    unit = units / "agetech-opencode-runner.service"
    unit.write_text(f"""[Unit]
Description=AgeTech GitHub Actions runner for local OpenCode PR reviews
After=network-online.target

[Service]
Type=simple
WorkingDirectory={RUNNER}
ExecStart={RUNNER}/run.sh
Environment=PATH={path}
Environment=HOME={HOME}
Environment=NEXT_TELEMETRY_DISABLED=1
Restart=always
RestartSec=10
TimeoutStopSec=120
KillMode=control-group
UMask=0077

[Install]
WantedBy=default.target
""")
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "--user", "enable", "--now", unit.name], check=True)
    print("Installed. Inspect: systemctl --user status agetech-opencode-runner")


if __name__ == "__main__":
    main()
