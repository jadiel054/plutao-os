import { describe, it, expect, beforeEach, vi } from "vitest";

let usersStore: Array<{ id: string; email: string; name: string | null; passwordHash: string | null }> = [];
let waitlistStore: Array<{ id: string; email: string; position: number }> = [];

vi.mock("@/lib/db", () => {
  return {
    getDb: () => ({
      select: (fields?: Record<string, unknown>) => {
        return {
          from: (table: { name?: string; config?: { name?: string } }) => {
            return {
              where: (condition: { value?: unknown; config?: { value?: unknown }; right?: { value?: unknown } }) => {
                const searchVal = condition?.value ?? condition?.config?.value ?? condition?.right?.value ?? "";
                return {
                  limit: (_n: number) => {
                    const tableName = table?.name || "";
                    const isWaitlist = tableName === "founder_waitlist" || table?.config?.name === "founder_waitlist" || fields?.position !== undefined;
                    if (isWaitlist) {
                      if (searchVal) return waitlistStore.filter((w) => w.email === String(searchVal).toLowerCase());
                      return waitlistStore;
                    } else {
                      if (searchVal) return usersStore.filter((u) => u.email === String(searchVal).toLowerCase());
                      return usersStore;
                    }
                  },
                };
              },
              then: (resolve: (val: unknown) => void) => resolve([{ maxPos: waitlistStore.length }]),
            };
          },
        };
      },
      insert: (_table: unknown) => ({
        values: (data: { email: string; name?: string | null; passwordHash?: string | null; position?: number }) => {
          return {
            returning: (fields?: { position?: unknown }) => {
              if (data.position !== undefined || (fields && fields.position)) {
                const item = { id: `w-${waitlistStore.length + 1}`, email: data.email, position: data.position ?? waitlistStore.length + 1 };
                waitlistStore.push(item);
                return [item];
              }
              const item = {
                id: `u-${usersStore.length + 1}`,
                email: data.email,
                name: data.name ?? null,
                passwordHash: data.passwordHash ?? null,
              };
              usersStore.push(item);
              return [item];
            },
          };
        },
      }),
    }),
  };
});

import { getOrCreateUserByEmail } from "./social";

describe("Social Auth and Account Linking Unit Logic", () => {
  beforeEach(() => {
    usersStore = [];
    waitlistStore = [];
  });

  it("normalizes emails and handles new social user creation", async () => {
    const email = "  TestUser@Example.COM  ";
    const name = "Test User";

    const result = await getOrCreateUserByEmail(email, name);

    expect(result.email).toBe("testuser@example.com");
    expect(result.name).toBe("Test User");
    expect(result.isNewUser).toBe(true);
    expect(waitlistStore.length).toBe(1);
  });

  it("links existing user with same email without creating duplicate user", async () => {
    usersStore.push({
      id: "u-existing",
      email: "existing@example.com",
      name: "Existing User",
      passwordHash: "hashed_pass",
    });

    const result = await getOrCreateUserByEmail("EXISTING@example.com", "Different Name");

    expect(result.id).toBe("u-existing");
    expect(result.email).toBe("existing@example.com");
    expect(result.isNewUser).toBe(false);
    expect(usersStore.length).toBe(1); // Not duplicated!
  });
});
