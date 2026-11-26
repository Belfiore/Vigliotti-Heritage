#!/usr/bin/env python3
"""Generate Google My Maps CSVs from data/places.json. Never edit the CSVs by hand."""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "places.json"
PEOPLE = ROOT / "data" / "people.json"
OUT = ROOT / "data" / "exports"


def load():
    places = json.loads(DATA.read_text(encoding="utf-8"))["places"]
    people = {p["id"]: p for p in json.loads(PEOPLE.read_text(encoding="utf-8"))["people"]}
    return places, people


def event_name(place, event, people):
    names = []
    for pid in event.get("personIds") or []:
        person = people.get(pid)
        names.append(person["displayName"] if person else pid)
    who = ", ".join(names) if names else "Family"
    what = event.get("summary") or event.get("type") or "event"
    year = (event.get("date") or event.get("dateStart") or "")[:4]
    # Pin title: "[Person]: [what the place is], [year]"
    what_short = event.get("type") or "event"
    title = f"{who}: {what_short} at {place['name']}"
    if year:
        title = f"{title}, {year}"
    return title


def rows_for(places, people):
    rows = []
    for place in places:
        if place.get("status") and place["status"] != "published":
            continue
        if place.get("lat") is None or place.get("lng") is None:
            continue
        events = place.get("events") or []
        if not events:
            continue
        for event in events:
            layer = event.get("type") or "other"
            desc_parts = [
                event.get("summary") or "",
                f"Place: {place['name']}",
                f"Precision: {place.get('precision') or 'unknown'}",
            ]
            if event.get("sourceIds"):
                desc_parts.append("Sources: " + ", ".join(event["sourceIds"]))
            if event.get("confidence"):
                desc_parts.append("Confidence: " + event["confidence"])
            rows.append({
                "name": event_name(place, event, people),
                "description": " ".join(p for p in desc_parts if p),
                "latitude": place["lat"],
                "longitude": place["lng"],
                "layer": layer,
            })
    return rows


def write_csv(path: Path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["name", "description", "latitude", "longitude", "layer"]
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for row in rows:
            w.writerow(row)


def main():
    places, people = load()
    rows = rows_for(places, people)
    OUT.mkdir(parents=True, exist_ok=True)
    write_csv(OUT / "places-master.csv", rows)
    layers = {}
    for row in rows:
        layers.setdefault(row["layer"], []).append(row)
    for layer, layer_rows in sorted(layers.items()):
        safe = layer.replace(" ", "-")
        write_csv(OUT / f"places-{safe}.csv", layer_rows)
    print(f"Wrote {len(rows)} rows from {len(places)} places to {OUT}")
    for layer, layer_rows in sorted(layers.items()):
        print(f"  {layer}: {len(layer_rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
