#!/usr/bin/env python3
"""Feature parity check for EchoPrism."""

import csv
import sys

WEIGHT = {"must": 3, "should": 2, "could": 1, "p0": 3, "p1": 2, "p2": 1}
CREDIT = {"yes": 1.0, "done": 1.0, "partial": 0.5, "no": 0.0, "": 0.0, "todo": 0.0}
PRIORITY_NAME = {3: "must", 2: "should", 1: "could"}

def load(path):
    with open(path, newline="", encoding="utf-8-sig") as fh:
        lines = [line for line in fh if not line.lstrip().startswith("#")]
        # Use csv.reader with proper quoting to handle commas in notes
        reader = csv.reader(lines)
        header = next(reader)
        fieldnames = [f.strip().lower() for f in header]
        for need in ("feature", "priority", "clone"):
            if need not in fieldnames:
                raise ValueError(f"{path} has no '{need}' column")
        rows = []
        for i, raw in enumerate(reader, start=2):
            # Handle rows with extra columns by joining extra columns into notes
            if len(raw) > len(fieldnames):
                # Join extra columns into notes
                _extra = len(raw) - len(fieldnames) + 1
                raw = raw[:len(fieldnames)-1] + [",".join(raw[len(fieldnames)-1:])]
            elif len(raw) < len(fieldnames):
                # Pad missing columns
                raw = raw + [""] * (len(fieldnames) - len(raw))
            row = {}
            for k, v in zip(fieldnames, raw, strict=True):
                row[k.strip().lower()] = (v or "").strip()
            if not row.get("feature"):
                continue
            row["line"] = i
            rows.append(row)
        return rows


def score(rows):
    counted = []
    skipped = []
    extras = []
    problems = []
    for row in rows:
        original = row.get("original", "yes").lower() or "yes"
        clone = row.get("clone", "").lower()
        prio = row.get("priority", "").lower()
        if original in ("no", "n", "false"):
            extras.append(row)
            continue
        if clone == "skip":
            skipped.append(row)
            continue
        weight = WEIGHT.get(prio, 0)
        credit = CREDIT.get(clone, 0.0)
        if weight == 0:
            problems.append((row["line"], row["feature"], "unknown priority"))
            continue
        max_pts = weight
        earned = weight * credit
        counted.append((row["feature"], row.get("area", ""), prio, original, clone, max_pts, earned))
    return counted, skipped, extras, problems


def main():
    path = "/Users/bra0002h/ClaudeWorkspace/echoprism/features.csv"
    rows = load(path)
    counted, skipped, extras, problems = score(rows)

    total_max = sum(c[5] for c in counted)
    total_earned = sum(c[6] for c in counted)
    score_pct = (total_earned / total_max * 100) if total_max else 0

    must_total = sum(1 for c in counted if c[2] == "must")
    must_done = sum(1 for c in counted if c[2] == "must" and c[6] > 0)

    print(f"Feature Parity Score: {score_pct:.1f}% ({total_earned:.1f}/{total_max} pts)")
    print(f"Must-haves: {must_done} / {must_total} done")
    print()

    # Missing list
    missing = [c for c in counted if c[6] < c[5]]
    missing.sort(key=lambda x: (-x[5], x[0]))
    print("Missing (build order):")
    for feat, area, prio, orig, clone, _max_pts, earned in missing:
        status = "partial" if earned > 0 else "missing"
        print(f"  [{status}] {feat} ({area}) - {prio} - {orig} -> {clone}")

    print()
    print(f"Skipped: {len(skipped)}")
    print(f"Extras: {len(extras)}")
    print(f"Problems: {len(problems)}")

    # Must-haves status
    must_done_count = sum(1 for c in counted if c[2] == "must" and c[6] > 0)
    must_total_count = sum(1 for c in counted if c[2] == "must")
    print()
    print(f"Must-haves done: {must_done_count} / {must_total_count}")

    if must_done_count < must_total_count:
        print("NOT SHIPPABLE: Missing must-haves")
        sys.exit(1)
    elif score_pct >= 80:
        print("SHIPPABLE")
    else:
        print("SHIPPABLE (but below 80% target)")


if __name__ == "__main__":
    main()