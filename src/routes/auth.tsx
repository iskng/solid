import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { get } from "@github/webauthn-json";
import { isServer } from "solid-js/web"; // Import isServer

// Basic Button component (replace with DaisyUI later)
const Button = (props: any) => (
  <button
    {...props}
    class={`btn ${props.class || ""} ${props.disabled ? "btn-disabled" : ""}`}
  >
    {" "}
    {props.children}{" "}
  </button>
);

export default function AuthPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // --- SSR Logging ---
  if (isServer) {
    console.log("[SSR Auth] Rendering AuthPage component.");
    // We expect isLoading and error to be initial values (false, null) during SSR
    console.log(
      "[SSR Auth] Initial state: isLoading=",
      isLoading(),
      "error=",
      error()
    );
  }
  // --- End SSR Logging ---

  // --- Passkey Registration --- (Needs a trigger, e.g., after signup)
  // For now, let's assume the user exists and wants to register a passkey
  const registerPasskey = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Start registration on server (requires user to be logged in initially)
      // TODO: Implement an initial login/signup method first
      // For demo, we'll skip the initial login check here, but it's crucial!
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

      alert("Passkey registered successfully!"); // Simple feedback
    } catch (err: any) {
      console.error("Passkey registration error:", err);
      let friendlyMessage =
        "An unknown error occurred during passkey registration.";
      if (err.name === "NotAllowedError") {
        friendlyMessage = "Passkey registration cancelled or not allowed.";
      } else if (err.message) {
        friendlyMessage = err.message;
      }
      setError(friendlyMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Passkey Login ---
  const signInWithPasskey = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Start login on server
      const startResponse = await fetch("/api/passkeys/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: true }),
      });

      if (!startResponse.ok) {
        const errData = await startResponse.json();
        throw new Error(errData.message || "Failed to start passkey login.");
      }
      const { loginOptions } = await startResponse.json();

      // 2. Use browser API via webauthn-json
      // Important: webauthn-json's get() is used for both registration and login
      const credential = await get(loginOptions);

      // 3. Finish login on server
      const finishResponse = await fetch("/api/passkeys/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send the *result* of get() to the finish endpoint
        body: JSON.stringify({ finish: true, options: credential }),
      });

      if (!finishResponse.ok) {
        const errData = await finishResponse.json();
        throw new Error(errData.message || "Failed to finish passkey login.");
      }

      console.log("User logged in with passkey");
      navigate("/dashboard"); // Navigate to dashboard page
    } catch (err: any) {
      console.error("Passkey login error:", err);
      let friendlyMessage = "An unknown error occurred during passkey login.";
      if (err.name === "NotAllowedError") {
        friendlyMessage =
          "Passkey operation cancelled or not allowed by the authenticator.";
      } else if (err.message) {
        friendlyMessage = err.message;
      }
      setError(friendlyMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // --- SSR Logging ---
  if (isServer) {
    console.log(
      "[SSR Auth] Finished rendering AuthPage component logic (before return)."
    );
  }
  // --- End SSR Logging ---

  return (
    <div class="flex items-center justify-center min-h-screen bg-base-200">
      <div class="card w-96 bg-base-100 shadow-xl">
        <div class="card-body items-center text-center">
          <h1 class="card-title text-2xl font-bold mb-4">Sign In / Register</h1>
          <p class="mb-6 text-base-content/70">
            Use your device's passkey (like Face ID, Touch ID, or security key)
            to sign in securely.
          </p>

          {/* Login Button */}
          <Button
            onClick={signInWithPasskey}
            class="btn-primary w-full mb-4"
            disabled={isLoading()}
          >
            {isLoading() ? (
              <span class="loading loading-spinner"></span>
            ) : (
              "Sign In with Passkey"
            )}
          </Button>

          {/* Registration Button - Add logic to show this only when appropriate */}
          {/* <Button 
                        onClick={registerPasskey} 
                        class="btn-secondary w-full"
                        disabled={isLoading()}
                    >
                        {isLoading() ? <span class="loading loading-spinner"></span> : 'Register New Passkey'}
                    </Button> */}

          <Show when={error()}>
            <div class="alert alert-error shadow-lg mt-4">
              <div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="stroke-current flex-shrink-0 h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>Error: {error()}</span>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
