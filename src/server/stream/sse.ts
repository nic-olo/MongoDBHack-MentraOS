import { Response } from "express";
import { TranscriptionData } from "@mentra/sdk";

type SSEClient = {
  userId: string;
  res: Response;
};

const clients: Map<string, SSEClient[]> = new Map();

export function addSSEClient(userId: string, res: Response): void {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const client: SSEClient = { userId, res };

  if (!clients.has(userId)) {
    clients.set(userId, []);
  }
  clients.get(userId)!.push(client);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: "connected", userId })}\n\n`);

  // Remove client on disconnect
  res.on("close", () => {
    removeSSEClient(userId, res);
  });
}

export function removeSSEClient(userId: string, res: Response): void {
  const userClients = clients.get(userId);
  if (userClients) {
    const index = userClients.findIndex((c) => c.res === res);
    if (index !== -1) {
      userClients.splice(index, 1);
    }
    if (userClients.length === 0) {
      clients.delete(userId);
    }
  }
}

export function sendTranscription(userId: string, data: TranscriptionData): void {
  const userClients = clients.get(userId);
  if (!userClients) return;

  const message = JSON.stringify({
    type: "transcription",
    text: data.text,
    speakerId: data.speakerId,
    isFinal: data.isFinal,
    utteranceId: data.utteranceId,
    startTime: data.startTime,
    endTime: data.endTime,
  });

  for (const client of userClients) {
    client.res.write(`data: ${message}\n\n`);
  }
}

export function getConnectedClients(userId: string): number {
  return clients.get(userId)?.length ?? 0;
}
