/** The policy of a mockup: no script, no request; inline styles and data images and fonts only. */
export const MOCKUP_CSP =
	"default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; form-action 'none'";

/**
 * An HTML mockup in a sandboxed frame. The empty `sandbox` runs no script and gives the page an
 * opaque origin, so it cannot reach the app, its storage or the IPC; the policy blocks every request.
 */
export function HtmlPreview({ html, label }: { html: string; label: string }) {
	return (
		<iframe
			title={label}
			sandbox=""
			referrerPolicy="no-referrer"
			// A mockup expects the white page of a browser; its own style comes later and wins.
			srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="${MOCKUP_CSP}"><style>html{background:white}</style>${html}`}
			className="min-h-96 w-full flex-1 rounded-md border border-n-7"
		/>
	);
}
