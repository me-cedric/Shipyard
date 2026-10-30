import { useQuery } from "@tanstack/react-query";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";

/**
 * Warns before a commit or a push. It reads the repository on the forge (can the account push,
 * is the branch the default one) and the docs chain (a spec changed and its test plan did not).
 * It warns and never blocks. Legacy source: `check_push_target`, `chain-gate.tsx`.
 */
export function GateNotice({ push }: { push: boolean }) {
	const { t } = useI18n();
	const w = t.workspace.gate;
	// Keys start with `code`, so every git action reads them again.
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
		...chain.map((c) =>
			format(w.stale, {
				from: t.projects.path[c.from as "specs"] ?? c.from,
				to: t.projects.path[c.to as "specs"] ?? c.to,
				paths: c.changed.join(", "),
			}),
		),
	];
	if (lines.length === 0) return null;
	return (
		<div role="status" className="flex flex-col gap-1 px-3 py-1 text-ui text-warning-text">
			{lines.map((l) => (
				<p key={l}>{l}</p>
			))}
		</div>
	);
}
