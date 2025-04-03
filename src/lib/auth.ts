import { tenant } from "@teamhanko/passkeys-sdk"; // Use tenant directly
import { isServer } from "solid-js/web";
import { getSurrealConnection } from "./surreal";
import { User, Session, Passkey } from "./schema";
import { v4 as uuidv4 } from "uuid";
import * as jose from "jose";
import { userSchema, passkeySchema } from "./schema";
import { useSession } from "vinxi/http"; // Import vinxi session helper
import { RecordId } from "surrealdb"; // Import RecordId

// --- Environment Variables ---
const passkeysApiKey = process.env.PASSKEYS_API_KEY!;
const passkeysTenantId = process.env.PASSKEYS_TENANT_ID!;

if (isServer && (!passkeysApiKey || !passkeysTenantId)) {
  console.error("Missing Passkey environment variables!");
  throw new Error("Passkey configuration missing on server.");
}

// --- Passkey SDK Configuration ---
const passkeyApi = tenant({
  apiKey: passkeysApiKey,
  tenantId: passkeysTenantId,
});

// --- Session Data Type ---
type UserSessionData = {
  userId?: string; // Store the full "user:<id>" string
};

// --- Reusable Session Helper ---
const SESSION_PASSWORD =
  process.env.SESSION_SECRET ?? "areallylongsecretthatyoushouldreplace"; // Ensure this is strong!
const SESSION_COOKIE_NAME = "sid"; // Can use a different name than the DB session cookie

if (isServer && SESSION_PASSWORD.length < 32) {
  console.warn(
    "SESSION_SECRET is missing or too short (must be >= 32 chars). Session cookies are insecure!"
  );
  // Optionally throw an error in production?
  // throw new Error("Insecure session configuration.");
}

export function getUserSession() {
  // "use server" directive might not be needed here if called by other server fns
  return useSession<UserSessionData>({
    password: SESSION_PASSWORD,
    name: SESSION_COOKIE_NAME,
    // Add other options like cookie settings (maxAge, secure, etc.) if needed
    // cookie: {
    //   httpOnly: true,
    //   secure: process.env.NODE_ENV === "production",
    //   sameSite: "lax",
    //   maxAge: 60 * 60 * 24 * 7 // 1 week
    // }
  });
}

// --- SurrealDB User Management ---
async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getSurrealConnection();
  const response: [{ result: User[] }] = await db.query(
    "SELECT * FROM user WHERE email = $email LIMIT 1",
    { email }
  );
  console.log("[getUserByEmail] Raw response:", response);
  // Correctly access the user record via response[0][0] based on logs
  // @ts-expect-error - Linter type seems incorrect based on runtime logs
  const userRecord = response?.[0]?.[0] ?? null;

  // Log the extracted record *right before* the check
  console.log("[getUserByEmail] Extracted userRecord:", userRecord);

  if (!userRecord) {
    console.log(`[getUserByEmail] No user found for email: ${email}`);
    return null;
  }

  // This log should now only appear if userRecord is truthy
  console.log(
    `[getUserByEmail] Found raw user record for email ${email}:`,
    userRecord
  );
  // Add Zod parsing
  const parsedUser = userSchema.safeParse(userRecord);
  if (parsedUser.success) {
    // parsedUser.data.id is {tb, id}
    console.log(
      `[getUserByEmail] Successfully parsed user: ${parsedUser.data.id.tb}:${parsedUser.data.id.id}`
    );
    return parsedUser.data; // Return Zod validated data
  } else {
    console.error(
      `[getUserByEmail] Failed to parse user record for email ${email}:`,
      parsedUser.error
    );
    return null;
  }
}

export async function getUserById(id: string): Promise<User | null> {
  // Ensure id is in the format "user:<id>" before splitting
  const fullRecordIdString = id.includes(":") ? id : `user:${id}`;
  const [tableName, recordUuid] = fullRecordIdString.split(":", 2);

  // Validate parts before creating RecordId
  if (!tableName || !recordUuid) {
    console.error(`[getUserById] Invalid record ID format provided: ${id}`);
    return null;
  }

  const db = await getSurrealConnection();
  try {
    const recordIdObject = new RecordId(tableName, recordUuid);
    console.log(`[getUserById] Attempting to select record: ${recordIdObject}`);

    // Use db.select with RecordId object
    // It returns the record directly, not an array, when selecting by specific ID
    const userRecord = await db.select<User>(recordIdObject);
    console.log(
      "[getUserById] Raw result from db.select with RecordId:",
      userRecord
    );

    // Check if userRecord exists (db.select might return null/undefined or throw? Check driver docs)
    // Assuming it returns the object or null/undefined if not found.
    if (!userRecord) {
      console.log(
        `[getUserById] User record ${recordIdObject} not found via select.`
      );
      return null;
    }

    // Validate with Zod
    const parsedUser = userSchema.safeParse(userRecord);
    if (parsedUser.success) {
      console.log(
        `[getUserById] Successfully parsed user: ${parsedUser.data.id.tb}:${parsedUser.data.id.id}`
      );
      return parsedUser.data;
    } else {
      console.error(
        `[getUserById] Failed to parse user record ${recordIdObject} after select:`,
        parsedUser.error
      );
      return null;
    }
  } catch (error) {
    console.error(`Error selecting user ${fullRecordIdString}:`, error);
    return null;
  }
}

async function createUser(userData: Omit<User, "id">): Promise<User | null> {
  const db = await getSurrealConnection();
  try {
    // Let create infer return type (likely Record<string, any>[])
    const createdRecords = await db.create("user", userData);
    const createdRecord = createdRecords?.[0];
    if (!createdRecord) return null;

    // Log the raw record object before parsing
    console.log("[createUser] Raw record from db.create:", createdRecord); // Log the object directly

    // Original Zod parsing (RESTORED):
    const parsedUser = userSchema.safeParse(createdRecord);
    if (parsedUser.success) {
      return parsedUser.data;
    } else {
      console.error("Created user data failed Zod parsing:", parsedUser.error);
      return null;
    }
  } catch (error) {
    console.error("Error creating user:", error);
    return null;
  }
}

// --- SurrealDB Session Management (DEPRECATED - Using vinxi/http now) ---

/* // Keep commented out for now, delete later
export async function createSession(userId: string): Promise<string | null> {
  const db = await getSurrealConnection();
  const sessionId = uuidv4();
  const sessionRecordId = `session:${sessionId}`;
  const userRecordId = userId.includes(":") ? userId : `user:${userId}`;

  // Set expiry (e.g., 7 days from now)
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const sessionData = {
    userId: userRecordId,
    expiresAt: expiresAt,
  };

  try {
    console.log(
      `[Auth] Creating session record ${sessionRecordId} for user ${userRecordId}`
    );
    await db.create(sessionRecordId, sessionData);
    return sessionId; // Return the UUID part of the session ID
  } catch (error) {
    console.error("Error creating session:", error);
    return null;
  }
}
export async function getUserFromSession(sessionId: string): Promise<User | null> {
  const db = await getSurrealConnection();
  const sessionRecordId = `session:${sessionId}`;
  console.log(`[Auth] Looking up session: ${sessionRecordId}`);

  try {
    const query = `
      LET $session = SELECT * FROM ${sessionRecordId} WHERE expiresAt > time::now() LIMIT 1;
      LET $user = SELECT * FROM $session.userId LIMIT 1;
      [$session, $user]; // Return both results
    `;
    // Use any[] to handle potentially different result structures
    const response: [any[], any[]] = await db.query(query);
    console.log("[getUserFromSession] Raw DB response:", response);

    const sessionResult = response?.[0]?.[0]; // First record of first result array
    const userResult = response?.[1]?.[0]; // First record of second result array

    if (sessionResult && userResult) {
      console.log(
        "[getUserFromSession] Session found and user record potentially found:",
        userResult
      );
      // Validate the user record with Zod
      const parsedUser = userSchema.safeParse(userResult);
      if (parsedUser.success) {
        // parsedUser.data.id is {tb, id}
        console.log(
          `[Auth] Found valid session for user: ${parsedUser.data.id.tb}:${parsedUser.data.id.id}`
        );
        return parsedUser.data; // Return Zod validated data
      } else {
        console.error(
          "[getUserFromSession] Session valid, but failed to parse user record:",
          parsedUser.error
        );
        // Potentially delete invalid session?
        // await deleteSession(sessionId);
        return null;
      }
    } else {
      if (!sessionResult) console.log("[Auth] Session not found or expired.");
      if (sessionResult && !userResult) {
        console.log(
          "[Auth] Session found but user link broken or user deleted."
        );
        // Potentially delete invalid session?
        // await deleteSession(sessionId);
      }
      return null;
    }
  } catch (error) {
    console.error(`Error fetching user from session ${sessionId}:`, error);
    return null;
  }
}
async function deleteSession(sessionId: string): Promise<void> {
  const db = await getSurrealConnection();
  const sessionRecordId = `session:${sessionId}`;
  try {
    console.log(`[Auth] Deleting session: ${sessionRecordId}`);
    await db.delete(sessionRecordId);
  } catch (error) {
    console.error(`Error deleting session ${sessionRecordId}:`, error);
  }
}
*/

// --- SurrealDB Passkey Management ---

// Stores passkey credential details linked to a user
async function storePasskeyCredential(
  userId: string,
  credential: any
): Promise<Passkey | null> {
  const db = await getSurrealConnection();
  const userRecordId = userId.includes(":") ? userId : `user:${userId}`;

  // REMOVE manual ID construction
  // const passkeyRecordId = `passkey:${credential.id || uuidv4()}`;

  // Ensure userId in passkeyData is the string representation
  const passkeyData: Omit<Passkey, "id"> = {
    userId: userId,
    credentialId: credential.id,
    publicKey: credential.publicKey || credential.response?.publicKey || "N/A",
    transports: credential.response?.transports || [],
    counter: credential.response?.counter || 0,
    createdAt: new Date().toISOString(),
  };

  try {
    // Let SurrealDB generate the ID by passing only the table name
    console.log(`[Auth] Storing new passkey for user ${userId}`);
    const createdRecords = await db.create("passkey", passkeyData);
    const createdRecord = createdRecords?.[0];
    if (!createdRecord) return null;

    console.log(
      "[storePasskeyCredential] Raw record from db.create:",
      createdRecord
    );

    // Parse the actual created record with Zod
    // The `id` field in createdRecord should now be {tb:"passkey", id:"<generated>"}
    // which recordLink("passkey") expects.
    const parsedPasskey = passkeySchema.safeParse(createdRecord);
    if (parsedPasskey.success) {
      // parsedPasskey.data.id will be the {tb, id} object
      console.log(
        `[Auth] Passkey stored successfully with DB ID: ${parsedPasskey.data.id.tb}:${parsedPasskey.data.id.id}`
      );
      return parsedPasskey.data;
    } else {
      console.error(
        "Stored passkey data failed Zod parsing:",
        parsedPasskey.error
      );
      return null;
    }
  } catch (error) {
    console.error("Error storing passkey credential:", error);
    return null;
  }
}

// TODO: Add function to retrieve stored passkeys for a user if needed for verification
// async function getPasskeysForUser(userId: string): Promise<Passkey[]> { ... }

// --- Passkey Backend Functions (Updated) ---

export async function startServerPasskeyRegistration(email: string) {
  console.log(`[Passkey] Starting registration for email: ${email}`);

  // 1. Check if user already exists
  let user = await getUserByEmail(email);
  if (user) {
    // For now, throw error if email is already registered.
    // TODO: Optionally, allow adding multiple passkeys to an existing account.
    console.error(
      `[Passkey] Registration attempt for existing email: ${email}`
    );
    throw new Error(`Email ${email} is already registered.`);
  }

  // 2. User doesn't exist, create them
  console.log(`[Passkey] Creating new user for email: ${email}`);
  user = await createUser({ email }); // Create user with just email

  if (!user || !user.id) {
    console.error(`[Passkey] Failed to create user for email: ${email}`);
    throw new Error("Failed to create user before passkey registration.");
  }

  // Now user.id is {tb:..., id:...}
  const fullUserIdString = `${user.id.tb}:${user.id.id}`;
  console.log(`[Passkey] User created successfully: ${fullUserIdString}`);

  // 3. Initialize registration with Hanko for the NEW user
  const hankoUserId = user.id.id; // Use just the ID part for Hanko
  const createOptions = await passkeyApi.registration.initialize({
    userId: hankoUserId,
    username: user.email, // Hanko uses username, let's use email here
  });

  // Log the raw options from Hanko SDK before sending to client
  console.log(
    "[Passkey] Raw createOptions from Hanko SDK:",
    JSON.stringify(createOptions, null, 2)
  );

  console.log(
    `[Passkey] Registration options generated for new user ${fullUserIdString}`
  );
  // Return the FULL string ID to the API layer
  return { createOptions, userId: fullUserIdString };
}

export async function finishServerPasskeyRegistration(
  userId: string,
  credential: any
) {
  try {
    // 1. Finalize with Hanko SDK
    await passkeyApi.registration.finalize(credential);
    console.log(`[Passkey] Hanko registration finalized for user ${userId}.`);

    // 2. Store credential in our DB
    const storedCredential = await storePasskeyCredential(userId, credential);
    if (!storedCredential) {
      throw new Error(
        "Failed to store passkey credential in database after finalization."
      );
    }
    console.log(
      `[Passkey] Credential stored in DB for user ${userId}. ID: ${storedCredential.id}`
    );
  } catch (error) {
    console.error(
      `[Passkey] Finalization or storage failed for user ${userId}:`,
      error
    );
    // Consider more specific error handling (e.g., rollback?)
    throw new Error("Passkey registration finalization or storage failed.");
  }
}

export async function startServerPasskeyLogin(email: string) {
  console.log(`[Passkey] Initializing login for email: ${email}`);

  const user = await getUserByEmail(email);

  if (!user) {
    // User not found, return null to signal this.
    console.log(`[Passkey] User ${email} not found. Cannot initiate login.`);
    return null;
  }

  // user.id is {tb:..., id:...}
  const fullLoginUserIdString = `${user.id.tb}:${user.id.id}`;
  console.log(`[Passkey] User object found:`, JSON.stringify(user, null, 2));
  console.log(
    `[Passkey] User ID type: object, value: ${fullLoginUserIdString}`
  );

  const hankoLoginUserId = user.id.id; // Use just the ID part
  console.log(
    `[Passkey] User found: ${fullLoginUserIdString}. Using Hanko ID: ${hankoLoginUserId}`
  );

  // Initialize login WITH the user ID
  try {
    // Add try...catch around the Hanko call
    // RE-ADD userId and username to initialize call
    const options = await passkeyApi.login.initialize();
    console.log(
      `[Passkey] Login options generated successfully for user ${fullLoginUserIdString}:`,
      options
    );
    return options; // Return the options object
  } catch (hankoError: any) {
    // Catch potential errors from Hanko
    console.error(
      `[Passkey] Error during Hanko login initialize for ${fullLoginUserIdString}:`,
      hankoError
    );
    // Explicitly return null on error, matching the 'user not found' case
    return null;
  }
}

// RESTORE finishServerPasskeyLogin
export async function finishServerPasskeyLogin(
  credential: any // Changed from options based on API call
): Promise<{ user: User; userIdString: string } | null> {
  // Return user and string ID, or null
  console.log("[Passkey] Finalizing login...");
  try {
    // 1. Finalize with Hanko SDK
    const finalizeResponse = await passkeyApi.login.finalize(credential);
    console.log(
      "[Passkey] Login finalized by Hanko API. Token (exists):",
      !!finalizeResponse.token
    );

    if (!finalizeResponse.token) {
      throw new Error("Passkey finalization did not return a token.");
    }

    // 2. Decode token to get Hanko user ID
    const payload = jose.decodeJwt(finalizeResponse.token);
    const hankoUserId = payload.sub; // This is the ID Hanko uses (just the random part)
    if (!hankoUserId) {
      throw new Error("Passkey token does not contain user ID (sub).");
    }
    console.log(`[Passkey] Hanko User ID from token: ${hankoUserId}`);

    // 3. Find user in OUR DB using Hanko ID
    // This requires getUserById to handle the plain ID, not "user:<id>"
    // Let's assume getUserById is smart enough or modify it.
    // For now, construct the potential full ID
    const potentialUserId = `user:${hankoUserId}`;
    let user = await getUserById(potentialUserId);

    // User NOT found - this shouldn't happen in login if startServerPasskeyLogin worked
    if (!user) {
      console.error(
        `[Passkey] User ${potentialUserId} (from token) not found in DB during finish!`
      );
      // Maybe try fetching by email from token if available?
      const email = payload.email as string | undefined;
      if (email) {
        console.log(
          `[Passkey] Trying to find user by email from token: ${email}`
        );
        user = await getUserByEmail(email);
      }
      if (!user) {
        throw new Error(
          `User for token sub ${hankoUserId} not found in database.`
        );
      }
      console.warn(
        `[Passkey] Found user by email (${email}) after ID lookup failed.`
      );
    }

    // User found, user.id is {tb, id}
    const fullUserIdString = `${user.id.tb}:${user.id.id}`;
    console.log(`[Passkey] Verified user exists in DB: ${fullUserIdString}`);

    // TODO: Optional: Verify the credential used against stored credentials

    // 4. Return user object and string ID (Session creation happens in API route now)
    return { user, userIdString: fullUserIdString };
  } catch (error) {
    console.error(
      "[Passkey] Login finalization or user verification failed:",
      error
    );
    // throw new Error("Passkey login finalization or user verification failed.");
    return null; // Return null on failure
  }
}

// --- Helper Functions ---

// RESTORE getUserFromRequest (though maybe not needed if using middleware)
// Function to get user from request context (e.g., session cookie)
/* // Keep commented out for now
export async function getUserFromRequest(
  request: Request
): Promise<User | null> {
  // ... old manual cookie parsing ...
  // ... called old getUserFromSession ...
}
*/
