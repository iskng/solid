import { APIEvent } from "@solidjs/start/server";
import {
  finishServerPasskeyRegistration,
  getUserFromRequest,
  startServerPasskeyRegistration,
} from "../../../lib/auth";

// POST handler for /api/passkeys/register
export async function POST({ request }: APIEvent): Promise<Response> {
  try {
    // 1. Check if user is authenticated (e.g., via session cookie)
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response(
        JSON.stringify({ message: "Unauthorized: User not logged in." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { start, finish, credential } = await request.json();

    if (start) {
      // Start registration process
      console.log(
        `[API Register] Starting passkey registration for user ${user.id}`
      );
      const createOptions = await startServerPasskeyRegistration(user.id.id);
      return new Response(JSON.stringify({ createOptions }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else if (finish && credential) {
      // Finish registration process
      console.log(
        `[API Register] Finishing passkey registration for user ${user.id}`
      );
      await finishServerPasskeyRegistration(user.id.id, credential);
      return new Response(
        JSON.stringify({ message: "Passkey registration successful." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ message: "Invalid request parameters." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[API Register] Error:", error);
    return new Response(
      JSON.stringify({
        message: error.message || "Passkey registration failed.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
