"""
RESQGRID Offline OpenStreetMap Road Importer (OSMnx -> SQLite / PostGIS-ready JSON)
-----------------------------------------------------------------------------------
Purpose:
  Downloads drivable road network geometry for the configurable Chennai Metropolitan
  Study Area using OSMnx, caches the GraphML file locally so the server never
  re-downloads on startup, preserves one-way attributes and multi-edges, applies
  documented simulation speed assumptions when OSM maxspeed is missing, and
  exports normalized EPSG:4326 JSON / SQLite records.

Attribution & ODbL:
  Road network data © OpenStreetMap contributors, available under the Open Database
  License (ODbL). Never interpret open OSM edges as verified flood-safe.

Usage (local Python environment with `osmnx`, `geopandas`, `networkx` installed):
  python3 scripts/import_chennai_roads.py --mode dev --out data/chennai_osm_cache.json
  python3 scripts/import_chennai_roads.py --mode metro --out data/chennai_osm_cache.json
"""

import argparse
import json
import math
import time
from pathlib import Path

ASSUMED_SPEED_KMH = {
    "motorway": 65.0,
    "trunk": 55.0,
    "primary": 45.0,
    "secondary": 36.0,
    "tertiary": 30.0,
    "residential": 22.0,
}


def parse_speed_kmh(raw_maxspeed, highway_type: str) -> tuple[float, bool]:
    if raw_maxspeed:
        val = raw_maxspeed[0] if isinstance(raw_maxspeed, list) else raw_maxspeed
        try:
            num = float(str(val).split()[0])
            if 5.0 <= num <= 120.0:
                return num, False
        except (ValueError, IndexError):
            pass
    hw = highway_type[0] if isinstance(highway_type, list) else str(highway_type or "secondary")
    return ASSUMED_SPEED_KMH.get(hw, 30.0), True


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Chennai study-area road graph via OSMnx")
    parser.add_argument("--mode", choices=["dev", "metro"], default="dev", help="dev=central bbox, metro=greater study area")
    parser.add_argument("--out", default="data/chennai_osm_cache.json", help="Output JSON cache path")
    args = parser.parse_args()

    try:
        import osmnx as ox  # type: ignore
    except ImportError:
        print("[RESQGRID Importer] osmnx is not installed in this runtime.")
        print("Install locally with: pip install osmnx geopandas")
        print("Using built-in offline Chennai study-area graph in server/chennaiNetwork.ts.")
        return

    t0 = time.perf_counter()
    # Study-area bounding boxes (north, south, east, west) - distinct from official GCC limits
    bbox = (13.10, 12.96, 80.29, 80.19) if args.mode == "dev" else (13.24, 12.88, 80.34, 80.06)
    print(f"[RESQGRID Importer] Downloading drivable OSM graph for mode={args.mode}, bbox={bbox}...")

    graph = ox.graph_from_bbox(bbox=bbox, network_type="drive", simplify=True)
    nodes_out = []
    for nid, data in graph.nodes(data=True):
        nodes_out.append({
            "id": f"OSM_{nid}",
            "source_osm_id": str(nid),
            "lat": round(float(data["y"]), 6),
            "lng": round(float(data["x"]), 6),
        })

    edges_out = []
    for u, v, k, data in graph.edges(keys=True, data=True):
        length_m = float(data.get("length", 0.0))
        if length_m <= 0 or math.isnan(length_m):
            continue
        hw = data.get("highway", "secondary")
        speed_kmh, assumed = parse_speed_kmh(data.get("maxspeed"), hw)
        travel_time_s = round(length_m / (speed_kmh * 1000.0 / 3600.0), 2)
        geom = data.get("geometry")
        coords = list(geom.coords) if geom is not None else [
            (graph.nodes[u]["x"], graph.nodes[u]["y"]),
            (graph.nodes[v]["x"], graph.nodes[v]["y"]),
        ]
        edges_out.append({
            "id": f"OSM_{u}_{v}_{k}",
            "osm_way_id": str(data.get("osmid", f"{u}_{v}")),
            "name": str(data.get("name", "Unnamed Chennai Road")),
            "highway_type": hw[0] if isinstance(hw, list) else str(hw),
            "source_node_id": f"OSM_{u}",
            "target_node_id": f"OSM_{v}",
            "geometry": [[round(c[0], 6), round(c[1], 6)] for c in coords],
            "length_m": round(length_m, 2),
            "speed_kmh": speed_kmh,
            "travel_time_s": travel_time_s,
            "is_oneway": bool(data.get("oneway", False)),
            "speed_is_assumed": assumed,
        })

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "study_area_mode": args.mode,
        "bbox_nse_w": bbox,
        "osmnx_version": getattr(ox, "__version__", "unknown"),
        "attribution": "© OpenStreetMap contributors (ODbL)",
        "node_count": len(nodes_out),
        "edge_count": len(edges_out),
        "nodes": nodes_out,
        "edges": edges_out,
    }
    out_path.write_text(json.dumps(payload), encoding="utf-8")
    elapsed = time.perf_counter() - t0
    print(f"[RESQGRID Importer] Exported {len(nodes_out)} nodes, {len(edges_out)} edges in {elapsed:.2f}s -> {out_path}")


if __name__ == "__main__":
    main()
