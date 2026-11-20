import { useMemo, useState } from "react";
import { webUrl } from "@/features/factory/runs/run-summary";
import { type PullDetail, useForgeActions } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { openUrl } from "@/lib/menus";
import { RightButton, useRights } from "@/lib/rights";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Card } from "@/ui/molecules/card";
import { countsOf } from "@/ui/molecules/diff-file-list";
import { DiffView } from "@/ui/molecules/diff-view";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { AgentReview } from "./agent-review";
import { usePullAsk } from "./pull-ask";
import { useRun } from "./use-run";

/** The small grey heading of a side card. */
const LABEL = "text-13 font-semibold text-n-11";

/**
 * The look of a diff on the pull request pages: one column of line numbers (the new file), no hunk
 * header, the size of the design. `DiffView` is a shared part: the classes reach into it from here.
 */
export const DIFF_LOOK =
	"[&_section]:py-3.5 [&_section]:text-14 [&_section]:leading-[1.7] [&_[data-kind=hunk]]:hidden [&_[data-kind]>span:first-child]:hidden [&_[data-kind]>span[aria-hidden]:nth-last-child(2)]:hidden [&_[data-kind]>span:nth-child(2)]:mr-3 [&_[data-kind]>span:nth-child(2)]:text-n-11";

const VERDICT = { approved: "success", "changes-requested": "you" } as const;

/** The Review card: each reviewer with the verdict, "Review with an agent" and "Write the description". */
export function PullReviewCard({ d }: { d: PullDetail }) {
	const { t } = useI18n();
	const x = t.flow.look.pull;
	const askPull = usePullAsk(d);
	return (
		<Card pad className="flex flex-col gap-3">
			<h2 className={LABEL}>{x.review}</h2>
			{d.verdicts.map((v) => {
				const word =
					v.state === "changes-requested" ? x.changesAsked : t.forge.verdict[v.state as "approved"];
				return (
					<div key={v.reviewer} className="flex items-center gap-3">
						<Avatar name={v.reviewer} />
						<span className="min-w-0 flex-1 truncate font-semibold">{v.reviewer}</span>
						{word ? (
							<Badge variant={VERDICT[v.state as keyof typeof VERDICT] ?? "neutral"}>{word}</Badge>
						) : null}
					</div>
				);
			})}
			{/* `AgentReview` draws its own row: the classes give its button the width of the design. */}
			<div className="flex flex-wrap gap-2.5 [&>section]:flex-[1_1_130px] [&>section_button]:w-full [&>section_svg]:hidden [&>section>span]:flex [&>section>span]:w-full">
				<AgentReview d={d} />
				<Button
					className="flex-[1_1_130px]"
					onClick={() => askPull(t.workspace.pr.prompt.describe)}
				>
					{x.describe}
				</Button>
			</div>
		</Card>
	);
}

const ORDER = ["failing", "pending", "passing", "skipped"];
const CHECK = { passing: "success", failing: "you" } as const;

/** The Checks card: failing first, each check with its state. A check with a web address links to it. */
export function PullChecksCard({ d }: { d: PullDetail }) {
	const { t } = useI18n();
	const x = t.flow.look.pull;
	const checks = [...d.checks].sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));
	if (!checks.length) return null;
	return (
		<Card className="py-2">
			<h2 className={`${LABEL} px-6 pt-3.5 pb-1.5`}>{t.forge.checks}</h2>
			<div className="flex flex-col divide-y divide-n-4">
				{checks.map((c) => {
					const url = webUrl(c.url);
					return (
						<div key={c.name} className="flex min-h-15 items-center gap-3 px-6 font-semibold">
							{url ? (
								<a
									href={url}
									onClick={(e) => {
										e.preventDefault();
										openUrl(url);
									}}
									className="inline-flex min-h-control min-w-0 items-center rounded-sm text-n-12 hover:underline"
								>
									{c.name}
								</a>
							) : (
								<span className="min-w-0 truncate">{c.name}</span>
							)}
							<Badge
								variant={CHECK[c.state as keyof typeof CHECK] ?? "neutral"}
								className="ml-auto"
							>
								{c.state === "passing"
									? x.pass
									: c.state === "failing"
										? x.fail
										: t.forge.check[c.state as "passing"]}
							</Badge>
						</div>
					);
				})}
			</div>
		</Card>
	);
}

type Thread = PullDetail["threads"][number];

/** An open thread under the file: its comments, a Reply field and Solved. Reopen is on the changed files page. */
function FocusThread({ reference, th }: { reference: string; th: Thread }) {
	const { t } = useI18n();
	const c = t.forge.pullConversation;
	const x = t.flow.look.pull;
	const { reply, resolve } = useForgeActions();
	const write = useRights().gate("code.write");
	const { failure, busy, run } = useRun();
	const [body, setBody] = useState("");
	const place = `${th.path}${th.line ? `:${th.line}` : ""}`;
	return (
		<form
			aria-label={place}
			onSubmit={(e) => {
				e.preventDefault();
				if (body.trim() === "" || write.disabled || busy) return;
				void run(async () => {
					await reply(reference, th.id, body);
					setBody("");
				});
			}}
			className="mx-6 mb-5 flex flex-col gap-3 rounded-[14px] bg-n-2 p-4"
		>
			{th.commentsTotal > th.comments.length ? (
				<p className="text-13 text-n-11">
					{format(c.lastOf, { shown: th.comments.length, total: th.commentsTotal })}
				</p>
			) : null}
			{th.comments.map((cm) => (
				<div key={cm.id} className="flex items-start gap-3">
					<Avatar name={cm.author} size="s" />
					<div className="flex min-w-0 flex-1 flex-wrap gap-x-1.5 pt-0.5 [overflow-wrap:anywhere]">
						<span title={cm.author} className="font-semibold">
							{cm.author.split(" ")[0]}
						</span>
						<MarkdownView source={cm.body} label={cm.author} />
					</div>
				</div>
			))}
			<div className="flex flex-wrap gap-2.5">
				<Input
					label={c.reply}
					value={body}
					onChange={(e) => setBody(e.target.value)}
					className="w-auto flex-[1_1_200px]"
				/>
				{body.trim() ? (
					<RightButton type="submit" right="code.write" busy={busy}>
						{x.send}
					</RightButton>
				) : null}
				<RightButton
					right="code.write"
					busy={busy}
					onClick={() => void run(() => resolve(reference, th.id, true))}
				>
					{x.solved}
				</RightButton>
			</div>
			<ErrorNotice error={failure} />
		</form>
	);
}

/**
 * One changed file open in place: its code and its open threads. The file with an open comment
 * comes first, else the first file. The other files are on the changed files page.
 */
export function PullFocus({ d }: { d: PullDetail }) {
	const { t } = useI18n();
	const p = t.forge.pullPage;
	const open = d.threads.filter((th) => !th.resolved && th.path);
	const file = d.files.find((f) => open.some((th) => th.path === f.path)) ?? d.files[0];
	const n = useMemo(() => countsOf(file?.patch ?? ""), [file?.patch]);
	if (!file) return null;
	return (
		<Card className="overflow-hidden">
			<div className="flex min-h-15 flex-wrap items-center gap-3 px-6">
				<span className="min-w-0 font-mono text-14 font-semibold [overflow-wrap:anywhere]">
					{file.path}
				</span>
				{file.patch ? (
					<span className="ml-auto flex gap-2 font-semibold">
						<span title={p.linesAdded} className="text-success-text">
							+{n.added}
						</span>
						{n.removed ? (
							<span title={p.linesRemoved} className="text-danger-text">
								−{n.removed}
							</span>
						) : (
							<span className="sr-only">{`${p.linesRemoved}: 0`}</span>
						)}
					</span>
				) : null}
			</div>
			<div className={`border-t border-n-4 ${DIFF_LOOK}`}>
				{file.patch == null ? (
					<p className="px-6 py-3.5 text-n-11">{t.code.noPreview}</p>
				) : (
					<DiffView
						text={file.patch}
						path={file.path}
						label={format(t.code.diff, { path: file.path })}
						binaryLabel={t.code.binary}
						truncatedLabel={t.code.truncated}
						showAllLabel={t.forge.pullFiles.showAll}
					/>
				)}
			</div>
			{open
				.filter((th) => th.path === file.path)
				.map((th) => (
					<FocusThread key={th.id} reference={d.reference} th={th} />
				))}
		</Card>
	);
}
