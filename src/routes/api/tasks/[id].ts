import { APIEvent } from "@solidjs/start/server";
import { getUserSession } from "~/lib/auth";
import { getSurrealConnection } from "~/lib/surreal";
import { Task, taskSchema } from "~/lib/schema";
import { RecordId } from "surrealdb";

const JSON_HEADER = { headers: { "Content-Type": "application/json" } };

// Helper to get task and check ownership
async function getTaskAndCheckAuth(
  taskId: string,
  sessionUserId: string
): Promise<{ task: Task | null; error?: Response }> {
  const db = await getSurrealConnection();
  const [tableName, recordUuid] = taskId.includes(":")
    ? taskId.split(":", 2)
    : ["task", taskId];
  if (!tableName || !recordUuid) {
    return {
      task: null,
      error: new Response(
        JSON.stringify({ message: "Invalid Task ID format" }),
        { ...JSON_HEADER, status: 400 }
      ),
    };
  }
  const taskRecordIdObject = new RecordId(tableName, recordUuid);

  try {
    const task = await db.select<Task>(taskRecordIdObject);

    if (!task) {
      return {
        task: null,
        error: new Response(JSON.stringify({ message: "Task not found" }), {
          ...JSON_HEADER,
          status: 404,
        }),
      };
    }

    const parsedTask = taskSchema.safeParse(task);
    if (!parsedTask.success) {
      console.error(
        `[API Tasks ${taskId}] Fetched task failed validation:`,
        parsedTask.error
      );
      return {
        task: null,
        error: new Response(
          JSON.stringify({ message: "Failed to validate fetched task" }),
          { ...JSON_HEADER, status: 500 }
        ),
      };
    }
    const validatedTask = parsedTask.data;

    const authorStringId = `${validatedTask.author.tb}:${validatedTask.author.id}`;
    if (authorStringId !== sessionUserId) {
      console.warn(
        `[API Tasks ${taskId}] Auth check failed: Task author ${authorStringId} != Session user ${sessionUserId}`
      );
      return {
        task: null,
        error: new Response(
          JSON.stringify({ message: "Forbidden: You do not own this task" }),
          { ...JSON_HEADER, status: 403 }
        ),
      };
    }
    return { task: validatedTask };
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
  const session = await getUserSession();
  const userId = session.data.userId;
  if (!userId) {
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
  const [tableName, recordUuid] = taskId.includes(":")
    ? taskId.split(":", 2)
    : ["task", taskId];
  if (!tableName || !recordUuid) {
    return new Response(JSON.stringify({ message: "Invalid Task ID format" }), {
      ...JSON_HEADER,
      status: 400,
    });
  }
  const taskRecordIdObject = new RecordId(tableName, recordUuid);

  const { task, error: fetchError } = await getTaskAndCheckAuth(taskId, userId);
  if (fetchError) return fetchError;
  if (!task) {
    return new Response(
      JSON.stringify({ message: "Task not found or access denied" }),
      { ...JSON_HEADER, status: 404 }
    );
  }

  try {
    const payload = await request.json();

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

    const updateData = {
      ...validationResult.data,
      updatedAt: new Date().toISOString(),
    };

    const db = await getSurrealConnection();
    const updatedRecords = await db.merge(taskRecordIdObject, updateData);
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
  const session = await getUserSession();
  const userId = session.data.userId;
  if (!userId) {
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
  const [tableName, recordUuid] = taskId.includes(":")
    ? taskId.split(":", 2)
    : ["task", taskId];
  if (!tableName || !recordUuid) {
    return new Response(JSON.stringify({ message: "Invalid Task ID format" }), {
      ...JSON_HEADER,
      status: 400,
    });
  }
  const taskRecordIdObject = new RecordId(tableName, recordUuid);

  const { error: fetchError } = await getTaskAndCheckAuth(taskId, userId);
  if (fetchError) return fetchError;

  try {
    const db = await getSurrealConnection();
    await db.delete(taskRecordIdObject);

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
