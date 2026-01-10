import { File } from "../../../shared/schema/file.schema";
import { getFormatedDate, getDateOnly } from "../../../shared/schema/util";

interface CreateFileParams {
  userEmail: string;
  fileName?: string;
}

export async function createFile({ userEmail, fileName }: CreateFileParams) {
  const name = fileName ?? getFormatedDate();
  const datePrefix = getDateOnly();

  // Check if file with same date already exists for this user
  const existing = await File.findOne({
    userEmail,
    fileName: { $regex: `^${datePrefix}` },
  });
  if (existing) {
    return existing;
  }

  const file = new File({
    userEmail,
    fileName: name,
  });

  return await file.save();
}



