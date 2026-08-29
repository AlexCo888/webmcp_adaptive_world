import { canonicalizeJson, verifySha256Hex } from "@adaptive-world/security";

export async function verifySavedRoutinePlanHash(
  plan: unknown,
  expectedHash: string,
): Promise<boolean> {
  try {
    return await verifySha256Hex(canonicalizeJson(plan), expectedHash);
  } catch {
    return false;
  }
}
