import { classify, type ErrorParts, errorMessage } from "@/lib/i18n/errors";
import { logError } from "@/lib/log";
import type { ErrorAction, ErrorCode } from "./bindings";

type Result<T> = { status: "ok"; data: T } | { status: "error"; error: unknown };

/**
 * A failed command. `message` is the sentence of the error code in the language of the app.
 * `details` keeps the raw text; `ErrorNotice` shows it behind Details.
 */
export class AppFailure extends Error implements ErrorParts {
	readonly code: ErrorCode;
	readonly details: string;
	readonly action: ErrorAction | null;
	readonly own: boolean;

	constructor(parts: ErrorParts) {
		super(parts.details);
		this.name = "AppFailure";
		this.code = parts.code;
		this.details = parts.details;
		this.action = parts.action;
		this.own = parts.own ?? false;
		// A view that shows only this text has no Details control: an error with no code keeps its
		// raw text after the sentence, so the cause is never lost.
		Object.defineProperty(this, "message", {
			get: () =>
				this.code === "unknown" && !this.own && this.details
					? `${errorMessage(this)} (${this.details})`
					: errorMessage(this),
		});
	}
}

/**
 * The typed error of Rust, or a raw text that the mock throws: the same code table gives both a code.
 * `backend` is true for the error of a command (`unwrap`). A text or an `Error` from the interface
 * itself holds a sentence in the language of the person: it shows as written.
 */
export function toFailure(error: unknown, backend = false): AppFailure {
	if (error instanceof AppFailure) return error;
	const failure = build(error, backend);
	// A view that shows only the sentence still leaves the raw text in the log.
	if (failure.code === "unknown" && !failure.own) logError(failure.details);
	return failure;
}

function build(error: unknown, backend: boolean): AppFailure {
	if (error !== null && typeof error === "object" && "code" in error && "details" in error)
		return new AppFailure(error as ErrorParts);
	const details = error instanceof Error ? error.message : String(error);
	const parts = classify(details);
	return new AppFailure({ ...parts, details, own: !backend && parts.code === "unknown" });
}

/** Returns the data of a command result, or throws its `AppFailure`. */
export async function unwrap<T>(result: Promise<Result<T>>): Promise<T> {
	const r = await result;
	if (r.status === "error") throw toFailure(r.error, true);
	return r.data;
}
