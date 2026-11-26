import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
	type MergeMethod,
	useBranches,
	useForgeActions,
	useLog,
	usePullLabels,
	useReviewers,
} from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Segmented } from "@/ui/atoms/segmented";
import { Select } from "@/ui/atoms/select";
import { Switch } from "@/ui/atoms/switch";
import { Textarea } from "@/ui/atoms/textarea";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { MenuButton } from "@/ui/molecules/menu-button";
import { LeaveGuard } from "@/ui/organisms/leave-guard";
import { defaultMergeMethod, saveMergeMethod } from "./merge-default";
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
	const { open: openPull, close, ready } = useForgeActions();
	const known = usePullLabels().data ?? [];
	const people = useReviewers().data ?? [];
	const branches = useBranches().data ?? [];
	const { failure, run } = useRun();
	// The title starts as the summary of the last commit, until the person types one.
	// A branch with no commit of its own would show the last commit of its base: leave the title empty.
	const ahead = branches.find((b) => b.is_head)?.base_ahead ?? 0;
	const first = useLog().data?.pages[0]?.commits[0]?.summary ?? "";
	const last = ahead > 0 ? first : "";
	const [typed, setTyped] = useState<string | null>(null);
	const title = typed ?? last;
	const setTitle = setTyped;
	const [tried, setTried] = useState(false);
	const titleBox = useRef<HTMLInputElement>(null);
	const [body, setBody] = useState("");
	const [base, setBase] = useState(DEFAULT);
	const [draft, setDraft] = useState(false);
	const [labels, setLabels] = useState<string[]>([]);
	const [reviewers, setReviewers] = useState<string[]>([]);
	const [method, setMethod] = useState<MergeMethod>(() =>
		defaultMergeMethod(["merge", "squash", "rebase"]),
	);
	// The pull request that the open made: the page then acts on it (REQ-007).
	const [opened, setOpened] = useState<{ number: number; draft: boolean; closed: boolean } | null>(
		null,
	);
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
	const submit = () => {
		if (title.trim() === "") {
			setTried(true);
			titleBox.current?.focus();
			return;
		}
		void run(async () => {
			const out = await openPull({ title, body, base: baseOf, draft, labels, reviewers });
			setCreated(true);
			setOpened({ number: out.number, draft, closed: false });
			setMissing(out.missingLabels);
			setLabelError(out.labelError ?? out.reviewerError);
		});
	};
	const markReady = () =>
		void run(async () => {
			if (!opened) return;
			await ready(opened.number);
			setOpened({ ...opened, draft: false });
		});
	const closeIt = () =>
		void run(async () => {
			if (!opened) return;
			await close(opened.number, "");
			setOpened({ ...opened, closed: true });
		});
	return (
		<section aria-label={t.forge.newPull} className="flex w-full flex-col gap-6 px-4 pb-10">
			<LeaveGuard dirty={!created && ((typed ?? "").trim() !== "" || body.trim() !== "")} />
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
							ref={titleBox}
							aria-invalid={(tried && title.trim() === "") || undefined}
							onChange={(e) => setTitle(e.target.value)}
						/>
						{tried && title.trim() === "" ? (
							<p role="alert" className="text-ui text-danger-text">
								{t.forge.titleNeeded}
							</p>
						) : null}
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
						<section aria-label={t.codeHost.reviewers} className={FIELD}>
							<span>{t.codeHost.reviewers}</span>
							<MenuButton
								label={
									reviewers.length
										? reviewers.map((r) => people.find((p) => p.id === r)?.name ?? r).join(", ")
										: t.codeHost.reviewers
								}
								disabled={created || people.length === 0}
								items={people.map((p) => ({
									id: p.id,
									label: p.name,
									checked: reviewers.includes(p.id),
									onSelect: () =>
										setReviewers((cur) =>
											cur.includes(p.id) ? cur.filter((y) => y !== p.id) : [...cur, p.id],
										),
								}))}
							/>
						</section>
						<div className={FIELD}>
							<span>{t.codeHost.mergeWith}</span>
							<Segmented
								label={t.codeHost.mergeWith}
								value={method}
								onValueChange={(m) => {
									setMethod(m);
									saveMergeMethod(m);
								}}
								items={(["merge", "squash", "rebase"] as const).map((m) => ({
									value: m,
									label: t.forge.methods[m],
								}))}
							/>
						</div>
					</Card>
					{missing.length ? (
						<p role="status" className="text-ui text-warning-text">
							{format(t.forge.missingLabels, { names: missing.join(", ") })}
						</p>
					) : null}
					<ErrorNotice error={failure ?? labelError} className="px-3 py-2" />
					<div className="flex flex-wrap justify-end gap-2.5">
						{opened && !opened.closed ? (
							<>
								<RightButton right="code.write" className="text-danger-text" onClick={closeIt}>
									{t.codeHost.closePull}
								</RightButton>
								{opened.draft ? (
									<RightButton right="code.write" onClick={markReady}>
										{t.codeHost.markReady}
									</RightButton>
								) : null}
							</>
						) : null}
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
