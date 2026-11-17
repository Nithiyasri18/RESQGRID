import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type {
  FacilityDto,
  Incident,
  RescueTeam,
  RoadEdgeDto,
  RoadNodeDto,
} from '../../types/resqgrid';

export interface RouteOverlay {
  id: string;
  label: string;
  color: string;
  dashArray?: string;
  weight?: number;
  coordinates: Array<[number, number]>; // [lng, lat]
}

interface ChennaiMapProps {
  heightClass?: string;
  center?: [number, number]; // [lat, lng]
  zoom?: number;
  focusPoint?: { lat: number; lng: number; zoom?: number; nonce?: number } | null;
  nodes?: RoadNodeDto[];
  edges?: RoadEdgeDto[];
  incidents?: Incident[];
  teams?: RescueTeam[];
  facilities?: FacilityDto[];
  studyAreaPolygon?: Array<[number, number]>; // [lng, lat]
  gccCorePolygon?: Array<[number, number]>;
  routes?: RouteOverlay[];
  visitedNodeIds?: string[];
  activeStepNodeId?: string | null;
  selectedEdgeId?: string | null;
  showLayers?: {
    roads?: boolean;
    roadStatus?: boolean;
    incidents?: boolean;
    teams?: boolean;
    facilities?: boolean;
    studyBoundary?: boolean;
    gccBoundary?: boolean;
  };
  interactivePickMode?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  onEdgeClick?: (edge: RoadEdgeDto) => void;
  onIncidentClick?: (incident: Incident) => void;
  onNodeClick?: (node: RoadNodeDto) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#38bdf8',
  low: '#94a3b8',
};

const TEAM_COLORS: Record<string, string> = {
  available: '#10b981',
  assigned: '#38bdf8',
  en_route: '#14b8a6',
  on_scene: '#22c55e',
  offline: '#64748b',
};

export function ChennaiMap({
  heightClass = 'h-[540px]',
  center = [13.045, 80.225],
  zoom = 11,
  focusPoint,
  nodes = [],
  edges = [],
  incidents = [],
  teams = [],
  facilities = [],
  studyAreaPolygon,
  gccCorePolygon,
  routes = [],
  visitedNodeIds = [],
  activeStepNodeId = null,
  selectedEdgeId = null,
  showLayers = {
    roads: true,
    roadStatus: true,
    incidents: true,
    teams: true,
    facilities: false,
    studyBoundary: true,
    gccBoundary: false,
  },
  interactivePickMode = false,
  onMapClick,
  onEdgeClick,
  onIncidentClick,
  onNodeClick,
}: ChennaiMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{
    boundaries: L.LayerGroup;
    roads: L.LayerGroup;
    visited: L.LayerGroup;
    routes: L.LayerGroup;
    facilities: L.LayerGroup;
    teams: L.LayerGroup;
    incidents: L.LayerGroup;
  } | null>(null);

  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: true,
      preferCanvas: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors (ODbL) | Simulated Hazards',
    }).addTo(map);

    const boundaries = L.layerGroup().addTo(map);
    const roads = L.layerGroup().addTo(map);
    const visited = L.layerGroup().addTo(map);
    const routesGroup = L.layerGroup().addTo(map);
    const facilitiesGroup = L.layerGroup().addTo(map);
    const teamsGroup = L.layerGroup().addTo(map);
    const incidentsGroup = L.layerGroup().addTo(map);

    layersRef.current = {
      boundaries,
      roads,
      visited,
      routes: routesGroup,
      facilities: facilitiesGroup,
      teams: teamsGroup,
      incidents: incidentsGroup,
    };

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current?.(
        Math.round(e.latlng.lat * 100000) / 100000,
        Math.round(e.latlng.lng * 100000) / 100000
      );
    });

    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cursor style for pick mode
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.cursor = interactivePickMode ? 'crosshair' : '';
  }, [interactivePickMode]);

  // Programmatic flyTo
  useEffect(() => {
    if (!focusPoint || !mapRef.current) return;
    mapRef.current.flyTo([focusPoint.lat, focusPoint.lng], focusPoint.zoom ?? 14, {
      duration: 0.6,
    });
  }, [focusPoint]);

  // Boundaries Layer
  useEffect(() => {
    const grp = layersRef.current?.boundaries;
    if (!grp) return;
    grp.clearLayers();

    if (showLayers.studyBoundary && studyAreaPolygon && studyAreaPolygon.length > 2) {
      L.polygon(
        studyAreaPolygon.map(([lng, lat]) => [lat, lng] as [number, number]),
        {
          color: '#14b8a6',
          weight: 1.5,
          dashArray: '6 6',
          fillColor: '#14b8a6',
          fillOpacity: 0.03,
          interactive: false,
        }
      ).addTo(grp);
    }

    if (showLayers.gccBoundary && gccCorePolygon && gccCorePolygon.length > 2) {
      L.polygon(
        gccCorePolygon.map(([lng, lat]) => [lat, lng] as [number, number]),
        {
          color: '#64748b',
          weight: 1.2,
          dashArray: '3 5',
          fillOpacity: 0,
          interactive: false,
        }
      ).addTo(grp);
    }
  }, [showLayers.studyBoundary, showLayers.gccBoundary, studyAreaPolygon, gccCorePolygon]);

  // Roads & Nodes Layer
  useEffect(() => {
    const grp = layersRef.current?.roads;
    if (!grp) return;
    grp.clearLayers();

    if (showLayers.roads !== false) {
      for (const edge of edges) {
        let coords: Array<[number, number]> = [];
        try {
          coords = (JSON.parse(edge.geometry_json) as Array<[number, number]>).map(([lng, lat]) => [
            lat,
            lng,
          ]);
        } catch {
          continue;
        }
        if (coords.length < 2) continue;

        const isSelected = selectedEdgeId === edge.id;
        let color = '#334155';
        let weight = edge.highway_type === 'trunk' ? 3 : 2;
        let dashArray: string | undefined;
        let opacity = 0.7;

        if (showLayers.roadStatus !== false) {
          if (edge.closure_status === 'blocked') {
            color = '#ef4444';
            weight = 4;
            opacity = 0.95;
          } else if (edge.closure_status === 'restricted') {
            color = '#f59e0b';
            weight = 3.5;
            dashArray = '6 5';
            opacity = 0.92;
          } else {
            color = edge.highway_type === 'trunk' ? '#38bdf8' : '#475569';
            opacity = edge.highway_type === 'trunk' ? 0.55 : 0.45;
          }
        }

        if (isSelected) {
          color = '#2dd4bf';
          weight = 5;
          opacity = 1;
        }

        const line = L.polyline(coords, { color, weight, dashArray, opacity });
        line.bindTooltip(
          `<div style="font-size:11px;line-height:1.4">
            <strong>${edge.name}</strong><br/>
            Status: ${edge.closure_status.toUpperCase()} · ${Math.round(edge.length_m)}m
            ${edge.is_oneway ? ' · ONE-WAY' : ''}
          </div>`,
          { sticky: true }
        );
        line.on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          onEdgeClick?.(edge);
        });
        line.addTo(grp);
      }
    }

    if (onNodeClick) {
      for (const n of nodes) {
        const dot = L.circleMarker([n.lat, n.lng], {
          radius: 3.5,
          color: '#64748b',
          fillColor: '#94a3b8',
          fillOpacity: 0.65,
          weight: 1,
        });
        dot.bindTooltip(`${n.name} (${n.locality})`);
        dot.on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          onNodeClick(n);
        });
        dot.addTo(grp);
      }
    }
  }, [edges, nodes, selectedEdgeId, showLayers.roads, showLayers.roadStatus, onEdgeClick, onNodeClick]);

  // Algorithm Exploration Visited Nodes Overlay
  useEffect(() => {
    const grp = layersRef.current?.visited;
    if (!grp) return;
    grp.clearLayers();
    if (visitedNodeIds.length === 0 && !activeStepNodeId) return;

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    for (const id of visitedNodeIds) {
      const n = nodeMap.get(id);
      if (!n) continue;
      L.circleMarker([n.lat, n.lng], {
        radius: 5,
        color: '#0ea5e9',
        fillColor: '#38bdf8',
        fillOpacity: 0.7,
        weight: 1.5,
      }).addTo(grp);
    }

    if (activeStepNodeId) {
      const active = nodeMap.get(activeStepNodeId);
      if (active) {
        L.circleMarker([active.lat, active.lng], {
          radius: 9,
          color: '#facc15',
          fillColor: '#eab308',
          fillOpacity: 0.9,
          weight: 2.5,
        })
          .bindTooltip(`Exploring: ${active.name}`)
          .addTo(grp);
      }
    }
  }, [visitedNodeIds, activeStepNodeId, nodes]);

  // Routes Layer
  useEffect(() => {
    const grp = layersRef.current?.routes;
    if (!grp) return;
    grp.clearLayers();

    for (const r of routes) {
      if (r.coordinates.length < 2) continue;
      const latLngs = r.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
      const poly = L.polyline(latLngs, {
        color: r.color,
        weight: r.weight ?? 5,
        dashArray: r.dashArray,
        opacity: 0.95,
      });
      poly.bindTooltip(r.label, { sticky: true });
      poly.addTo(grp);
    }
  }, [routes]);

  // Facilities Layer
  useEffect(() => {
    const grp = layersRef.current?.facilities;
    if (!grp) return;
    grp.clearLayers();
    if (!showLayers.facilities) return;

    for (const f of facilities) {
      const color =
        f.kind === 'hospital' ? '#f43f5e' : f.kind === 'shelter' ? '#a78bfa' : '#2dd4bf';
      const marker = L.circleMarker([f.lat, f.lng], {
        radius: 6,
        color: '#0f172a',
        fillColor: color,
        fillOpacity: 0.9,
        weight: 2,
      });
      marker.bindTooltip(`${f.name} (${f.kind.replace('_', ' ')})`);
      marker.addTo(grp);
    }
  }, [facilities, showLayers.facilities]);

  // Rescue Teams Layer
  useEffect(() => {
    const grp = layersRef.current?.teams;
    if (!grp) return;
    grp.clearLayers();
    if (showLayers.teams === false) return;

    for (const t of teams) {
      const color = TEAM_COLORS[t.status] || '#10b981';
      const marker = L.circleMarker([t.current_lat, t.current_lng], {
        radius: 7,
        color: '#ffffff',
        fillColor: color,
        fillOpacity: 0.95,
        weight: 2,
      });
      marker.bindTooltip(
        `<div style="font-size:11px">
          <strong>${t.name}</strong><br/>
          Status: ${t.status.replace('_', ' ').toUpperCase()} (Simulated Pos)<br/>
          Base: ${t.home_base_name}
        </div>`
      );
      marker.addTo(grp);
    }
  }, [teams, showLayers.teams]);

  // Incidents Layer
  useEffect(() => {
    const grp = layersRef.current?.incidents;
    if (!grp) return;
    grp.clearLayers();
    if (showLayers.incidents === false) return;

    for (const inc of incidents) {
      const color = SEVERITY_COLORS[inc.severity] || '#94a3b8';
      const isVerified = inc.verification_status === 'verified';
      const radius = inc.severity === 'critical' ? 9 : inc.severity === 'high' ? 7.5 : 6;
      const marker = L.circleMarker([inc.lat, inc.lng], {
        radius,
        color: isVerified ? '#0f172a' : color,
        fillColor: color,
        fillOpacity: isVerified ? 0.92 : 0.35,
        weight: isVerified ? 2 : 2.5,
        dashArray: isVerified ? undefined : '3 3',
      });
      marker.bindTooltip(
        `<div style="font-size:11px">
          <strong>${inc.title}</strong><br/>
          Severity: ${inc.severity.toUpperCase()} · ${inc.verification_status.toUpperCase()}<br/>
          Locality: ${inc.locality} · Teams Req: ${inc.requested_teams}
        </div>`
      );
      marker.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        onIncidentClick?.(inc);
      });
      marker.addTo(grp);
    }
  }, [incidents, showLayers.incidents, onIncidentClick]);

  return (
    <div
      ref={containerRef}
      className={`resqgrid-map w-full ${heightClass} rounded-lg border border-slate-800/90 overflow-hidden bg-[#070D19] relative z-0`}
      aria-label="Chennai Metropolitan Study-Area Interactive GIS Map"
    />
  );
}
