import type { Task } from "./schema";

// Base URL for the API - assumes running on the same origin
// Use VITE_PUBLIC_BASE_URL if needed for different origins
const API_BASE = "/api/tasks";

// Helper for API responses
type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  errors?: any;
};

// Fetch all tasks for the current user
export const getAllTasks = async (): Promise<ApiResponse<Task[]>> => {
  try {
    const response = await fetch(API_BASE);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to fetch tasks");
    return data;
  } catch (error: any) {
    console.error("Error fetching tasks:", error);
    return { success: false, message: error.message };
  }
};

// Create a new task
export const createTask = async (
  payload: Omit<Task, "id" | "author" | "createdAt" | "updatedAt">
): Promise<ApiResponse<Task>> => {
  try {
    const response = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to create task");
    return data;
  } catch (error: any) {
    console.error("Error creating task:", error);
    return { success: false, message: error.message, errors: error.errors }; // Pass validation errors if available
  }
};

// Fetch a single task by ID (potentially needed for edit page)
export const getTaskById = async (id: string): Promise<ApiResponse<Task>> => {
  const taskId = id.includes(":") ? id.split(":")[1] : id;
  try {
    const response = await fetch(`${API_BASE}/${taskId}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to fetch task");
    return data;
  } catch (error: any) {
    console.error(`Error fetching task ${taskId}:`, error);
    return { success: false, message: error.message };
  }
};

// Update a task by ID
export const updateTaskById = async (
  id: string,
  payload: Partial<Omit<Task, "id" | "author" | "createdAt" | "updatedAt">>
): Promise<ApiResponse<Task>> => {
  const taskId = id.includes(":") ? id.split(":")[1] : id;
  try {
    const response = await fetch(`${API_BASE}/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to update task");
    return data;
  } catch (error: any) {
    console.error(`Error updating task ${taskId}:`, error);
    return { success: false, message: error.message, errors: error.errors };
  }
};

// Delete a task by ID
export const deleteTaskById = async (
  id: string
): Promise<ApiResponse<null>> => {
  const taskId = id.includes(":") ? id.split(":")[1] : id;
  try {
    const response = await fetch(`${API_BASE}/${taskId}`, {
      method: "DELETE",
    });
    // DELETE returns 204 No Content on success, which has no body
    if (!response.ok) {
      // Try to parse error message if available (e.g., 403, 404, 500)
      let errorData = {
        message: `Failed to delete task (status ${response.status})`,
      };
      try {
        errorData = await response.json();
      } catch (_) {
        /* Ignore if no body */
      }
      throw new Error(errorData.message);
    }
    return { success: true };
  } catch (error: any) {
    console.error(`Error deleting task ${taskId}:`, error);
    return { success: false, message: error.message };
  }
};
