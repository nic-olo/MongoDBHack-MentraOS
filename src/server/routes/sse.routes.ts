import { Express, Request, Response } from "express";
import { addSSEClient } from "../stream/sse";

export function setupSSERoutes(app: Express): void {
  app.get("/api/sse/transcription/:userId", (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    addSSEClient(userId, res);
  });
}
