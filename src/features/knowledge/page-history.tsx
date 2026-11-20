import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { usePageHistory, usePageVersion, useRestorePage } from "@/lib/knowledge/history";
import { useDay } from "@/lib/prefs";
import { RightButton } from "@/lib/rights";
import { Avatar } from "@/ui/atoms/avatar";
import { Button } from "@/ui/atoms/button";
import { ChevronRightIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Row } from "@/ui/molecules/row";
import { Dialog } from "@/ui/organisms/dialog";

/** The earlier versions of one page: read one, restore one. A restore writes the text and commits nothing (`spec:library-functions#REQ-002`). */
function HistoryDialog({ path, onClose }: { path: string; onClose: () => void }) {
	const { t } = useI18n();
	const h = t.library.fn.history;
	const day = useDay();
	const log = usePageHistory(path).data ?? [];
	const [sha, setSha] = useState<string | null>(null);
	const text = usePageVersion(path, sha).data;
	const restore = useRestorePage(path);
	return (
		<Dialog open onOpenChange={(o) => !o && onClose()} title={h.title} wide>
			{log.length === 0 ? <p className="text-n-11">{h.none}</p> : null}
			<ul className="flex flex-col divide-y divide-n-6">
				{log.map((c) => (
					<li key={c.sha} className="flex flex-wrap items-center gap-3 py-2">
						<span className="min-w-0 flex-1">
							<span className="block break-words font-semibold text-n-12">{c.summary}</span>
							<span className="text-13 text-n-11">
								{c.author_name} · {day(new Date(c.time * 1000).toISOString())}
							</span>
						</span>
						<Button
							className="min-h-control"
							aria-pressed={sha === c.sha}
							aria-label={format(h.read, { summary: c.summary })}
							onClick={() => setSha(c.sha)}
						>
							{h.readLabel}
						</Button>
						<RightButton
							right="code.write"
							className="min-h-control"
							aria-label={format(h.restore, { summary: c.summary })}
							onClick={() => restore.mutate(c.sha)}
						>
							{h.restoreLabel}
						</RightButton>
					</li>
				))}
			</ul>
			{text !== undefined ? (
				<section aria-label={h.text}>
					<pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-n-3 p-4 text-13 text-n-12">
						{text}
					</pre>
				</section>
			) : null}
			{restore.isSuccess ? <p role="status">{h.restored}</p> : null}
			<ErrorNotice error={restore.error} />
		</Dialog>
	);
}

/** The author line of a handbook page and its History button, for the footer of the page card. */
export function HistoryFooter({ path }: { path: string }) {
	const { t } = useI18n();
	const h = t.library.fn.history;
	const [open, setOpen] = useState(false);
	const last = usePageHistory(path).data?.[0];
	return (
		<>
			{last ? (
				<>
					<Avatar name={last.author_name} size="s" />
					<span className="mr-auto text-n-11">
						{format(h.changedBy, { name: last.author_name })}
					</span>
				</>
			) : null}
			<Button className="min-h-control" onClick={() => setOpen(true)}>
				{h.open}
			</Button>
			{open ? <HistoryDialog path={path} onClose={() => setOpen(false)} /> : null}
		</>
	);
}

/** The card Earlier versions of the project rules: one row that opens the versions. */
export function EarlierVersions({ path }: { path: string }) {
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	return (
		<Card className="py-2">
			<Row
				render={(p) => (
					<button
						type="button"
						onClick={() => setOpen(true)}
						{...p}
						className={`${p.className} w-full text-left`}
					/>
				)}
			>
				<span className="min-w-0 font-semibold">{t.library.fn.history.title}</span>
				<ChevronRightIcon size={16} className="ml-auto" />
			</Row>
			{open ? <HistoryDialog path={path} onClose={() => setOpen(false)} /> : null}
		</Card>
	);
}
