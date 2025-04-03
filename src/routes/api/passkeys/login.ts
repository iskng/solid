import { APIEvent } from "@solidjs/start/server";
import {
  finishServerPasskeyLogin,
  startServerPasskeyLogin,
  startServerPasskeyRegistration,
  finishServerPasskeyRegistration,
  getUserSession,
} from "../../../lib/auth";

// Define cookie name directly
const SESSION_COOKIE_NAME = "sessionId";

// Helper to create JSON response
function jsonResponse(data: any, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...init?.headers,
      "Content-Type": "application/json",
    },
  });
}

// POST handler for /api/passkeys/login (now handles login OR registration)
export async function POST({ request }: APIEvent): Promise<Response> {
  try {
    // Add userId for the finish registration step
    const { start, finish, credential, email, userId } = await request.json();

    if (start && email) {
      console.log(
        `[API Auth] Starting passkey login/register for email: ${email}`
      );

      // Try login first
      const loginOptions = await startServerPasskeyLogin(email);

      // Log the result before the check
      console.log(
        "[API Auth] Result from startServerPasskeyLogin:",
        loginOptions
      );

      if (loginOptions) {
        // User found, proceed with login
        console.log("[API Auth] User found. Sending login options.");
        // Send the CONTENT of publicKey, not the whole Hanko object
        return jsonResponse({
          loginOptions: loginOptions.publicKey,
          isRegistering: false,
        });
      } else {
        // User not found, proceed with registration
        console.log("[API Auth] User not found. Initiating registration.");
        try {
          const registrationResult = await startServerPasskeyRegistration(
            email
          );
          if (!registrationResult || !registrationResult.createOptions) {
            throw new Error(
              "Failed to get registration options after user creation."
            );
          }
          console.log("[API Auth] Sending registration options.");
          // Send the CONTENT of publicKey, not the whole Hanko object
          return jsonResponse({
            registrationOptions: registrationResult.createOptions.publicKey,
            userId: registrationResult.userId, // Send back the new user ID
            isRegistering: true,
          });
        } catch (registrationError: any) {
          console.error(
            "[API Auth] Error during registration start:",
            registrationError
          );
          // Send specific error (e.g., email already exists from startServerPasskeyRegistration)
          return jsonResponse(
            { message: registrationError.message || "Registration failed." },
            { status: 409 }
          ); // 409 Conflict maybe?
        }
      }
    }

    // Handle FINISH phase (distinguish login vs registration)
    if (finish && credential) {
      let authUserIdString: string | null = null; // Store the string "user:<id>"
      let authUserObject: any = null; // Store the parsed user object {id:{tb,id}, email}
      let successMessage = "";

      if (userId) {
        // If userId is present, it's a registration finish
        console.log(
          `[API Auth] Finishing passkey registration for user ${userId}`
        );
        // finishServerPasskeyRegistration doesn't return user, just finalizes
        await finishServerPasskeyRegistration(userId, credential);
        // We need the user info to set session, userId is already the string "user:<id>"
        authUserIdString = userId;
        successMessage = "Registration successful.";
        console.log(
          `[API Auth] Registration finished for ${authUserIdString}.`
        );
        // We don't have the full user object here unless we fetch it again
        // Let's assume setting only userId in session is enough for now
      } else {
        // No userId, it's a login finish
        console.log("[API Auth] Finishing passkey login");
        const loginResult = await finishServerPasskeyLogin(credential);

        if (!loginResult) {
          console.error(
            "[API Auth] Finish login failed (finishServerPasskeyLogin returned null)."
          );
          return jsonResponse(
            { message: "Passkey login failed." },
            { status: 401 }
          );
        }
        // loginResult contains { user: {id:{tb,id}, email}, userIdString: "user:<id>" }
        authUserObject = loginResult.user;
        authUserIdString = loginResult.userIdString;
        successMessage = "Passkey login successful.";
        console.log(`[API Auth] Login finished for ${authUserIdString}.`);
      }

      // If authentication/registration succeeded, update the session
      if (authUserIdString) {
        console.log(
          `[API Auth] Updating session for user: ${authUserIdString}`
        );
        const session = await getUserSession();
        await session.update({ userId: authUserIdString });
        console.log("[API Auth] Session updated. Cookie should be set.");
        // Vinxi session helper handles setting the cookie automatically
        return jsonResponse({ message: successMessage });
      } else {
        // This case shouldn't be reached if logic above is correct
        console.error(
          "[API Auth] Reached end of finish block without valid user ID."
        );
        return jsonResponse(
          { message: "Authentication failed unexpectedly." },
          { status: 500 }
        );
      }
    }

    // Invalid parameters if none of the above matched
    return jsonResponse(
      { message: "Invalid request parameters." },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("[API Auth] General Error:", error);
    const message = error.message || "Authentication process failed.";
    return jsonResponse({ message }, { status: 500 });
  }
}
