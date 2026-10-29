import { useState } from "react";
import { COMMIT_TYPES, useBranches, useCodeActions } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { ArrowPathIcon, CheckIcon, PlusIcon } from "@/ui/icons";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { withProject } from "./project-gate";
import { useRun } from "./use-run";

/** Create a branch as `<type>/<area>/<kebab>` from the current head (REQ-012). */
function CreateBranch({ run }: { run: (job: () => Promise<unknown>) => void }) {
	const { t } = useI18n();
	const { createBranch } = useCodeActions();
	const [type, setType] = useState<string>(COMMIT_TYPES[0]);
	const [area, setArea] = useState("");
	const [subject, setSubject] = useState("");
	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		run(async () => {
			await createBranch(`${type}/${area.trim()}/${subject.trim()}`);
			setArea("");
			setSubject("");
		});
	};
	return (
		<form onSubmit={submit} className="flex items-center gap-2 border-b px-3 py-2">
			<Select
				label={t.code.type}
				items={COMMIT_TYPES.map((c) => ({ value: c, label: c }))}
				value={type}
				onValueChange={setType}
				className="min-w-28"
			/>
			<Input label={t.code.area} value={area} onChange={(e) => setArea(e.target.value)} />
			<Input label={t.code.subject} value={subject} onChange={(e) => setSubject(e.target.value)} />
			<Button type="submit" variant="primary">
				<PlusIcon size={14} />
				{t.code.create}
			</Button>
		</form>
	);
}

function BranchesView() {
	const { t } = useI18n();
	const branches = useBranches().data ?? [];
	const { switchBranch, deleteBranch, fetch, push } = useCodeActions();
	const { error, run: runJob } = useRun();
	const [confirming, setConfirming] = useState<string | null>(null);
	const run = (job: () => Promise<unknown>) => void runJob(job);
	const groups = [
		{ id: "local", title: t.code.local, items: branches.filter((b) => b.kind === "local") },
		{ id: "remote", title: t.code.remote, items: branches.filter((b) => b.kind === "remote") },
	];
	return (
		<div>
			<h1 className="sr-only">{t.tabs.code.branches}</h1>
			<CreateBranch run={run} />
			<div className="flex items-center gap-2 border-b px-3 py-1">
				<Button variant="ghost" onClick={() => run(fetch)}>
					<ArrowPathIcon size={14} />
					{t.code.fetch}
				</Button>
				<Button variant="ghost" onClick={() => run(push)}>
					{t.code.publish}
				</Button>
			</div>
			{error ? (
				<p role="alert" className="px-3 py-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{groups.map((g) => (
				<section key={g.id} aria-label={g.title}>
					<h2 className="px-3 py-1 text-12 font-medium text-n-11">
						{format(t.count, { name: g.title, count: g.items.length })}
					</h2>
					{g.items.map((b) => (
						<SettingsRow
							key={b.name}
							icon={b.is_head ? <CheckIcon size={14} /> : undefined}
							label={b.name}
						>
							{b.ahead ? <Badge>{format(t.code.ahead, { count: b.ahead })}</Badge> : null}
							{b.behind ? <Badge>{format(t.code.behind, { count: b.behind })}</Badge> : null}
							<Button
								variant="ghost"
								disabled={b.is_head}
								onClick={() => run(() => switchBranch(b.name))}
							>
								{t.code.switch}
							</Button>
							{b.kind === "local" && !b.is_head ? (
								confirming === b.name ? (
									<Button
										variant="danger"
										onClick={() =>
											run(async () => {
												setConfirming(null);
												await deleteBranch(b.name, false);
											})
										}
									>
										{format(t.code.confirmDelete, { name: b.name })}
									</Button>
								) : (
									<Button variant="ghost" onClick={() => setConfirming(b.name)}>
										{t.code.delete}
									</Button>
								)
							) : null}
						</SettingsRow>
					))}
				</section>
			))}
		</div>
	);
}

export const Branches = withProject(BranchesView);
