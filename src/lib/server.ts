import { useSession } from "vinxi/http";
import { getSurrealConnection } from "./surreal";
import type { User } from "./schema";

export function validateUsername(username: unknown) {
  if (typeof username !== "string" || username.length < 3) {
    return `Usernames must be at least 3 characters long`;
  }
}

export function validatePassword(password: unknown) {
  if (typeof password !== "string" || password.length < 6) {
    return `Passwords must be at least 6 characters long`;
  }
}

export async function register(username: string, password: string) {
  const db = await getSurrealConnection();
  const email = username;

  const existingResponse: [{ result: User[] }] = await db.query(
    "SELECT * FROM user WHERE email = $email LIMIT 1",
    { email }
  );
  const existingUser = existingResponse?.[0]?.result?.[0];

  if (existingUser) throw new Error("User already exists");

  const userData = { email: email /*, password: hashedPassword */ };

  const createdRecords = await db.create("user", userData);
  const createdUser = createdRecords?.[0] as unknown as User | undefined;

  if (!createdUser) throw new Error("Failed to register user");

  return createdUser;
}

export function getSession() {
  return useSession({
    password:
      process.env.SESSION_SECRET ?? "areallylongsecretthatyoushouldreplace",
  });
}

export async function logout() {
  const session = await getSession();
  await session.update((d) => {
    d.userId = undefined;
  });
}
