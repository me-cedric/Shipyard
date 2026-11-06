import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useRuns } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { ErrorNotice } from "@/ui/molecules/error-notice";

/** The states after which a run changes nothing more. */
const ENDED = ["PROpen", "Merged", "Done", "Failed", "Cancelled"];

/**
 * Updates one stale doc with an agent. The run starts on a click and never by itself. Its row
 * links to Factory / Runs, and a run that ended names each doc that the agent left unreadable.
 */
export function DocsUpdate({
	to,
	name,
	range,
}: {
	to: string;
	name: string;
	/** The place that showed the warning: the doc is stale in this range. */
	range: "staged" | "unpushed" | "branch";
}) {
	const { t } = useI18n();
	const w = t.personal.chain;
	const [run, setRun] = useState<string | null>(null);
	const [failure, setFailure] = useState<unknown>(null);
	const ended = ENDED.includes(useRuns().data?.find((r) => r.id === run)?.state ?? "");
	const problems = useQuery({
		queryKey: ["code", "docs-update", run],
		queryFn: () => unwrap(commands.codeDocsUpdateCheck(run ?? "")),
		enabled: run !== null && ended,
		retry: false,
	}).data;
	const start = async () => {
		try {
			setFailure(null);
			setRun(await unwrap(commands.codeDocsUpdateStart(to, range, true)));
		} catch (e) {
			setFailure(e);
		}
	};
	return (
		<>
			{run ? (
				<Link to="/factory/runs" className="text-ui text-accent-text underline">
					{format(w.runName, { name })}
				</Link>
			) : (
				<RightButton
					right="runs.start"
					variant="ghost"
					aria-label={format(w.updateName, { name })}
					onClick={() => void start()}
				>
					{w.update}
				</RightButton>
			)}
			<ErrorNotice error={failure} className="px-3 py-2" />
			{problems?.map((p) => (
				<p key={p.path} role="alert" className="text-12 text-danger-text">
					{format(w.problem, { path: p.path, error: p.error })}
				</p>
			))}
		</>
	);
}
