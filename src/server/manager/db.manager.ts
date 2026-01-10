import { createFile } from "../api/db/file.api";

export async function initializeFile(userEmail: string) {
  return await createFile({ userEmail });
}
