/**
 * TODO(7): the "new task" form, validated with the SHARED schema.
 *
 *  Fields (each a real <label> connected to its control):
 *    "Title"     text input, starts ""
 *    "Priority"  <select> of TASK_PRIORITIES, starts "medium"
 *    "Due date"  <input type="date">, starts "" (send null when empty)
 *  Submit button "Add task"; while the mutation is pending it reads
 *  "Adding…" and is disabled.
 *
 *  On submit (button or Enter, no page reload):
 *    1. NewTaskSchema.safeParse(...) (../schemas/task). On failure, show each
 *       field's first message under the field (z.flattenError helps), set
 *       aria-invalid on the control and link the message with aria-describedby.
 *       Send nothing.
 *    2. On success: useCreateTask(projectId).mutate({ input: result.data,
 *       idempotencyKey: crypto.randomUUID() }). Reset the form when it succeeds.
 *  Errors from the server:
 *    - role="alert" "Could not create task: <message>"
 *    - ApiError.fieldErrors (e.g. { title: "..." }) shown under the field, just
 *      like client-side errors.
 *    - keep what the user typed.
 *  Editing a field clears that field's error.
 */
export function NewTaskForm(_props: { projectId: string }) {
  return (
    <form className="new-task">
      <p>TODO(7)</p>
    </form>
  );
}
