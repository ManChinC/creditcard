"""Runs every conformance case (conformance/*.json) against the local executor (T014).

The browser executor runs the same files in web/tests/conformance.test.js.
"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "admin" / "src"))

from validator.executor import evaluate  # noqa: E402

DIR = ROOT / "conformance"
FILES = sorted(DIR.glob("*.json"))


def _load():
    items = []
    for file in FILES:
        suite = json.loads(file.read_text(encoding="utf-8"))
        rules = json.loads((ROOT / suite["rules"]).read_text(encoding="utf-8"))
        for case in suite["cases"]:
            items.append(pytest.param(rules, case, id=f"{file.name}:{case['id']}"))
    return items


def test_conformance_directory_has_case_files():
    assert FILES


@pytest.mark.parametrize("rules,case", _load())
def test_case(rules, case):
    assert evaluate(rules, case["ruleSet"], case["input"], case.get("settings")) == case["expect"]
