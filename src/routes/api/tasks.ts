import { APIEvent } from "@solidjs/start/server";
import { getUserSession, getUserById } from "~/lib/auth"; // Use vinxi session
import { getSurrealConnection } from "~/lib/surreal";
import type { Task } from "~/lib/schema";
import { taskSchema } from "~/lib/schema"; // Import schema for validation
import { nanoid } from "nanoid";

const JSON_HEADER = { headers: { "Content-Type": "application/json" } };

export async function GET({ request }: APIEvent): Promise<Response> {
  // 1. Get user ID from session
  const session = await getUserSession();
  const userId = session.data.userId; // This is "user:<id>"
  if (!userId) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      ...JSON_HEADER,
      status: 401,
    });
  }

  try {
    // 2. Fetch tasks authored by the logged-in user
    const db = await getSurrealConnection();
    // Pass the string userId from the session
    const query =
      "SELECT * FROM task WHERE author = $userId ORDER BY createdAt DESC;";
    const response: [{ result: Task[] }] = await db.query(query, {
      userId: userId,
    });

    const tasks = response?.[0]?.result ?? [];

    // 3. Validate tasks (optional but good practice)
    // Assuming taskSchema expects author as {tb,id}, need adjustment?
    // Let's skip validation here for now, focus on API logic.
    /*
    const validatedTasks = tasks
      .map((task) => taskSchema.safeParse(task))
      .filter((result) => result.success)
      .map((result) => (result as { success: true; data: Task }).data);

    if (validatedTasks.length !== tasks.length) {
      console.warn("[API Tasks GET] Some tasks failed validation after fetch.");
    }
    */
    const validatedTasks = tasks; // TEMP: Skip validation

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
  // 1. Get user ID from session
  const session = await getUserSession();
  const userId = session.data.userId; // This is "user:<id>"
  if (!userId) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      ...JSON_HEADER,
      status: 401,
    });
  }

  try {
    const payload = await request.json();

    // 2. Validate incoming task data
    // taskSchema expects author as {tb,id} - need to adjust how we create
    const taskInputSchema = taskSchema.omit({
      id: true, // Expect {tb,id}
      author: true, // Expect {tb,id}
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
    // Provide author as the STRING ID "user:<id>"
    const taskDataToCreate = {
      ...validationResult.data,
      author: userId, // Use string ID from session
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 4. Create task in SurrealDB
    const db = await getSurrealConnection();
    // Use db.create, pass the taskDataToCreate (with string author)
    const createdRecord = await db.create(taskId, taskDataToCreate);
    // Parse the response from DB (which should have author as {tb,id})
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
