export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function toUserErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }

  // Never expose raw database / provider errors to end users.
  return "Something went wrong. Please try again.";
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionFail(
  code: string,
  message: string,
): ActionResult<never> {
  return { ok: false, error: { code, message } };
}
