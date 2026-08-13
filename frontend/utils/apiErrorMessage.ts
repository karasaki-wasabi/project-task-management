const INCOMPLETE_CHILDREN_PREFIX = "Task has incomplete children";
const INCOMPLETE_CHILDREN_MESSAGE =
  "未完了の子タスクがあるため完了にできません。子タスクを完了または中止してください。";

function stringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || !(key in value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.length > 0 ? field : null;
}

function fetchErrorBody(caught: unknown): string | null {
  if (!caught || typeof caught !== "object" || !("data" in caught)) return null;
  return stringField(caught.data, "error") ?? stringField(caught.data, "message");
}

function userFacingApiError(message: string): string {
  if (message.startsWith(INCOMPLETE_CHILDREN_PREFIX)) {
    return INCOMPLETE_CHILDREN_MESSAGE;
  }
  return message;
}

export function apiErrorMessage(caught: unknown): string {
  const body = fetchErrorBody(caught);
  if (body) return userFacingApiError(body);
  if (caught instanceof Error && caught.message.length > 0) {
    return userFacingApiError(caught.message);
  }
  return String(caught);
}
