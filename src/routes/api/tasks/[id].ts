import { APIEvent } from "@solidjs/start/server";
import { getUserFromRequest } from "~/lib/auth";
import { getSurrealConnection } from "~/lib/surreal";
import { Task, taskSchema } from "~/lib/schema";

const JSON_HEADER = { headers: { "Content-Type": "application/json" } };

// Helper to get task and check ownership
async function getTaskAndCheckAuth(
  taskId: string,
  userId: string
): Promise<{ task: Task | null; error?: Response }> {
  const db = await getSurrealConnection();
  const taskRecordId = taskId.includes(":") ? taskId : `task:${taskId}`;
  try {
    const result = await db.select<Task>(taskRecordId);
    const task = result?.[0];

    if (!task) {
      return {
        task: null,
        error: new Response(JSON.stringify({ message: "Task not found" }), {
          ...JSON_HEADER,
          status: 404,
        }),
      };
    }
    if (task.author !== userId) {
      return {
        task: null,
        error: new Response(
          JSON.stringify({ message: "Forbidden: You do not own this task" }),
          { ...JSON_HEADER, status: 403 }
        ),
      };
    }
    return { task };
  } catch (e) {
    console.error(`[API Tasks ${taskId}] Error fetching task:`, e);
    return {
      task: null,
      error: new Response(JSON.stringify({ message: "Failed to fetch task" }), {
        ...JSON_HEADER,
        status: 500,
      }),
    };
  }
}

// PATCH /api/tasks/:id
export async function PATCH({ request, params }: APIEvent): Promise<Response> {
  const user = await getUserFromRequest(request);
  if (!user) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      ...JSON_HEADER,
      status: 401,
    });
  }

  const taskId = params.id;
  if (!taskId) {
    return new Response(JSON.stringify({ message: "Task ID missing in URL" }), {
      ...JSON_HEADER,
      status: 400,
    });
  }
  const taskRecordId = taskId.includes(":") ? taskId : `task:${taskId}`;

  // 1. Get existing task and check auth
  const { task, error: fetchError } = await getTaskAndCheckAuth(
    taskId,
    user.id
  );
  if (fetchError) return fetchError;
  if (!task) {
    // Should be caught by fetchError, but belt-and-suspenders
    return new Response(
      JSON.stringify({ message: "Task not found or access denied" }),
      { ...JSON_HEADER, status: 404 }
    );
  }

  try {
    const payload = await request.json();

    // 2. Validate incoming update data (allow partial updates)
    // Allow any subset of the editable fields
    const taskUpdateSchema = taskSchema.partial().omit({
      id: true,
      author: true,
      createdAt: true,
      updatedAt: true,
    });
    const validationResult = taskUpdateSchema.safeParse(payload);

    if (!validationResult.success) {
      console.error(
        `[API Tasks PATCH ${taskId}] Validation failed:`,
        validationResult.error.flatten()
      );
      return new Response(
        JSON.stringify({
          message: "Validation failed",
          errors: validationResult.error.flatten().fieldErrors,
        }),
        { ...JSON_HEADER, status: 400 }
      );
    }

    if (Object.keys(validationResult.data).length === 0) {
      return new Response(
        JSON.stringify({ message: "No valid fields provided for update" }),
        { ...JSON_HEADER, status: 400 }
      );
    }

    // 3. Prepare data for update (merge does a partial update)
    const updateData = {
      ...validationResult.data,
      updatedAt: new Date().toISOString(), // Always update timestamp
    };

    // 4. Update task in SurrealDB using MERGE
    const db = await getSurrealConnection();
    // merge returns the merged record
    const updatedRecords = await db.merge(taskRecordId, updateData);
    const parsedUpdatedTask = taskSchema.safeParse(updatedRecords?.[0]);

    if (!parsedUpdatedTask.success) {
      console.error(
        `Updated task data failed Zod parsing: ${parsedUpdatedTask.error}`
      );
      throw new Error("Failed to parse updated task from database.");
    }

    return new Response(
      JSON.stringify({ success: true, data: parsedUpdatedTask.data }),
      { ...JSON_HEADER, status: 200 }
    );
  } catch (error: any) {
    console.error(`[API Tasks PATCH ${taskId}] Error updating task:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message || "Failed to update task",
      }),
      { ...JSON_HEADER, status: 500 }
    );
  }
}

// DELETE /api/tasks/:id
export async function DELETE({ request, params }: APIEvent): Promise<Response> {
  const user = await getUserFromRequest(request);
  if (!user) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      ...JSON_HEADER,
      status: 401,
    });
  }

  const taskId = params.id;
  if (!taskId) {
    return new Response(JSON.stringify({ message: "Task ID missing in URL" }), {
      ...JSON_HEADER,
      status: 400,
    });
  }
  const taskRecordId = taskId.includes(":") ? taskId : `task:${taskId}`;

  // 1. Get existing task and check auth
  const { task, error: fetchError } = await getTaskAndCheckAuth(
    taskId,
    user.id
  );
  if (fetchError) return fetchError;
  if (!task) {
    return new Response(
      JSON.stringify({ message: "Task not found or access denied" }),
      { ...JSON_HEADER, status: 404 }
    );
  }

  try {
    // 2. Delete task from SurrealDB
    const db = await getSurrealConnection();
    await db.delete(taskRecordId);

    // Return 204 No Content on successful deletion
    return new Response(null, { status: 204 });
  } catch (error: any) {
    console.error(`[API Tasks DELETE ${taskId}] Error deleting task:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message || "Failed to delete task",
      }),
      { ...JSON_HEADER, status: 500 }
    );
  }
}
