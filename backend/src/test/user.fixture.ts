import { randomUUID } from "node:crypto";

export function createUserData(name: string) {
  const uniqueId = randomUUID();
  return {
    name,
    email: `test-user-${uniqueId}@example.test`,
    passwordHash: `test-password-hash-${uniqueId}`,
  };
}
