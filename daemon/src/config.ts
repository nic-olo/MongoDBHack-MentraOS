/**
 * Config Manager
 * Handles daemon configuration storage and retrieval
 * Stores config in ~/.desktop-daemon/config.json
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { DaemonConfig } from "./types";

const CONFIG_DIR = path.join(os.homedir(), ".desktop-daemon");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load daemon configuration
 */
export function loadConfig(): DaemonConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return null;
    }
    const content = fs.readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(content) as DaemonConfig;
  } catch (error) {
    console.error("[config] Failed to load config:", error);
    return null;
  }
}

/**
 * Save daemon configuration
 */
export function saveConfig(config: DaemonConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log(`[config] Saved config to ${CONFIG_FILE}`);
}

/**
 * Check if daemon is configured (has email)
 */
export function isConfigured(): boolean {
  const config = loadConfig();
  return config !== null && !!config.email && !!config.serverUrl;
}

/**
 * Clear configuration (logout)
 */
export function clearConfig(): void {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
    console.log("[config] Config cleared");
  }
}

/**
 * Get config directory path (for other files like logs)
 */
export function getConfigDir(): string {
  ensureConfigDir();
  return CONFIG_DIR;
}

/**
 * Default server URL (can be overridden)
 */
export const DEFAULT_SERVER_URL =
  process.env.DAEMON_SERVER_URL || "http://localhost:3000";
