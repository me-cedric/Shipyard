import { classify, type ErrorParts, errorMessage } from "@/lib/i18n/errors";
import type { ErrorAction, ErrorCode } from "./bindings";

type Result<T> = { status: "ok"; data: T } | { status: "error"; error: unknown };

/**
 * A failed command. `message` is the sentence of the error code in the language of the app, so a
 * view that shows `error.message` never shows a raw Rust text. `details` keeps the raw text.
 */
export class AppFailure extends Error implements ErrorParts {
	readonly code: ErrorCode;
	readonly details: string;
	readonly action: ErrorAction | null;

	constructor(parts: ErrorParts) {
		super(parts.details);
		this.name = "AppFailure";
		this.code = parts.code;
		this.details = parts.details;
		this.action = parts.action;
		Object.defineProperty(this, "message", { get: () => errorMessage(this) });
	}
}

/** The typed error of Rust, or a raw text that the mock throws: the same code table gives both a code. */
export function toFailure(error: unknown): AppFailure {
	if (error !== null && typeof error === "object" && "code" in error && "details" in error)
		return new AppFailure(error as ErrorParts);
	const details = error instanceof Error ? error.message : String(error);
	return new AppFailure({ ...classify(details), details });
}

/** Returns the data of a command result, or throws its `AppFailure`. */
export async function unwrap<T>(result: Promise<Result<T>>): Promise<T> {
	const r = await result;
	if (r.status === "error") throw toFailure(r.error);
	return r.data;
}
