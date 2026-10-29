import { type ReactNode, useEffect, useMemo } from "react";
import { Badge } from "../atoms/badge";
import type { EditorError } from "./error-line";
import { type ApiDoc, type ApiOp, parseOpenApi } from "./openapi";

const TONE = {
	GET: "info",
	POST: "success",
	PUT: "warning",
	PATCH: "warning",
	DELETE: "danger",
} as const;

/**
 * A read view of an OpenAPI contract, grouped by tag: method, path, parameters, responses.
 * An invalid contract shows no endpoint and reports its error.
 * Legacy uses Redoc here. Redoc brings its own styles and a large bundle, so this view is plain.
 */
export function OpenApiView({
	source,
	labels,
	onError,
	tryPanel,
}: {
	source: string;
	labels: { parameters: string; responses: string; required: string; untagged: string };
	onError?: (error: EditorError | null) => void;
	/** The place for a try panel, inside each operation. */
	tryPanel?: (op: ApiOp, doc: ApiDoc) => ReactNode;
}) {
	const { doc, error } = useMemo(() => parseOpenApi(source), [source]);
	useEffect(() => onError?.(error ?? null), [error, onError]);
	if (!doc) return null;
	return (
		<div className="flex flex-col gap-4 overflow-auto">
			{doc.groups.map((g) => (
				<section key={g.tag} aria-label={g.tag || labels.untagged} className="flex flex-col gap-1">
					<h3 className="text-12 font-medium text-n-11">{g.tag || labels.untagged}</h3>
					{g.ops.map((op) => (
						<details
							key={`${op.method} ${op.path}`}
							className="rounded-md border border-n-7 bg-n-2 open:bg-n-1"
						>
							<summary className="flex h-row cursor-default items-center gap-2 px-2 text-ui">
								<Badge variant={TONE[op.method as keyof typeof TONE] ?? "neutral"}>
									{op.method}
								</Badge>
								<span className="font-mono text-12">{op.path}</span>
								<span className="truncate text-n-11">{op.summary}</span>
							</summary>
							<div className="flex flex-col gap-3 border-t border-n-7 p-2">
								{op.parameters.length ? (
									<section aria-label={labels.parameters}>
										<h4 className="py-1 text-12 font-medium text-n-11">{labels.parameters}</h4>
										<ul className="font-mono text-12">
											{op.parameters.map((p) => (
												<li key={`${p.in}.${p.name}`} className="flex gap-2">
													<span>{p.name}</span>
													<span className="text-n-10">
														{p.in} {p.type}
													</span>
													{p.required ? <Badge>{labels.required}</Badge> : null}
												</li>
											))}
										</ul>
									</section>
								) : null}
								<section aria-label={labels.responses}>
									<h4 className="py-1 text-12 font-medium text-n-11">{labels.responses}</h4>
									<ul className="font-mono text-12">
										{op.responses.map((r) => (
											<li key={r.status} className="flex gap-2">
												<span>{r.status}</span>
												<span className="text-n-11">{r.description}</span>
											</li>
										))}
									</ul>
								</section>
								{tryPanel?.(op, doc)}
							</div>
						</details>
					))}
				</section>
			))}
		</div>
	);
}
