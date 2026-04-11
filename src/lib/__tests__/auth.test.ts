// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";

vi.mock("server-only", () => ({}));

const mockGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ get: mockGet })),
}));

const JWT_SECRET = Buffer.from("development-secret-key");

async function signToken(payload: object, expiresIn = "7d") {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSession", () => {
  test("returns null when no cookie is present", async () => {
    mockGet.mockReturnValue(undefined);
    const { getSession } = await import("@/lib/auth");
    const session = await getSession();
    expect(session).toBeNull();
  });

  test("returns session payload for a valid token", async () => {
    const payload = {
      userId: "user_123",
      email: "test@example.com",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
    const token = await signToken(payload);
    mockGet.mockReturnValue({ value: token });

    const { getSession } = await import("@/lib/auth");
    const session = await getSession();

    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user_123");
    expect(session?.email).toBe("test@example.com");
  });

  test("returns null for an expired token", async () => {
    const token = await signToken(
      { userId: "user_123", email: "test@example.com" },
      "-1s"
    );
    mockGet.mockReturnValue({ value: token });

    const { getSession } = await import("@/lib/auth");
    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns null for a tampered token", async () => {
    const token = await signToken({ userId: "user_123", email: "test@example.com" });
    const tampered = token.slice(0, -5) + "XXXXX";
    mockGet.mockReturnValue({ value: tampered });

    const { getSession } = await import("@/lib/auth");
    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns null for a malformed token", async () => {
    mockGet.mockReturnValue({ value: "not.a.jwt" });

    const { getSession } = await import("@/lib/auth");
    const session = await getSession();

    expect(session).toBeNull();
  });
});
