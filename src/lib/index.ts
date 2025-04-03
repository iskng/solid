import { action, query, redirect } from "@solidjs/router";
import { getUserSession, getUserById } from "./auth";

import { logout as logoutSession } from "./server";
import { getSurrealConnection } from "./surreal";
import type { User } from "./schema";

export const getUser = query(async () => {
  "use server";
  try {
    const session = await getUserSession();
    const userIdString = session.data.userId;

    if (!userIdString) {
      throw new Error("Not authenticated");
    }

    console.log(`[getUser] Found userId in session: ${userIdString}`);

    const user = await getUserById(userIdString);

    if (!user) {
      console.error(
        `[getUser] User ${userIdString} from session not found in DB! Clearing session.`
      );
      await session.clear();
      throw new Error("User not found in DB");
    }

    console.log(
      `[getUser] Successfully fetched user details for ${userIdString}`
    );
    return {
      id: `${user.id.tb}:${user.id.id}`,
      email: user.email,
    };
  } catch (error) {
    if (
      !(
        error instanceof Error &&
        (error.message === "Not authenticated" ||
          error.message === "User not found in DB")
      )
    ) {
      console.error("[getUser] Error fetching user:", error);
    }
    return null;
  }
}, "user");

export const logout = action(async () => {
  "use server";
  // Clear the vinxi session cookie
  const session = await getUserSession();
  await session.clear();
  console.log("[logout] Session cleared.");
  // Also ensure the old server function is removed/updated if needed
  // await logoutSession(); // Might be redundant now
  return redirect("/login");
});
