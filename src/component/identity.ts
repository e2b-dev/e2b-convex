export const IDENTITY_SCHEMA = "1";
export const MAX_IDENTITY_LENGTH = 512;

export interface CreationPolicy {
  template: string;
  timeoutMs: number;
  envs?: Record<string, string>;
  network?: unknown;
}

export interface Identity {
  namespace: string;
  scopeHash: string;
  keyHash: string;
  generation: string;
  metadata: Record<string, string>;
}

export function validateIdentityPart(name: "scope" | "key", value: string) {
  if (value.length === 0) throw new Error(`${name} must not be empty`);
  if (value.length > MAX_IDENTITY_LENGTH) {
    throw new Error(
      `${name} must be at most ${MAX_IDENTITY_LENGTH} characters`,
    );
  }
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export async function deriveNamespace(
  configured: string | undefined,
  siteUrl: string | undefined,
): Promise<string> {
  if (configured?.trim()) return configured.trim();
  if (!siteUrl?.trim()) {
    throw new Error(
      "E2B_NAMESPACE is unset and CONVEX_SITE_URL is unavailable; bind E2B_NAMESPACE explicitly",
    );
  }
  return `site_${(await sha256(siteUrl.trim())).slice(0, 24)}`;
}

export async function generationFingerprint(policy: CreationPolicy) {
  return (
    await sha256(
      canonicalJson({
        template: policy.template,
        network: policy.network ?? null,
        envKeys: Object.keys(policy.envs ?? {}).sort(),
      }),
    )
  ).slice(0, 24);
}

export async function makeIdentity(
  namespace: string,
  scope: string,
  key: string,
  policy: CreationPolicy,
): Promise<Identity> {
  validateIdentityPart("scope", scope);
  validateIdentityPart("key", key);
  const framedScope = `${scope.length}:${scope}`;
  const [scopeHash, keyHash, generation] = await Promise.all([
    sha256(framedScope),
    sha256(`${framedScope}${key.length}:${key}`),
    generationFingerprint(policy),
  ]);
  return {
    namespace,
    scopeHash,
    keyHash,
    generation,
    metadata: {
      convex_ns: namespace,
      convex_scope_h: scopeHash,
      convex_key_h: keyHash,
      convex_gen: generation,
      convex_schema: IDENTITY_SCHEMA,
    },
  };
}

export async function makeScopeMetadata(namespace: string, scope: string) {
  validateIdentityPart("scope", scope);
  return {
    convex_ns: namespace,
    convex_scope_h: await sha256(`${scope.length}:${scope}`),
    convex_schema: IDENTITY_SCHEMA,
  };
}
