import { createSignal, Show, type Component, Suspense } from "solid-js";
import {
  A,
  useNavigate,
  type RouteDefinition,
  createAsync,
  redirect,
} from "@solidjs/router";
import { getUserSession, getUserById } from "~/lib/auth"; // Import session and user fetcher
import type { User } from "~/lib/schema";
import { isServer } from "solid-js/web";

// Define the expected shape of the data from the loader
type DashboardData = {
  id: string; // "user:<id>"
  email: string;
  name?: string | null; // Allow name to be optional or null
} | null;

// Basic Button component (replace with DaisyUI)
const Button = (props: any) => (
  <button
    {...props}
    class={`btn ${props.class || ""} ${props.disabled ? "btn-disabled" : ""}`}
  >
    {" "}
    {props.children}{" "}
  </button>
);

// Route definition without data loading logic
export const route = {
  // Preload is optional with createAsync, but can remain if desired
  // async preload() {
  //   // We can't easily call the inline server function for true preload
  //   // Preloading might require a separate exported server function if needed.
  // }
} satisfies RouteDefinition;

export default function DashboardPage() {
  // Define and call the server function inline with createAsync
  const userData = createAsync(async () => {
    "use server";
    // Moved logic from loadDashboardData here
    console.log("[createAsync Dashboard] Fetching user session...");
    const session = await getUserSession();
    const userIdString = session.data.userId;

    if (!userIdString) {
      console.log(
        "[createAsync Dashboard] No user ID in session, redirecting to login."
      );
      throw redirect("/login");
    }

    console.log(
      `[createAsync Dashboard] Fetching DB user details for ${userIdString}`
    );
    const user = await getUserById(userIdString);

    if (!user) {
      console.warn(
        `[createAsync Dashboard] User ${userIdString} from session not found in DB! Clearing session & redirecting.`
      );
      await session.clear();
      throw redirect("/login");
    }

    const data: DashboardData = {
      id: `${user.id.tb}:${user.id.id}`,
      email: user.email,
      name: user.name ?? null,
    };
    console.log("[createAsync Dashboard] Returning user data:", data);
    return data;
  });

  const navigate = useNavigate();

  const [isLoading, setIsLoading] = createSignal(false);
  const [message, setMessage] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  // --- SSR Logging --- (Keep if needed)
  if (isServer) {
    console.log("[SSR Dashboard] Rendering DashboardPage component.");
    // userData() should contain the resolved data on the server
    console.log("[SSR Dashboard] User data (from createAsync):", userData());
  }
  // --- End SSR Logging ---

  const registerPasskey = async () => {
    // ... passkey registration logic (needs update) ...
    // REVIEW: This still uses /api/passkeys/register which is likely deprecated/wrong
    // It should probably use a dedicated endpoint or modify the existing login/auth endpoint
    // to handle adding a key when already authenticated.
    setIsLoading(true);
    setMessage(null);
    setError(null);
    try {
      // 1. Start registration
      const startResponse = await fetch("/api/passkeys/register", {
        // <<-- THIS API NEEDS TO BE CHECKED/FIXED
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: true }),
      });
      // ... rest of registerPasskey ...
      if (!startResponse.ok) {
        const errData = await startResponse.json();
        throw new Error(
          errData.message || "Failed to start passkey registration."
        );
      }
      const { createOptions } = await startResponse.json();

      // 2. Use browser API
      // Switch to @simplewebauthn/browser for consistency?
      const { get } = await import("@github/webauthn-json");
      const credential = await get(createOptions);

      // 3. Finish registration on server
      const finishResponse = await fetch("/api/passkeys/register", {
        // <<-- THIS API NEEDS TO BE CHECKED/FIXED
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finish: true, credential }),
      });
      if (!finishResponse.ok) {
        const errData = await finishResponse.json();
        throw new Error(
          errData.message || "Failed to finish passkey registration."
        );
      }

      setMessage("Passkey registered successfully!");
    } catch (err: any) {
      console.error("Passkey registration error:", err);
      setError(err.message || "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div class="container mx-auto p-8">
      <h1 class="text-3xl font-bold mb-6">Dashboard</h1>
      {/* Use Suspense for loading state from createAsync */}
      <Suspense fallback={<p>Loading user...</p>}>
        {/* Check the resolved value of the signal */}
        <Show when={userData()}>
          {(user) => (
            // user() is the resolved data signal value (DashboardData)
            <>
              <div class="card bg-base-100 shadow-xl mb-6">
                <div class="card-body">
                  <h2 class="card-title">
                    {/* Check user() for null before accessing properties */}
                    Welcome, {user()?.name || user()?.email}!
                  </h2>
                  <p>User ID: {user()?.id}</p>
                </div>
              </div>

              <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                  <h2 class="card-title">Manage Passkeys</h2>
                  <p class="mb-4">
                    Register this device or a security key to sign in without
                    passwords.
                  </p>
                  <Button
                    onClick={registerPasskey}
                    class="btn-primary"
                    disabled={isLoading()}
                  >
                    {isLoading() ? (
                      <span class="loading loading-spinner"></span>
                    ) : (
                      "Register New Passkey"
                    )}
                  </Button>
                  {/* ... message/error display ... */}
                  <Show when={message()}>
                    <div class="alert alert-success shadow-lg mt-4">
                      <span>{message()}</span>
                    </div>
                  </Show>
                  <Show when={error()}>
                    <div class="alert alert-error shadow-lg mt-4">
                      <span>Error: {error()}</span>
                    </div>
                  </Show>
                </div>
              </div>
            </>
          )}
        </Show>
      </Suspense>
    </div>
  );
}
