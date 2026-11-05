import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { AckDialog } from "./chain-ack";
import { DocsUpdate } from "./docs-update";

/**
 * Warns before a commit or a push. It reads the repository on the forge (can the account push,
 * is the branch the default one) and the docs chain (a spec changed and its test plan did not).
 * It warns and never blocks.
 */
export function GateNotice({ push }: { push: boolean }) {
	const { t } = useI18n();
	const w = t.workspace.gate;
	// Keys start with `code`, so every git action reads them again.
	const c18 = t.review.chain;
	const [asking, setAsking] = useState<{ from: string; to: string; name: string } | null>(null);
	const target = useQuery({
		queryKey: ["code", "push-target"],
		queryFn: () => unwrap(commands.codePushTarget()),
		enabled: push,
		retry: false,
	}).data;
	const chain =
		useQuery({
			queryKey: ["code", "chain-gate", push],
			queryFn: () => unwrap(commands.codeChainGate(push)),
			retry: false,
		}).data ?? [];
	const lines = [
		...(target?.canPush === false ? [format(w.cannotPush, { remote: target.remote })] : []),
		...(target?.onDefault
			? [format(w.onDefault, { branch: target.branch ?? "", remote: target.remote })]
			: []),
	];
	if (lines.length === 0 && chain.length === 0) return null;
	return (
		<div role="status" className="flex flex-col gap-1 px-3 py-1 text-ui text-warning-text">
			{lines.map((l) => (
				<p key={l}>{l}</p>
			))}
			{chain.map((c) => {
				const to = t.projects.path[c.to as "specs"] ?? c.to;
				return (
					<div key={`${c.from}:${c.to}`} className="flex items-center gap-2">
						<p className="min-w-0 flex-1">
							{format(w.stale, {
								from: t.projects.path[c.from as "specs"] ?? c.from,
								to,
								paths: c.changed.join(", "),
							})}
						</p>
						<Button
							variant="ghost"
							aria-label={format(c18.acknowledgeName, { name: to })}
							onClick={() => setAsking({ from: c.from, to: c.to, name: to })}
						>
							{c18.acknowledge}
						</Button>
						{/* Staged work cannot go into an agent run: the update is offered from the push gate on. */}
						{push ? <DocsUpdate to={c.to} name={to} range="unpushed" /> : null}
					</div>
				);
			})}
			{asking ? <AckDialog base={null} {...asking} onClose={() => setAsking(null)} /> : null}
		</div>
	);
}
