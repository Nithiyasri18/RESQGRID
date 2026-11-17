import type { Response } from 'express';

interface SseClient {
  id: string;
  res: Response;
}

const clients = new Map<string, SseClient>();

export function registerSseClient(id: string, res: Response): void {
  clients.set(id, { id, res });
}

export function removeSseClient(id: string): void {
  clients.delete(id);
}

export function broadcastEvent(eventType: string, payload: Record<string, unknown>): void {
  const data = JSON.stringify({
    type: eventType,
    payload,
    timestamp: new Date().toISOString(),
  });
  for (const client of clients.values()) {
    try {
      client.res.write(`event: ${eventType}\n`);
      client.res.write(`data: ${data}\n\n`);
    } catch {
      clients.delete(client.id);
    }
  }
}

export function getConnectedClientCount(): number {
  return clients.size;
}
