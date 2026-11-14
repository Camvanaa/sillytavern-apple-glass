#!/usr/bin/env python3
"""Audit legacy suite facts as well as exits. Write a machine verdict; never equate exit 0 with pass."""
import json
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
failures = []
records = {}


def require(ok, path, value=None):
    if not ok:
        failures.append({"path": path, "actual": value})


def walk(value, path):
    if isinstance(value, dict):
        for k, v in value.items():
            p = f"{path}.{k}"
            if k == "ERROR" or (k == "timeout" and v is True):
                require(False, p, v)
            if k in ("ok", "backOk", "wrapOk") and v is False:
                require(False, p, v)
            if k in ("windowAdopted", "onlyCurrent", "inspectorHidden"):
                require(v is True, p, v)
            if k == "panelInWin" and (v is not None or path.endswith(".ag2Again")):
                # Shell-only look/about pages have no external ST panel to measure.
                require(v is True, p, v)
            if k in ("ovf", "dbl", "unhid", "nest", "btn") and isinstance(v, (int, float)):
                require(v == 0, p, v)
            walk(v, p)
    elif isinstance(value, list):
        for i, v in enumerate(value):
            walk(v, f"{path}[{i}]")
    elif isinstance(value, str) and re.match(r"^(FAIL|ERR\b)", value):
        require(False, path, value)


for file in sorted(root.glob("*.json")):
    if file.name == "verdict.json":
        continue
    try:
        record = json.loads(file.read_text())
    except Exception as error:
        require(False, file.name, str(error))
        continue
    records[file.stem] = record
    walk(record, file.stem)
    err = file.with_suffix(".err")
    if err.exists():
        require("FIXTURE-CHANGED" not in err.read_text(), file.stem + ".fixture")
    if file.stem.startswith("r2a-"):
        require(all(v == 0 for v in record.get("totals", {"missing": 1}).values()), file.stem + ".totals", record.get("totals"))
    if file.stem.startswith("r1-"):
        require(record.get("verdict") == "PASS", file.stem + ".verdict", record.get("verdict"))
        for key in ("out", "native", "blur", "overlap"):
            require(record.get("total", {}).get(key) == 0, file.stem + ".total." + key, record.get("total", {}).get(key))

for log in root.glob("*.log"):
    for name, code in re.findall(r"^(.+) exit (\d+)$", log.read_text(), re.M):
        require(code == "0", name + ".exit", int(code))

if "p4-keys" in records and records["p4-keys"].get("ok") is not False:
    d = records["p4-keys"]
    checks = {
        "stUntouched": all(d["stUntouched"].values()),
        "toggleClose": d["toggleClose"],
        "mdCtrlK": not d["mdCtrlK"]["pal"] and d["mdCtrlK"]["ta"] == "`abc`",
        "ctrlShiftK": d["ctrlShiftK"]["open"] and d["afterClose"]["active"] == "send_textarea",
        "ime": not any(d["ime"].values()) and d["imeControl"] and d["imeEnter"]["stillOpen"],
        "sidebar": not d["sideOff"]["side"] and d["sideOn"]["side"],
        "inspector": d["inspOn"]["insp"] and not d["inspOff"]["insp"],
        # Ny can add mock requests; at least one regeneration request must have happened.
        "regenerate": d["stCtrlEnter"]["calls"] >= 1,
    }
    for k, v in checks.items():
        require(v, "p4-keys." + k, v)

if "p4-esc" in records and records["p4-esc"].get("ok") is not False:
    d = records["p4-esc"]
    require([(s["pal"], s["set"], s["insp"]) for s in d["seq"]] ==
            [(True, True, True), (False, True, True), (False, False, True), (False, False, False)], "p4-esc.seq", d["seq"])
    require(d["menu"]["before"]["menu"] and not d["menu"]["after"]["menu"] and d["menu"]["after"]["insp"], "p4-esc.menu", d["menu"])
    require(d["field"]["field"] and d["field"]["afterFirst"]["insp"] and not d["field"]["afterSecond"]["insp"], "p4-esc.field", d["field"])
    require(d["stEsc"]["anOpen"] and not d["stEsc"]["anAfterEsc"], "p4-esc.stEsc", d["stEsc"])

if "p5-edge" in records and records["p5-edge"].get("ok") is not False:
    d = records["p5-edge"]
    for width in ("1000", "1001"):
        for state, v in d[width].items():
            if state == "errors":
                continue
            require(v["phone"] == (width == "1000") and v["doc"] and v["scrollX"] == 0, "p5-edge." + width + "." + state, v)
    for label, v in d["resize"]:
        require(v["phone"] == (v["w"] <= 1000) and v["doc"] and v["scrollX"] == 0, "p5-edge.resize." + label, v)

if "p5-pages" in records and records["p5-pages"].get("ok") is not False:
    d = records["p5-pages"]
    checks = {
        "tabs": d["chars"]["seg"] == "chars" and d["groups"]["seg"] == "groups",
        "group": d["groupChat"]["ph"] == "chat" and d["groupInsp"]["inspView"] == "group",
        "chat": d["charChat"]["ph"] == "chat" and d["chatInfo"]["inspView"] == "chat",
        "authorNote": d["an"]["vis"] and d["an"]["sw"] <= d["an"]["cw"],
        "keyboardSimulation": d["kb"]["sheldH"] == 500 and d["kb"]["composerBottom"] == 500,
        "keyboardRestore": not d["kbAfter"]["kb"] and d["kbAfter"]["vvh"] == "844px",
        "close": d["closed"]["ph"] == "list" and d["closed"]["welcome"],
        "worldInfo": d["wi"]["setOpen"] and d["wi"]["setPage"] == "wi",
    }
    for k, v in checks.items():
        require(v, "p5-pages." + k, v)

require(bool(records), str(root), "no result files" if not records else None)
out = {"ok": not failures, "files": len(records), "failures": failures}
(root / "verdict.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))
print(json.dumps(out, ensure_ascii=False, indent=2))
sys.exit(0 if out["ok"] else 1)
