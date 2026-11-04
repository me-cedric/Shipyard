/** The one place that writes to the console: a failed background call has no screen to show it. */
export function logError(error: unknown): void {
	// biome-ignore lint/suspicious/noConsole: this is the app's single error sink
	console.error(error);
}
