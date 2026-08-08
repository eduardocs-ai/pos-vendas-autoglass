import { cookies } from "next/headers";

export const SESSION_COOKIE = "pos_vendas_session";
const SESSION_SECONDS = 60 * 60 * 12;

const USERS = {
  "luciano.padilla": { displayName: "Luciano Padilha", role: "agent" },
  "livia.neves": { displayName: "Lívia Neves", role: "agent" },
  "eduardo.calegari": { displayName: "Eduardo Calegari", role: "agent" },
  "amanda.piaz": { displayName: "Amanda Piaz", role: "agent" },
  "elizandra.viana": { displayName: "Elizandra Viana", role: "leader" },
  "rhanaiza.kinack": { displayName: "Rhanaiza Kinack", role: "leader" },
  "stefany.moreira": { displayName: "Stefany Moreira", role: "leader" },
  "milena.vassoler": { displayName: "Milena Vassoler", role: "coordinator" },
} as const;

export type DashboardUser = {
  username: keyof typeof USERS;
  displayName: (typeof USERS)[keyof typeof USERS]["displayName"];
  role: (typeof USERS)[keyof typeof USERS]["role"];
};

type SessionPayload = DashboardUser & { expiresAt: number };

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function stringToBase64Url(value: string) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToString(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function signature(value: string) {
  const secret = process.env.DASHBOARD_SESSION_SECRET || "pos-vendas-local-development-secret";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

export function authenticateDashboardUser(username: string, password: string): DashboardUser | null {
  const normalized = username.trim().toLowerCase() as keyof typeof USERS;
  const expectedPassword = process.env.DASHBOARD_LOGIN_PASSWORD || "admin";
  if (!USERS[normalized] || password !== expectedPassword) return null;
  return { username: normalized, displayName: USERS[normalized].displayName, role: USERS[normalized].role };
}

export async function createSessionToken(user: DashboardUser) {
  const payload: SessionPayload = { ...user, expiresAt: Date.now() + SESSION_SECONDS * 1000 };
  const encoded = stringToBase64Url(JSON.stringify(payload));
  return `${encoded}.${await signature(encoded)}`;
}

export function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
}

export function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function getDashboardUser(): Promise<DashboardUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [encoded, suppliedSignature] = token.split(".");
  if (!encoded || !suppliedSignature || suppliedSignature !== await signature(encoded)) return null;
  try {
    const payload = JSON.parse(base64UrlToString(encoded)) as SessionPayload;
    if (payload.expiresAt <= Date.now() || USERS[payload.username]?.displayName !== payload.displayName) return null;
    return { username: payload.username, displayName: payload.displayName, role: USERS[payload.username].role };
  } catch {
    return null;
  }
}
