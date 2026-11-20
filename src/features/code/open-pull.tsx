import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useBranches, useForgeActions, usePullLabels } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Switch } from "@/ui/atoms/switch";
import { Textarea } from "@/ui/atoms/textarea";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { MenuButton } from "@/ui/molecules/menu-button";
import { OpenPullCards } from "./open-pull-cards";
import { withProject } from "./project-gate";
import { useRun } from "./use-run";

/** The value of the "Into" item for the default branch of the repository. */
const DEFAULT = "default";

/** One line of the settings card: the name at the left, the control at the right. */
const FIELD =
	"flex min-h-15 flex-wrap items-center justify-between gap-3 border-b border-n-4 px-6 py-2 last:border-b-0";

/** New pull request (screen 74, REQ-020): a title, a description, a base, a draft option and labels that exist. */
export const NewPullPage = withProject(function NewPullView() {
	const { t } = useI18n();
	const x = t.flow.look.pulls;
	const navigate = useNavigate();
	const { open: openPull } = useForgeActions();
	const known = usePullLabels().data ?? [];
	const branches = useBranches().data ?? [];
	const { failure, run } = useRun();
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [base, setBase] = useState(DEFAULT);
	const [draft, setDraft] = useState(false);
	const [labels, setLabels] = useState<string[]>([]);
	const [missing, setMissing] = useState<string[]>([]);
	const [labelError, setLabelError] = useState<string | null>(null);
	// The pull request exists once the call returns: a second click would open a duplicate.
	const [created, setCreated] = useState(false);
	const [writing, setWriting] = useState(false);
	const baseOf = base === DEFAULT ? null : base;
	const names = [...new Set(branches.map((b) => b.name.replace(/^origin\//, "")))];
	// The agent fills the title and the body. The person edits them, then clicks Open.
	const write = () =>
		void run(async () => {
			setWriting(true);
			try {
				const text = await unwrap(commands.prWriteText(baseOf, true));
				setTitle(text.title);
				setBody(text.body);
			} finally {
				setWriting(false);
			}
		});
	const submit = () =>
		void run(async () => {
			const out = await openPull({ title, body, base: baseOf, draft, labels });
			setCreated(true);
			setMissing(out.missingLabels);
			setLabelError(out.labelError);
			if (out.missingLabels.length === 0 && !out.labelError)
				void navigate({ to: "/code/pull-requests" });
		});
	return (
		<section aria-label={t.forge.newPull} className="flex w-full flex-col gap-6 px-4 pb-10">
			<div className="flex flex-col">
				<BackLink
					label={t.forge.now.pulls}
					render={(props) => <Link to="/code/pull-requests" {...props} />}
				/>
				<h1 className="text-44 font-semibold text-n-12">{t.forge.newPull}</h1>
			</div>
			<div className="flex flex-wrap items-start gap-6">
				<div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
					<Card pad className="flex flex-col gap-3.5">
						<Input
							caption
							label={t.forge.title}
							value={title}
							onChange={(e) => setTitle(e.target.value)}
						/>
						<div className="flex items-center gap-3">
							<span aria-hidden="true" className="mr-auto text-12 text-n-11">
								{t.forge.description}
							</span>
							<Button disabled={writing || created} onClick={write}>
								{writing ? t.forge.agent.writing : t.forge.now.write}
							</Button>
						</div>
						<Textarea
							label={t.forge.description}
							rows={4}
							value={body}
							onChange={(e) => setBody(e.target.value)}
						/>
					</Card>
					<Card className="py-2">
						<div className={FIELD}>
							<span>{x.into}</span>
							<Select
								label={x.into}
								value={base}
								onValueChange={setBase}
								items={[
									{ value: DEFAULT, label: x.defaultBranch },
									...names.map((n) => ({ value: n, label: n })),
								]}
								className="min-w-40"
							/>
						</div>
						<div className={FIELD}>
							<span>{t.forge.draft}</span>
							<Switch label={t.forge.draft} iconOnly checked={draft} onCheckedChange={setDraft} />
						</div>
						{known.length ? (
							<section aria-label={t.forge.labels} className={FIELD}>
								<span>{t.forge.labels}</span>
								<MenuButton
									label={labels.length ? labels.join(", ") : t.forge.labels}
									items={known.map((l) => ({
										id: l,
										label: l,
										checked: labels.includes(l),
										onSelect: () =>
											setLabels((cur) =>
												cur.includes(l) ? cur.filter((y) => y !== l) : [...cur, l],
											),
									}))}
								/>
							</section>
						) : null}
					</Card>
					{missing.length ? (
						<p role="status" className="text-ui text-warning-text">
							{format(t.forge.missingLabels, { names: missing.join(", ") })}
						</p>
					) : null}
					<ErrorNotice error={failure ?? labelError} className="px-3 py-2" />
					<div className="flex flex-wrap justify-end gap-2.5">
						<RightButton right="code.write" variant="primary" onClick={submit} disabled={created}>
							{x.openIt}
						</RightButton>
					</div>
				</div>
				<div className="flex min-w-0 flex-[2_1_320px] flex-col gap-6">
					<OpenPullCards />
				</div>
			</div>
		</section>
	);
}, "pull-requests");
