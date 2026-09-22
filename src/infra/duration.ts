/**
 * Parse a short duration string like "15m", "30s", "2h", "7d" into seconds.
 * Used to report access-token lifetime (expiresIn) consistently with the
 * value handed to the JWT signer.
 */
export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(value.trim());
  if (!match) throw new Error(`Invalid duration: ${value} (expected e.g. "15m", "2h", "7d")`);
  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * multipliers[unit!]!;
}
