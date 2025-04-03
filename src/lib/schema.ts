import { z } from "zod";

// --- SurrealDB RecordId Object Schema ---
// Defines the shape { tb: string, id: string }
const recordIdObjectSchema = z.object({
  tb: z.string(),
  id: z.string(),
});
// --- End RecordId Object Schema ---

// Helper for SurrealDB Record Links (e.g., user:abc)
// Now validates the RecordId object structure
export function recordLink<T extends string = string>(table?: T) {
  return recordIdObjectSchema.refine(
    (val) => (table ? val.tb === table : true), // Check if table name matches if provided
    {
      message: table
        ? `Record link must belong to table '${table}'.`
        : "Invalid table.",
    }
  );
}

// User Schema
export const userSchema = z.object({
  id: recordLink("user").readonly(), // Now expects {tb:"user", id:...}, transforms to "user:..."
  email: z.string().email().readonly(),
  name: z.string().optional().nullable().readonly(),
  // image: z.string().url().optional().readonly(),
  // Add other fields as needed, e.g., timestamps
  // createdAt: z.string().datetime().optional().readonly(), // Or z.date()
  // updatedAt: z.string().datetime().optional().readonly(),
  // Store associated passkey info (consider how to model this securely)
  // passkeys: z.array(z.object({...})).optional()
});

// Task Schema
export const taskSchema = z.object({
  id: recordLink("task").readonly().optional(), // Format: task:xyz, optional for creation
  title: z.string().min(2, "Title must be at least 2 characters"),
  description: z.string().optional(),
  status: z.enum(["todo", "inprogress", "done", "canceled"], {
    required_error: "Status is required.",
  }),
  label: z.enum(["bug", "feature", "documentation"], {
    required_error: "Label is required.",
  }),
  priority: z.enum(["low", "moderate", "high"], {
    required_error: "Priority is required.",
  }),
  author: recordLink("user"), // Link to the user who created the task
  createdAt: z.string().datetime().optional().readonly(),
  updatedAt: z.string().datetime().optional().readonly(),
});

// Session Schema
export const sessionSchema = z.object({
  id: recordLink("session").readonly(), // Format: session:uuid
  userId: recordLink("user"), // Link to the user
  expiresAt: z.string().datetime(), // Or z.date()
  // Add other session data if needed (e.g., user agent, IP)
});

// Passkey Credential Schema (adjust based on actual credential structure)
// Store the relevant fields needed for verification or management
export const passkeySchema = z.object({
  id: recordLink("passkey").readonly(), // Will expect {tb:"passkey", id:...}
  userId: z.string().refine((val) => val.startsWith("user:"), {
    message: "Passkey userId must be a valid user record link string.",
  }),
  credentialId: z.string(), // The actual ID of the credential (often base64)
  publicKey: z.string(), // The public key (often base64)
  transports: z.array(z.string()).optional(), // e.g., ["internal", "usb", "nfc", "ble"]
  counter: z.number().optional(), // Signature counter
  // Store the full credential if needed, but be mindful of size/security
  // fullCredential: z.any().optional(),
  createdAt: z.string().datetime().optional().readonly(),
});

export type User = z.infer<typeof userSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Passkey = z.infer<typeof passkeySchema>;
