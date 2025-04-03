import { query, cache } from "@solidjs/router";
import { getUserFromRequest } from "./auth"; // Use relative path
import { getTaskById, getAllTasks } from "./task-handlers"; // Import task handler

// Make argument optional for preload, but expect it during createAsync
export const getUserQuery = query(async (event?: { request: Request }) => {
  "use server"; // Ensures this async function runs only on the server

  // Request might not be available during preload
  if (!event?.request) {
    console.warn("[Query getUserQuery] Preload call - no request context.");
    // Decide what to return during preload without context - maybe null?
    return null;
  }

  console.log("[Query getUserQuery] Fetching user session...");
  const user = await getUserFromRequest(event.request);
  console.log("[Query getUserQuery] User found:", !!user);
  return user;
}, "userSession"); // Provide a unique key for caching/refetching

// --- Task Queries ---

// Query to fetch a single task by ID
export const getTaskByIdQuery = query(
  async (taskId: string, event?: { request: Request }) => {
    "use server";

    // If called without event (e.g., from load), fetch without auth check first
    // Auth check will happen when called via createAsync with context
    if (!event?.request) {
      console.warn(
        `[Query getTaskByIdQuery] Called without request context for task ${taskId}. Fetching without auth check.`
      );
      const response = await getTaskById(taskId);
      return response.success ? response.data : null;
    }

    // If called with event, perform auth check
    if (!taskId) return null;
    const user = await getUserFromRequest(event.request);
    if (!user) return null;

    console.log(
      `[Query getTaskByIdQuery] Fetching task ${taskId} for user ${user.id} WITH auth check.`
    );
    const response = await getTaskById(taskId);

    if (response.success && response.data?.author !== user.id) {
      console.warn(
        `[Query getTaskByIdQuery] User ${user.id} tried to access task ${taskId} owned by ${response.data?.author}`
      );
      return null;
    }

    return response.success ? response.data : null;
  },
  "taskById"
);

// Query to fetch all tasks for the current user
export const getAllTasksQuery = query(async (event?: { request: Request }) => {
  "use server";
  if (!event?.request) return null;

  // Check auth implicitly via getUserFromRequest in getAllTasks handler
  console.log("[Query getAllTasksQuery] Fetching all tasks...");
  const response = await getAllTasks();
  return response.success ? response.data : []; // Return empty array on failure
}, "allTasks");
