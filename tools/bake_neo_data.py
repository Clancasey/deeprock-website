#!/usr/bin/env python3
"""Bake JPL SBDB orbital elements + Asterank valuations into js/neo-data.js.

Selection: well-characterized NEAs (known diameter and/or spectral class),
plus a must-include list of famous targets. Capped for page performance.
"""
import json, re, sys, math

SCRATCH = sys.argv[1]
OUT = sys.argv[2]
CAP = 180

# Famous / mission-relevant targets that must be present (by primary designation)
MUST = {
    "433","1036","1620","1862","1866","2062","2101","3122","3200","3361",
    "3554","4179","4660","6489","25143","65803","99942","101955","162173",
    "163693","1943","1917","2100","4015","4769","5381","7482","1685","1566",
}

def load(path):
    with open(path) as f:
        return json.load(f)

sbdb = load(f"{SCRATCH}/sbdb_raw.json")
ast  = load(f"{SCRATCH}/asterank_neo.json")

fields = sbdb["fields"]
idx = {k: i for i, k in enumerate(fields)}

# --- Asterank join maps: by provisional designation and by number ---
ast_by_des, ast_by_num = {}, {}
for a in ast:
    entry = {"price": a.get("price"), "profit": a.get("profit")}
    pd = a.get("prov_des") or ""
    if pd:
        ast_by_des[pd.strip()] = entry
    fn = a.get("full_name") or ""
    m = re.match(r"\s*(\d+)\s", fn)
    if m:
        ast_by_num[m.group(1)] = entry

def f(row, key):
    v = row[idx[key]]
    if v is None or v == "":
        return None
    return v

def num(row, key):
    v = f(row, key)
    return float(v) if v is not None else None

cands = []
for row in sbdb["data"]:
    pdes = (f(row, "pdes") or "").strip()
    a_au = num(row, "a"); e = num(row, "e")
    if a_au is None or e is None or e >= 1.0:
        continue
    spec = f(row, "spec_B") or f(row, "spec_T")
    diam = num(row, "diameter")
    H = num(row, "H")
    # provisional designation for asterank join (strip name/number formatting)
    full = (f(row, "full_name") or "").strip()
    m = re.search(r"\(([^)]+)\)\s*$", full)
    prov = m.group(1) if m else pdes
    ar = ast_by_des.get(prov) or ast_by_num.get(pdes) or {}
    price = ar.get("price")
    profit = ar.get("profit")
    # sanity: Asterank uses huge sentinel values; keep plausible positive ones
    if price is not None and (price <= 0 or price > 1e19):
        price = None
    if profit is not None and (profit <= 0 or profit > 1e19):
        profit = None
    name = (f(row, "name") or "").strip()
    label = name if name else prov
    cands.append({
        "pdes": pdes,
        "name": label,
        "full": re.sub(r"\s+", " ", full),
        "H": H,
        "diam": diam,
        "albedo": num(row, "albedo"),
        "spec": spec,
        "pha": f(row, "pha") == "Y",
        "a": a_au, "e": e,
        "i": num(row, "i"), "om": num(row, "om"), "w": num(row, "w"),
        "ma": num(row, "ma"), "epoch": num(row, "epoch"),
        "per_y": num(row, "per_y"),
        "moid": num(row, "moid"),
        "price": price, "profit": profit,
    })

def score(c):
    s = 0.0
    if c["pdes"] in MUST: s += 1000
    if c["spec"]: s += 60
    if c["diam"] is not None: s += 40
    if c["price"] is not None: s += 25
    if c["pha"]: s += 15
    if c["name"]: s += 10
    if c["H"] is not None: s += max(0.0, 22 - c["H"])  # bigger is better
    return s

cands.sort(key=score, reverse=True)
keep = cands[:CAP]
# stable order: by semi-major axis for pleasing draw order
keep.sort(key=lambda c: c["a"])

def r(v, n):
    return None if v is None else round(v, n)

out_rows = []
for c in keep:
    out_rows.append([
        c["pdes"], c["name"], c["full"],
        r(c["H"], 2), r(c["diam"], 3), r(c["albedo"], 3), c["spec"],
        1 if c["pha"] else 0,
        r(c["a"], 9), r(c["e"], 9), r(c["i"], 5), r(c["om"], 5),
        r(c["w"], 5), r(c["ma"], 5), c["epoch"], r(c["per_y"], 6),
        r(c["moid"], 6),
        c["price"], c["profit"],
    ])

header = """/**
 * NEO dataset — baked from NASA/JPL Small-Body Database (orbital elements,
 * physical parameters) and Asterank (valuation estimates).
 * Generated: 2026-07-11. Elements epoch is per-row (JD, TDB).
 * Row: [pdes, name, full_name, H, diameter_km, albedo, spec, pha,
 *       a_AU, e, i_deg, om_deg, w_deg, ma_deg, epoch_jd, period_yr,
 *       moid_AU, price_usd, profit_usd]
 */
"""
with open(OUT, "w") as fo:
    fo.write(header)
    fo.write("export const NEO_FIELDS = ['pdes','name','full','H','diam','albedo','spec','pha','a','e','i','om','w','ma','epoch','per_y','moid','price','profit'];\n")
    fo.write("export const NEO_ROWS = [\n")
    for rw in out_rows:
        fo.write(json.dumps(rw) + ",\n")
    fo.write("];\n")

n_spec = sum(1 for c in keep if c["spec"])
n_diam = sum(1 for c in keep if c["diam"] is not None)
n_price = sum(1 for c in keep if c["price"] is not None)
n_pha = sum(1 for c in keep if c["pha"])
must_found = sorted(c["pdes"] for c in keep if c["pdes"] in MUST)
print(f"kept {len(keep)} / {len(cands)} candidates")
print(f"  spectral class: {n_spec}, diameter: {n_diam}, valuation: {n_price}, PHA: {n_pha}")
print(f"  must-include found: {len(must_found)}: {must_found}")
print(f"  a range: {keep[0]['a']:.3f} - {keep[-1]['a']:.3f} AU")
