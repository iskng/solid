import { Show, createEffect, createSignal, type Component } from "solid-js";
import { createForm } from "@tanstack/solid-form";
import { z } from "zod";
import { Task, taskSchema } from "~/lib/schema";
import { createTask, updateTaskById } from "~/lib/task-handlers"; // Use path alias
import { useNavigate } from "@solidjs/router";

// Define the shape of the form values locally
const formInputSchema = taskSchema.omit({
  id: true,
  author: true,
  createdAt: true,
  updatedAt: true,
});
type TaskFormData = z.infer<typeof formInputSchema>;

interface TaskFormProps {
  // Pass existing task data if editing
  editRecord?: Task | null;
  onSuccess?: () => void; // Optional callback on success
}

export const TaskForm: Component<TaskFormProps> = (props) => {
  const navigate = useNavigate();
  const [serverError, setServerError] = createSignal<string | null>(null);

  // Define default values separately
  const defaultTaskValues: TaskFormData = props.editRecord
    ? {
        // Edit values
        title: props.editRecord.title,
        description: props.editRecord.description || "",
        status: props.editRecord.status,
        label: props.editRecord.label,
        priority: props.editRecord.priority,
      }
    : {
        // Create values
        title: "",
        description: "",
        status: "todo",
        label: "feature",
        priority: "moderate",
      };

  // Remove generic, pass calculated defaults
  const form = createForm(() => ({
    defaultValues: defaultTaskValues,
    onSubmit: async ({ value }: { value: TaskFormData }) => {
      setServerError(null);
      try {
        let response;
        if (props.editRecord?.id) {
          // Update existing task
          response = await updateTaskById(props.editRecord.id, value);
        } else {
          // Create new task
          response = await createTask(value);
        }

        if (!response.success) {
          // Handle API errors (validation or server errors)
          setServerError(response.message || "An unknown API error occurred.");
          // TODO: Potentially map response.errors back to form fields
          console.error("API Error:", response);
          return; // Prevent navigation/callback
        }

        // Optional: Call success callback
        props.onSuccess?.();

        // Redirect or handle success (e.g., close modal)
        navigate("/"); // Go back to homepage after success
      } catch (error: any) {
        console.error("Form submission error:", error);
        setServerError(error.message || "An unexpected error occurred.");
      }
    },
  }));

  // Update createEffect to use defaultTaskValues if props.editRecord is null/undefined
  createEffect(() => {
    const record = props.editRecord;
    if (record) {
      form.setFieldValue("title", record.title);
      form.setFieldValue("description", record.description || "");
      form.setFieldValue("status", record.status);
      form.setFieldValue("label", record.label);
      form.setFieldValue("priority", record.priority);
    } else {
      // Reset form to initial defaults
      form.reset(); // Call without arguments
    }
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      class="space-y-6"
    >
      <Show when={serverError()}>
        <div class="alert alert-error shadow-lg">
          <span>Server Error: {serverError()}</span>
        </div>
      </Show>

      {/* Title Field - Pass Zod schema part */}
      <form.Field
        name="title"
        validators={{ onChange: formInputSchema.shape.title }}
        children={(field) => (
          <div class="form-control">
            <label class="label" for={field().name}>
              {" "}
              <span class="label-text">Title</span>{" "}
            </label>
            <input
              id={field().name}
              name={field().name}
              type="text"
              value={field().state.value}
              onBlur={field().handleBlur}
              onInput={(e) => field().handleChange(e.currentTarget.value)}
              placeholder="Enter task title"
              class="input input-bordered w-full"
              required
            />
            <Show when={field().state.meta.errors?.length}>
              <label class="label">
                <span class="label-text-alt text-error">
                  {field().state.meta.errors?.[0]?.message}
                </span>
              </label>
            </Show>
          </div>
        )}
      />

      {/* Description Field - Pass Zod schema part */}
      <form.Field
        name="description"
        validators={{ onChange: formInputSchema.shape.description }}
        children={(field) => (
          <div class="form-control">
            <label class="label" for={field().name}>
              {" "}
              <span class="label-text">Description (Optional)</span>{" "}
            </label>
            <textarea
              id={field().name}
              name={field().name}
              value={field().state.value}
              onBlur={field().handleBlur}
              onInput={(e) => field().handleChange(e.currentTarget.value)}
              placeholder="Enter a brief description"
              class="textarea textarea-bordered w-full resize-none h-24"
            />
            <Show when={field().state.meta.errors?.length}>
              <label class="label">
                <span class="label-text-alt text-error">
                  {field().state.meta.errors?.[0]?.message}
                </span>
              </label>
            </Show>
          </div>
        )}
      />

      {/* Status Field - Pass Zod schema part */}
      <form.Field
        name="status"
        validators={{ onChange: formInputSchema.shape.status }}
        children={(field) => (
          <div class="form-control">
            <label class="label">
              <span class="label-text">Status</span>
            </label>
            <select
              id={field().name}
              name={field().name}
              value={field().state.value}
              onBlur={field().handleBlur}
              onChange={(e) =>
                field().handleChange(
                  e.currentTarget.value as TaskFormData["status"]
                )
              }
              class="select select-bordered w-full"
            >
              <option value="todo">Todo</option>
              <option value="inprogress">In Progress</option>
              <option value="done">Done</option>
              <option value="canceled">Canceled</option>
            </select>
            <Show when={field().state.meta.errors?.length}>
              <label class="label">
                <span class="label-text-alt text-error">
                  {field().state.meta.errors?.[0]?.message}
                </span>
              </label>
            </Show>
          </div>
        )}
      />

      {/* Label Field - Pass Zod schema part */}
      <form.Field
        name="label"
        validators={{ onChange: formInputSchema.shape.label }}
        children={(field) => (
          <div class="form-control">
            <label class="label">
              <span class="label-text">Label</span>
            </label>
            <select
              id={field().name}
              name={field().name}
              value={field().state.value}
              onBlur={field().handleBlur}
              onChange={(e) =>
                field().handleChange(
                  e.currentTarget.value as TaskFormData["label"]
                )
              }
              class="select select-bordered w-full"
            >
              <option value="bug">Bug</option>
              <option value="feature">Feature</option>
              <option value="documentation">Documentation</option>
            </select>
            <Show when={field().state.meta.errors?.length}>
              <label class="label">
                <span class="label-text-alt text-error">
                  {field().state.meta.errors?.[0]?.message}
                </span>
              </label>
            </Show>
          </div>
        )}
      />

      {/* Priority Field - Pass Zod schema part */}
      <form.Field
        name="priority"
        validators={{ onChange: formInputSchema.shape.priority }}
        children={(field) => (
          <div class="form-control">
            <label class="label">
              <span class="label-text">Priority</span>
            </label>
            <select
              id={field().name}
              name={field().name}
              value={field().state.value}
              onBlur={field().handleBlur}
              onChange={(e) =>
                field().handleChange(
                  e.currentTarget.value as TaskFormData["priority"]
                )
              }
              class="select select-bordered w-full"
            >
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
            </select>
            <Show when={field().state.meta.errors?.length}>
              <label class="label">
                <span class="label-text-alt text-error">
                  {field().state.meta.errors?.[0]?.message}
                </span>
              </label>
            </Show>
          </div>
        )}
      />

      {/* Submit Button */}
      <div class="flex justify-end mt-8">
        <button
          type="submit"
          class="btn btn-primary"
          disabled={form.state.isSubmitting}
        >
          <Show when={form.state.isSubmitting}>
            <span class="loading loading-spinner loading-sm mr-2"></span>
          </Show>
          {props.editRecord ? "Update Task" : "Create Task"}
        </button>
      </div>
    </form>
  );
};
