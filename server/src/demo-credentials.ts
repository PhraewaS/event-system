export const demoAccountKeys = [
  "organizer",
  "organizer2",
  "participant",
  "participant2",
] as const;

export type DemoAccountKey = (typeof demoAccountKeys)[number];
export type DemoPasswords = Record<DemoAccountKey, string>;
export type SeedCredentials = string | DemoPasswords;

const MIN_PASSWORD_LENGTH = 15;
const MAX_PASSWORD_LENGTH = 256;

export function parseDemoPasswordsJson(raw: string): DemoPasswords {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("DEMO_PASSWORDS_JSON must be a JSON object of per-account passphrases.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("DEMO_PASSWORDS_JSON must be a JSON object of per-account passphrases.");
  }

  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== demoAccountKeys.length ||
    keys.some((key) => !demoAccountKeys.includes(key as DemoAccountKey))
  ) {
    throw new Error(`DEMO_PASSWORDS_JSON must contain exactly: ${demoAccountKeys.join(", ")}.`);
  }

  const passwords = {} as DemoPasswords;
  for (const key of demoAccountKeys) {
    const value = record[key];
    if (
      typeof value !== "string" ||
      value.length < MIN_PASSWORD_LENGTH ||
      value.length > MAX_PASSWORD_LENGTH
    ) {
      throw new Error(
        `Each demo passphrase must be ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters.`,
      );
    }
    passwords[key] = value;
  }

  if (new Set(Object.values(passwords)).size !== demoAccountKeys.length) {
    throw new Error("Each demo account must have a different passphrase.");
  }

  return passwords;
}

export function seedCredentialsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SeedCredentials {
  if (env.DEMO_PASSWORDS_JSON) return parseDemoPasswordsJson(env.DEMO_PASSWORDS_JSON);

  // Local tests and development may keep using one synthetic seed password.
  // Production UAT must use distinct account passphrases from Secret Manager.
  if (env.NODE_ENV !== "production" && env.DEMO_PASSWORD) {
    return env.DEMO_PASSWORD;
  }

  throw new Error("Set DEMO_PASSWORDS_JSON with a distinct passphrase for each demo account.");
}
