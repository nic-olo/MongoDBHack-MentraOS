import { Express } from "express";
import { createFile } from "../api/db/file.api";
import { requireActiveSession } from "../api/middleware/auth.middleware";


export function setupDbRoutes(app: Express): void {
  // Route: Create a new file
  app.post("/api/files/create", requireActiveSession, async (req: any, res: any) => {
    try {
      const { userEmail, fileName } = req.body;

      if (!userEmail) {
        res.status(400).json({ error: "userEmail is required" });
        return;
      }

      const file = await createFile({ userEmail, fileName });

      res.status(201).json({ success: true, file });
    } catch (error: any) {
      console.error("Error creating file:", error);
      res.status(500).json({ error: error.message });
    }
  });
}
