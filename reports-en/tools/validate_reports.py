"""Validate the English report collection using saved files only; no RPC or env.

Run from any directory: python3 reports-en/tools/validate_reports.py [--write]
--write refreshes manifest hashes and the validation record after editorial review.
"""
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
COLLECTION = ROOT / "reports-en"
HEX = re.compile(r"0x[0-9a-fA-F]+")
LONG_HASH = re.compile(r"(?<![A-Za-z0-9])[0-9a-fA-F]{64}(?![A-Za-z0-9])")
DECIMAL = re.compile(r"(?<![A-Za-z0-9_.])\d+\.\d+(?![A-Za-z0-9_]|\.\d)")
LINK = re.compile(r"(?<!!)\[[^\]\n]+\]\(([^)\n]+)\)")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def table_rows(text):
    return sum(line.lstrip().startswith("|") for line in text.splitlines())


def main():
    manifest_path = COLLECTION / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    write = sys.argv[1:] == ["--write"]
    if sys.argv[1:] and not write:
        raise SystemExit("Usage: validate_reports.py [--write]")
    issues, checks = [], []
    link_count = 0
    for item in manifest["reports"]:
        source, english = ROOT / item["source"], ROOT / item["english"]
        if not source.is_file() or not english.is_file():
            issues.append({"path": item["english"], "reason": "MISSING_REPORT_OR_SOURCE"})
            continue
        a, b = source.read_text(), english.read_text()
        results = {
            "hexOccurrencesIdentical": Counter(HEX.findall(a)) == Counter(HEX.findall(b)),
            "longHashOccurrencesIdentical": Counter(LONG_HASH.findall(a)) == Counter(LONG_HASH.findall(b)),
            "decimalOccurrencesIdentical": Counter(DECIMAL.findall(a)) == Counter(DECIMAL.findall(b)),
            "tableRowCountIdentical": table_rows(a) == table_rows(b),
            "fencedBlockCountIdentical": len(re.findall(r"^```", a, re.M)) == len(re.findall(r"^```", b, re.M)),
        }
        # These checks verify invariants, not translation quality. Full semantic
        # and historical-status review is performed separately by reviewers.
        for name, value in results.items():
            if not value:
                issues.append({"path": item["english"], "reason": name})
        for destination in LINK.findall(b):
            parts = urlsplit(destination)
            if parts.scheme or not parts.path:
                continue
            link_count += 1
            target = (english.parent / unquote(parts.path)).resolve()
            if not target.is_relative_to(ROOT) or not target.exists():
                issues.append({"path": item["english"], "reason": "BROKEN_OR_NONPORTABLE_LINK", "target": destination})
        source_hash, english_hash = sha(source), sha(english)
        if write:
            item["sourceSha256"], item["englishSha256"] = source_hash, english_hash
        else:
            if item.get("sourceSha256") != source_hash or item.get("englishSha256") != english_hash:
                issues.append({"path": item["english"], "reason": "MANIFEST_HASH_MISMATCH"})
        checks.append({"english": item["english"], **results})
    catalogue = COLLECTION / "README.md"
    for destination in LINK.findall(catalogue.read_text()):
        parts = urlsplit(destination)
        if parts.scheme or not parts.path:
            continue
        link_count += 1
        target = (catalogue.parent / unquote(parts.path)).resolve()
        if not target.is_relative_to(ROOT) or not target.exists():
            issues.append({"path": "reports-en/README.md", "reason": "BROKEN_OR_NONPORTABLE_LINK", "target": destination})
    for item in manifest.get("wordEditions", []):
        target = ROOT / item["path"]
        if not target.is_file():
            issues.append({"path": item["path"], "reason": "MISSING_WORD_EDITION"})
        elif write:
            item["sha256"] = sha(target)
        elif item.get("sha256") != sha(target):
            issues.append({"path": item["path"], "reason": "WORD_HASH_MISMATCH"})
    if len(manifest.get("wordEditions", [])) != 2:
        issues.append({"reason": "EXPECTED_TWO_WORD_EDITIONS"})
    qa_path = COLLECTION / "docx-validation.json"
    if qa_path.is_file():
        qa = json.loads(qa_path.read_text())
        if qa.get("status") != "PASS" or sha(ROOT / qa["generator"]) != qa["generatorSha256"]:
            issues.append({"reason": "WORD_QA_OR_GENERATOR_CHANGED"})
        for document in qa.get("documents", []):
            if (sha(ROOT / document["source"]) != document["sourceSha256"]
                    or sha(ROOT / document["output"]) != document["outputSha256"]
                    or document.get("allFinalPageImagesVisuallyInspected") is not True
                    or not all(document.get("checks", {}).values())):
                issues.append({"path": document["output"], "reason": "WORD_QA_STALE_OR_INCOMPLETE"})
    else:
        issues.append({"reason": "MISSING_WORD_VISUAL_QA_RECORD"})
    snapshots = json.loads((COLLECTION / "sources/legacy/INDEX.json").read_text())["records"]
    for item in snapshots:
        if sha(ROOT / item["snapshotPath"]) != item["sha256"]:
            issues.append({"path": item["snapshotPath"], "reason": "LEGACY_SNAPSHOT_CHANGED"})
    result = {
        "status": "PASS" if not issues and len(checks) == 33 else "FAIL",
        "markdownEditions": len(checks), "wordEditions": len(manifest.get("wordEditions", [])),
        "localLinksChecked": link_count,
        "legacySnapshotsChecked": len(snapshots), "rpcCalls": 0,
        "privateKeysRead": False, "chainTransactionsSent": 0,
        "scope": "Saved document consistency only; not new chain verification or an external security audit",
        "checks": checks, "issues": issues,
    }
    if write:
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        (COLLECTION / "validation.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "checks"}, indent=2))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
