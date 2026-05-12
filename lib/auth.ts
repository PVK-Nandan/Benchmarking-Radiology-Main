import { createHmac, timingSafeEqual } from "crypto";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  picture?: string;
  method: "google" | "local";
  role: "admin" | "user";
};

const cookieName = "monarcs_session";

function secret() {
  return process.env.AUTH_SECRET || process.env.OPENAI_API_KEY || "local-development-secret";
}

function base64url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(user: AuthUser) {
  const payload = base64url(JSON.stringify({ user, exp: Date.now() + 1000 * 60 * 60 * 12 }));
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token?: string | null): AuthUser | null {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed.user || null;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string) {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`;
}

export function clearSessionCookie() {
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getSessionTokenFromCookie(cookieHeader: string | null) {
  return (cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
}

export function getCurrentUser(request: Request) {
  return verifySessionToken(getSessionTokenFromCookie(request.headers.get("cookie")));
}

export async function verifyGoogleCredential(credential: string): Promise<AuthUser> {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("Missing GOOGLE_CLIENT_ID or NEXT_PUBLIC_GOOGLE_CLIENT_ID.");

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
    cache: "no-store"
  });
  const token = await response.json();
  if (!response.ok) throw new Error(token.error_description || token.error || "Google token verification failed.");
  if (token.aud !== clientId) throw new Error("Google token audience does not match this app.");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(token.iss)) {
    throw new Error("Google token issuer is invalid.");
  }
  if (Number(token.exp) * 1000 < Date.now()) throw new Error("Google token has expired.");

  return {
    id: token.sub,
    name: token.name || token.email || "Google user",
    email: token.email || "",
    picture: token.picture,
    method: "google",
    role: "user"
  };
}
