import { Request, Response, NextFunction } from "express";
import { User } from "../../../shared/class/User";

export function requireActiveSession(req: Request, res: Response, next: NextFunction) {
  const userId = req.body.userId || req.query.userId;

  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  if (!User.get(userId)) {
    res.status(401).json({ error: "No active session for this user" });
    return;
  }

  next();
}
