import { useBranches, useCodeActions } from "@/lib/code";
import { useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { Select } from "@/ui/atoms/select";
import { useRun } from "./use-run";

/** The working branch in one selector. One value drives each git action of the project (REQ-011). */
export function BranchSelector() {
	const { t } = useI18n();
	const active = useActiveProject().data;
	const branches = useBranches();
	const { switchBranch } = useCodeActions();
	const { error, run } = useRun();
	const locals = (branches.data ?? []).filter((b) => b.kind === "local");
	const head = locals.find((b) => b.is_head);
	if (!(active && head)) return null;
	return (
		<>
			{error ? (
				<span role="alert" className="truncate text-ui text-danger-text">
					{error}
				</span>
			) : null}
			<Select
				label={t.code.branch}
				items={locals.map((b) => ({ value: b.name, label: b.name }))}
				value={head.name}
				onValueChange={(name) => void run(() => switchBranch(name))}
			/>
		</>
	);
}
