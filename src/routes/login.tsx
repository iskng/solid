import { A, useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";

// Import WebAuthn browser functions (if using a library)
// Or implement them directly
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

// Define expected response types from API (optional but helpful)
interface StartResponse {
  loginOptions?: PublicKeyCredentialRequestOptionsJSON;
  registrationOptions?: PublicKeyCredentialCreationOptionsJSON;
  userId?: string;
  isRegistering: boolean;
}

// Re-export PublicKeyCredential types from SimpleWebAuthn if needed
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/browser";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [registerUserId, setRegisterUserId] = createSignal<string | undefined>(
    undefined
  );

  const handlePasskeyAuth = async (event: Event) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    setRegisterUserId(undefined);

    if (!email()) {
      setError("Please enter your email address.");
      setIsLoading(false);
      return;
    }

    try {
      const startResp = await fetch("/api/passkeys/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: true, email: email() }),
      });

      if (!startResp.ok) {
        const errData = await startResp.json();
        if (startResp.status === 409) {
          setError(errData.message || "This email is already registered.");
        } else {
          setError(errData.message || "Failed to start passkey process.");
        }
        setIsLoading(false);
        return;
      }

      const startData: StartResponse = await startResp.json();

      let credentialResponse:
        | AuthenticationResponseJSON
        | RegistrationResponseJSON;

      if (startData.isRegistering) {
        console.log("Starting passkey registration flow...");
        if (!startData.registrationOptions) {
          throw new Error("Missing registration options from server.");
        }
        if (!startData.userId) {
          throw new Error("Missing userId from server for registration.");
        }
        setRegisterUserId(startData.userId);
        try {
          console.log(
            "[Client Registration] Options received from server:",
            startData.registrationOptions
          );
          const options = startData.registrationOptions;
          console.log(
            "[Client Registration] Challenge:",
            options?.challenge,
            typeof options?.challenge
          );
          console.log(
            "[Client Registration] User ID:",
            options?.user?.id,
            typeof options?.user?.id
          );

          credentialResponse = await startRegistration({
            optionsJSON: options,
          });
          console.log("Registration credential created:", credentialResponse);
        } catch (err: any) {
          console.error("WebAuthn startRegistration error:", err);
          setError(
            `Client-side registration error: ${
              err.message || "Unknown WebAuthn error"
            }`
          );
          setIsLoading(false);
          return;
        }
      } else {
        console.log("Starting passkey login flow...");
        if (!startData.loginOptions) {
          throw new Error("Missing login options from server.");
        }
        try {
          console.log(
            "[Client Login] Options received from server:",
            startData.loginOptions
          );
          credentialResponse = await startAuthentication({
            optionsJSON: startData.loginOptions,
          });
          console.log("Authentication credential created:", credentialResponse);
        } catch (err: any) {
          console.error("WebAuthn startAuthentication error:", err);
          if (err.name === "NotAllowedError") {
            setError("Passkey operation cancelled.");
          } else {
            setError(
              `Client-side login error: ${
                err.message || "Unknown WebAuthn error"
              }`
            );
          }
          setIsLoading(false);
          return;
        }
      }

      const finishPayload: any = {
        finish: true,
        credential: credentialResponse,
      };
      if (startData.isRegistering && registerUserId()) {
        finishPayload.userId = registerUserId();
      }

      console.log("Sending finish payload:", finishPayload);

      const finishResp = await fetch("/api/passkeys/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finishPayload),
      });

      if (!finishResp.ok) {
        const errData = await finishResp.json();
        throw new Error(
          errData.message || "Passkey authentication failed on server."
        );
      }

      console.log("Authentication successful!");
      navigate("/");
    } catch (err: any) {
      console.error("Passkey auth process error:", err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div class="flex justify-center items-center min-h-screen bg-base-200 p-4">
      <div class="card w-full max-w-sm bg-base-100 shadow-xl">
        <div class="card-body items-center text-center">
          <h1 class="card-title text-2xl mb-4">Login or Register</h1>
          <p class="mb-4 text-sm text-gray-600">
            Enter your email to login or register with a passkey.
          </p>
          <form onSubmit={handlePasskeyAuth} class="w-full flex flex-col gap-4">
            <div class="form-control w-full">
              <label class="label" for="email-input">
                <span class="label-text">Email</span>
              </label>
              <input
                id="email-input"
                name="email"
                type="email"
                placeholder="your@email.com"
                required
                class="input input-bordered w-full"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                disabled={isLoading()}
              />
            </div>
            <div class="card-actions justify-center mt-4 w-full">
              <button
                type="submit"
                class="btn btn-primary w-full"
                disabled={isLoading() || !email()}
              >
                {isLoading() ? (
                  <span class="loading loading-spinner"></span>
                ) : (
                  "Continue with Email"
                )}
              </button>
            </div>
            <Show when={error()}>
              <div
                class="alert alert-error mt-2"
                role="alert"
                id="error-message"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="stroke-current shrink-0 h-6 w-6"
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
                <span>{error()}</span>
              </div>
            </Show>
          </form>
          <A href="/register" class="link link-hover">
            Don't have an account? Register
          </A>
        </div>
      </div>
    </div>
  );
}
