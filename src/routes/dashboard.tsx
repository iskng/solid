import { createSignal, Show } from "solid-js";
import { createAsync, type RouteDefinition } from "@solidjs/router";
import { getUserQuery } from "~/lib/queries";
import type { User } from "~/lib/schema";
import { isServer } from "solid-js/web"; // Import isServer

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

// Define route using the query for data fetching
export const route = {
  load: () => getUserQuery(),
} satisfies RouteDefinition;

export default function DashboardPage() {
  const user = createAsync(() => getUserQuery());
  const [isLoading, setIsLoading] = createSignal(false);
  const [message, setMessage] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  // --- SSR Logging ---
  if (isServer) {
    console.log("[SSR Dashboard] Rendering DashboardPage component.");
    console.log(
      "[SSR Dashboard] User data (initial from createAsync):",
      user()
    );
  }
  // --- End SSR Logging ---

  const registerPasskey = async () => {
    setIsLoading(true);
    setMessage(null);
    setError(null);
    try {
      // 1. Start registration on server
      const startResponse = await fetch("/api/passkeys/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: true }),
      });

      if (!startResponse.ok) {
        const errData = await startResponse.json();
        throw new Error(
          errData.message || "Failed to start passkey registration."
        );
      }
      const { createOptions } = await startResponse.json();

      // 2. Use browser API via webauthn-json
      // Ensure @github/webauthn-json is imported/available
      const { get } = await import("@github/webauthn-json");
      const credential = await get(createOptions);

      // 3. Finish registration on server
      const finishResponse = await fetch("/api/passkeys/register", {
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
      <Show
        when={user()}
        fallback={
          // --- SSR Logging ---
          (() => {
            if (isServer) {
              console.log(
                "[SSR Dashboard] Rendering fallback (user not loaded/logged in)."
              );
            }
            return <p>Loading user data or not logged in...</p>;
          })()
          // --- End SSR Logging ---
          /* TODO: Add redirect logic using useNavigate if user() === null */
        }
      >
        {/* --- SSR Logging ---
        {(() => {
          if (isServer) {
            console.log("[SSR Dashboard] Rendering main content (user loaded).");
            console.log("[SSR Dashboard] User data in main content:", user());
          }
        })()} 
        --- End SSR Logging --- */}
        {/* Log inside the Show block if necessary - commented out for now to reduce noise */}
        <div class="card bg-base-100 shadow-xl mb-6">
          <div class="card-body">
            <h2 class="card-title">
              Welcome, {user()?.name || user()?.email}!
            </h2>
            <p>User ID: {user()?.id.id}</p>
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
      </Show>
    </div>
  );
}
