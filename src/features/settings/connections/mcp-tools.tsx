import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type McpServer, type McpTest_Serialize as McpTest, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { CheckIcon, PlayIcon, SparklesIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { mcpKeys } from "./keys";

const recommendedKey = ["mcp", "recommended"] as const;

/** The name of a category, in the language of the person. An unknown category shows as it is. */
export function useCategoryName() {
	const { t } = useI18n();
	return (category: string) => t.extensions.mcp.categories[category] ?? category;
}

/** The result of a test: it works with n tools, or it does not work and why. */
export function McpTestResult({ name, result }: { name: string; result: McpTest }) {
	const { t } = useI18n();
	const m = t.extensions.mcp;
	return result.ok ? (
		<p role="status" className="flex items-center gap-1 px-3 pb-2 text-12 text-success-text">
			<CheckIcon size={12} />
			{format(m.passed, { name, count: result.tools.length })}
		</p>
	) : (
		<div role="status" className="flex flex-col gap-1 px-3 pb-2">
			<span className="text-12 text-danger-text">{format(m.failed, { name })}</span>
			<ErrorNotice error={result.error} />
		</div>
	);
}

/** One Test button for a server, with its result under the row. */
export function useMcpTest(id: string) {
	const [result, setResult] = useState<McpTest | null>(null);
	const [busy, setBusy] = useState(false);
	const qc = useQueryClient();
	const test = async () => {
		setBusy(true);
		try {
			setResult(await unwrap(commands.mcpTest(id)));
		} finally {
			setBusy(false);
			await qc.invalidateQueries({ queryKey: mcpKeys.list });
		}
	};
	return { result, busy, test };
}

/** Test all and Add the recommended set, for the head of the MCP group. */
export function McpGroupTools({ rows }: { rows: McpServer[] }) {
	const { t } = useI18n();
	const m = t.extensions.mcp;
	const qc = useQueryClient();
	const [results, setResults] = useState<McpTest[]>([]);
	const [added, setAdded] = useState<string[] | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<unknown>(null);
	const recommended = useQuery({
		queryKey: recommendedKey,
		queryFn: () => unwrap(commands.mcpRecommended()),
	}).data;
	const missing = (recommended ?? []).filter((id) => !rows.some((r) => r.id === id && r.enabled));
	const enabled = rows.filter((r) => r.enabled);
	const job = async (f: () => Promise<void>) => {
		setError(null);
		setBusy(true);
		try {
			await f();
		} catch (e) {
			setError(e);
		} finally {
			setBusy(false);
			await qc.invalidateQueries({ queryKey: mcpKeys.list });
		}
	};
	const label = (id: string) => rows.find((r) => r.id === id)?.label ?? id;
	return (
		<div className="flex flex-col gap-1">
			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant="ghost"
					disabled={busy || missing.length === 0}
					onClick={() =>
						void job(async () => setAdded(await unwrap(commands.mcpRecommendedEnable(true))))
					}
				>
					<SparklesIcon size={14} />
					{missing.length ? m.recommended : m.complete}
				</Button>
				<Button
					variant="ghost"
					disabled={busy || enabled.length === 0}
					onClick={() => void job(async () => setResults(await unwrap(commands.mcpTestAll())))}
				>
					<PlayIcon size={14} />
					{m.testAll}
				</Button>
			</div>
			{added?.length ? (
				<p role="status" className="px-1 text-12 text-n-11">
					{format(m.added, { names: added.map(label).join(", ") })}
				</p>
			) : null}
			<ErrorNotice error={error} className="px-1" />
			{results.length ? (
				<ul aria-label={m.testAll} className="flex flex-col">
					{results.map((r) => (
						<li key={r.id}>
							<McpTestResult name={label(r.id)} result={r} />
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
