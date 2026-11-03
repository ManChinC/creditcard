#!/usr/bin/env python3
"""單一檢查入口（AD-009）：本機與託管 CI 執行同一支腳本，檢查規則只有這一份。

用法：
    python scripts/check.py            本機：缺少的工具或尚無測試以 SKIP 顯示
    CHECK_STRICT=1 python scripts/check.py   CI：任何 SKIP 視同失敗

結束碼：0 = 全部 PASS（嚴格模式下無 SKIP）；1 = 有 FAIL，或嚴格模式下有 SKIP。
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STRICT = os.environ.get("CHECK_STRICT") == "1"

# AD-009、AD-010 決定的版本；本機偏離時只警告，不失敗。
EXPECTED_PYTHON = (3, 14)
EXPECTED_NODE_MAJOR = 26

results = []


def record(name, status, detail=""):
    results.append((name, status, detail))
    print(f"[{status}] {name}" + (f" - {detail}" if detail else ""), flush=True)


def find_tool(name):
    """先找目前 Python 環境的 Scripts／bin，再找 PATH。"""
    exe = name + (".exe" if os.name == "nt" else "")
    local = Path(sys.executable).parent / exe
    if local.exists():
        return str(local)
    return shutil.which(name)


def run(name, cmd, skip_reason=None):
    if skip_reason:
        record(name, "SKIP", skip_reason)
        return
    print(f"--- {name}: {' '.join(str(c) for c in cmd)}", flush=True)
    proc = subprocess.run(cmd, cwd=ROOT)
    record(name, "PASS" if proc.returncode == 0 else "FAIL", "" if proc.returncode == 0 else f"exit {proc.returncode}")


def has_files(directory, pattern):
    d = ROOT / directory
    return d.exists() and any(d.rglob(pattern))


def check_environment():
    py = sys.version_info[:2]
    if py != EXPECTED_PYTHON:
        record("env:python", "WARN", f"目前 {py[0]}.{py[1]}，決定為 {EXPECTED_PYTHON[0]}.{EXPECTED_PYTHON[1]}（AD-010）")
    else:
        record("env:python", "PASS", f"{py[0]}.{py[1]}")
    node = shutil.which("node")
    if not node:
        record("env:node", "WARN", "找不到 node，JavaScript 測試無法執行")
        return
    out = subprocess.run([node, "--version"], capture_output=True, text=True).stdout.strip()
    major = int(out.lstrip("v").split(".")[0]) if out else 0
    if major != EXPECTED_NODE_MAJOR:
        record("env:node", "WARN", f"目前 {out}，決定為 {EXPECTED_NODE_MAJOR}（AD-010）")
    else:
        record("env:node", "PASS", out)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    check_environment()

    # 測試（Constitution XI）。一致性測試由兩邊各自的載入器執行（T013、T014），不另設步驟。
    run("python-tests", [sys.executable, "-m", "pytest", "-q", "admin/tests"],
        None if has_files("admin/tests", "test_*.py") else "尚無 Python 測試")
    node = shutil.which("node")
    if not has_files("web/tests", "*.test.js"):
        record("js-tests", "SKIP", "尚無 JavaScript 測試")
    elif not node:
        record("js-tests", "FAIL", "找不到 node")
    else:
        run("js-tests", [node, "--test", "web/tests"])

    # 掃描（AD-009）
    gitleaks = find_tool("gitleaks")
    run("secrets-scan(gitleaks)", [gitleaks, "detect", "--source", str(ROOT), "--redact", "--no-banner"],
        None if gitleaks else "gitleaks 未安裝")
    run("dependency-scan(pip-audit)", [sys.executable, "-m", "pip_audit", "-r", "requirements-dev.txt"])
    npm = shutil.which("npm")
    run("dependency-scan(npm audit)", [npm or "npm", "audit", "--audit-level=high"],
        None if (ROOT / "package.json").exists() and npm else "尚無 package.json 或找不到 npm")
    # Semgrep runs from its own virtual environment (scripts/requirements-semgrep.txt).
    semgrep_exe = ROOT / ".venv-semgrep" / ("Scripts" if os.name == "nt" else "bin") / ("semgrep.exe" if os.name == "nt" else "semgrep")
    semgrep = str(semgrep_exe) if semgrep_exe.exists() else shutil.which("semgrep")
    semgrep_rules = ROOT / "scripts" / "semgrep.yml"
    run("sast(semgrep)", [semgrep, "scan", "--config", str(semgrep_rules), "--error", "--metrics=off"],
        None if (semgrep and semgrep_rules.exists()) else "Semgrep 規則集尚未決定（scripts/semgrep.yml 不存在）")

    print("\n=== 摘要 ===")
    for name, status, detail in results:
        print(f"{status:5} {name}" + (f"  {detail}" if detail else ""))
    failed = [r for r in results if r[1] == "FAIL"]
    skipped = [r for r in results if r[1] == "SKIP"]
    if failed:
        print(f"\n結果：失敗（{len(failed)} 項 FAIL）")
        return 1
    if STRICT and skipped:
        print(f"\n結果：失敗（嚴格模式，{len(skipped)} 項 SKIP 視同失敗）")
        return 1
    print("\n結果：通過" + (f"（{len(skipped)} 項 SKIP，嚴格模式下會失敗）" if skipped else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
