import { query } from "@solidjs/router";
import { getTaskById, getAllTasks } from "./task-handlers"; // Import task handler

// --- Task Queries (Simplified - Auth check expected in routeData/calling context) ---

// Query to fetch a single task by ID
export const getTaskByIdQuery = query(async (taskId: string) => {
  "use server";
  if (!taskId) return null;
  console.log(
    `[Query getTaskByIdQuery] Fetching task ${taskId} (no auth check here).`
  );
  const response = await getTaskById(taskId);
  // We return the task regardless of owner here.
  // The routeData function should compare against the session user.
  return response.success ? response.data : null;
}, "taskById");

// Query to fetch all tasks (handler might filter internally? Needs review)
export const getAllTasksQuery = query(async () => {
  "use server";
  // Assuming getAllTasks handler fetches ALL tasks,
  // or is refactored to accept a userId if needed.
  // Filtering/auth should happen in routeData.
  console.log(
    "[Query getAllTasksQuery] Fetching all tasks (no auth check here)..."
  );
  const response = await getAllTasks();
  return response.success ? response.data : []; // Return empty array on failure
}, "allTasks");
