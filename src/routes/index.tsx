import { createAsync, type RouteDefinition } from "@solidjs/router";
import { getUser, logout } from "~/lib";
import { isServer } from "solid-js/web";

export const route = {
  preload() {
    getUser();
  },
} satisfies RouteDefinition;

export default function Home() {
  const user = createAsync(() => getUser(), { deferStream: true });

  if (isServer) {
    console.log("[SSR Home] Rendering Home component.");
    console.log("[SSR Home] User data (initial from createAsync):", user());
  }

  return (
    <main class="w-full p-4 space-y-2">
      <h2 class="font-bold text-3xl">Hello {user()?.email}</h2>
      <h3 class="font-bold text-xl">Message board</h3>
      <form action={logout} method="post">
        <button name="logout" type="submit">
          Logout
        </button>
      </form>
    </main>
  );
}
