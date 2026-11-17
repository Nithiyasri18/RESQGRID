import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { API_URL_BASE, apiRequest } from '../lib/api';
import type { AuditLogEntry, Scenario } from '../types/resqgrid';

interface ScenarioContextValue {
  scenarios: Scenario[];
  activeScenario: Scenario | null;
  selectedScenarioId: string | undefined;
  setSelectedScenarioId: (id: string) => void;
  refreshScenarios: () => Promise<void>;
  auditEvents: AuditLogEntry[];
  refreshAuditEvents: () => Promise<void>;
  sseConnected: boolean;
  lastEventTick: number;
}

const ScenarioContext = createContext<ScenarioContextValue | null>(null);

export function ScenarioProvider({ children }: { children: React.ReactNode }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | undefined>(undefined);
  const [auditEvents, setAuditEvents] = useState<AuditLogEntry[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [lastEventTick, setLastEventTick] = useState(0);

  const refreshScenarios = useCallback(async () => {
    try {
      const res = await apiRequest<{ items: Scenario[] }>('/scenarios');
      setScenarios(res.items);
      setSelectedScenarioId((prev) => {
        if (prev && res.items.some((s) => s.id === prev)) return prev;
        const active = res.items.find((s) => s.is_active === 1) ?? res.items[0];
        return active?.id;
      });
    } catch {
      // handled in consuming views
    }
  }, []);

  const refreshAuditEvents = useCallback(async () => {
    try {
      const res = await apiRequest<{ items: AuditLogEntry[] }>('/audit-logs?limit=15');
      setAuditEvents(res.items);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshScenarios();
    refreshAuditEvents();
  }, [refreshScenarios, refreshAuditEvents]);

  // Live Server-Sent Events stream with automatic browser reconnect
  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      es = new EventSource(`${API_URL_BASE}/events`);

      es.addEventListener('connected', () => {
        setSseConnected(true);
      });

      const onMutation = () => {
        setLastEventTick((t) => t + 1);
        refreshScenarios();
        refreshAuditEvents();
      };

      const eventTypes = [
        'incident:created',
        'incident:updated',
        'incident:deleted',
        'road_closure:updated',
        'road_closure:reset',
        'scenario:activated',
        'scenario:reset',
        'scenario:created',
        'team:updated',
        'dispatch:approved',
        'assignment:updated',
        'volunteer:updated',
      ];
      for (const evt of eventTypes) {
        es.addEventListener(evt, onMutation);
      }

      es.onerror = () => {
        setSseConnected(false);
      };
    };

    connect();
    return () => {
      closed = true;
      es?.close();
    };
  }, [refreshScenarios, refreshAuditEvents]);

  const activeScenario =
    scenarios.find((s) => s.id === selectedScenarioId) ??
    scenarios.find((s) => s.is_active === 1) ??
    scenarios[0] ??
    null;

  return (
    <ScenarioContext.Provider
      value={{
        scenarios,
        activeScenario,
        selectedScenarioId: activeScenario?.id,
        setSelectedScenarioId,
        refreshScenarios,
        auditEvents,
        refreshAuditEvents,
        sseConnected,
        lastEventTick,
      }}
    >
      {children}
    </ScenarioContext.Provider>
  );
}

export function useScenario(): ScenarioContextValue {
  const ctx = useContext(ScenarioContext);
  if (!ctx) throw new Error('useScenario must be used inside ScenarioProvider');
  return ctx;
}
