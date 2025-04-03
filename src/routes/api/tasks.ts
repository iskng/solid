import { APIEvent } from "@solidjs/start/server";
import { getUserFromRequest } from "~/lib/auth";
import { getSurrealConnection } from "~/lib/surreal";
import type { Task } from "~/lib/schema";
import { taskSchema } from "~/lib/schema"; // Import schema for validation
import { nanoid } from "nanoid";

const JSON_HEADER = { headers: { "Content-Type": "application/json" } };

export async function GET({ request }: APIEvent): Promise<Response> {
  // 1. Check authentication
  const user = await getUserFromRequest(request);
  if (!user) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      ...JSON_HEADER,
      status: 401,
    });
  }

  try {
    // 2. Fetch tasks authored by the logged-in user
    const db = await getSurrealConnection();
    // Use ->author field which links to the user record
    const query =
      "SELECT * FROM task WHERE author = $userId ORDER BY createdAt DESC;";
    const response: [{ result: Task[] }] = await db.query(query, {
      userId: user.id,
    });

    const tasks = response?.[0]?.result ?? [];

    // 3. Validate tasks (optional but good practice)
    const validatedTasks = tasks
      .map((task) => taskSchema.safeParse(task))
      .filter((result) => result.success)
      .map((result) => (result as { success: true; data: Task }).data);

    if (validatedTasks.length !== tasks.length) {
      console.warn("[API Tasks GET] Some tasks failed validation after fetch.");
      // Decide how to handle: return only valid, return error, etc.
    }

    return new Response(
      JSON.stringify({ success: true, data: validatedTasks }),
      {
        ...JSON_HEADER,
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[API Tasks GET] Error fetching tasks:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message || "Failed to fetch tasks",
      }),
      {
        ...JSON_HEADER,
        status: 500,
      }
    );
  }
}

export async function POST({ request }: APIEvent): Promise<Response> {
  // 1. Check authentication
  const user = await getUserFromRequest(request);
  if (!user) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      ...JSON_HEADER,
      status: 401,
    });
  }

  try {
    const payload = await request.json();

    // 2. Validate incoming task data (excluding id, author, timestamps)
    const taskInputSchema = taskSchema.omit({
      id: true,
      author: true,
      createdAt: true,
      updatedAt: true,
    });
    const validationResult = taskInputSchema.safeParse(payload);

    if (!validationResult.success) {
      console.error(
        "[API Tasks POST] Validation failed:",
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

    // 3. Prepare data for creation
    const taskId = `task:${nanoid(5)}`; // Generate short ID with prefix
    const taskData: Omit<Task, "id"> = {
      ...validationResult.data,
      author: user.id, // Link to the authenticated user
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 4. Create task in SurrealDB
    const db = await getSurrealConnection();
    const createdRecord = await db.create(taskId, taskData);
    const createdTask = taskSchema.safeParse(createdRecord?.[0]);

    if (!createdTask.success) {
      console.error("Created task data failed Zod parsing:", createdTask.error);
      throw new Error("Failed to parse created task from database.");
    }

    return new Response(
      JSON.stringify({ success: true, data: createdTask.data }),
      {
        ...JSON_HEADER,
        status: 201, // 201 Created
      }
    );
  } catch (error: any) {
    console.error("[API Tasks POST] Error creating task:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message || "Failed to create task",
      }),
      {
        ...JSON_HEADER,
        status: 500,
      }
    );
  }
}
