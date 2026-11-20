import { Link, Navigate, useParams } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import {
	DetailColumn,
	LibraryPage,
	LinkedCard,
	LinkedRow,
	PageColumns,
	SideCards,
} from "@/features/library/page-parts";
import { NoProject } from "@/features/shell/no-project";
import { useI18n } from "@/lib/i18n";
import { commands, saveAs, unwrap } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { useTeam } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { DocumentTextIcon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { MenuButton } from "@/ui/molecules/menu-button";
import { Row } from "@/ui/molecules/row";
import { SavedActions } from "./export-menu";
import { useReports } from "./reports-page";

const FIELD = "w-56 flex-none";
const TITLE = "w-80 flex-none";
const SHORT = "w-44 flex-none font-semibold";

/** One row of a form: the name of the field, then its control. */
function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<Row className="py-2">
			<span className="flex-[1_1_200px] font-medium">{label}</span>
			{children}
		</Row>
	);
}

/**
 * The card of a form: its fields, the one button that writes the report, the error with its
 * action, then one card for each written file. `run` gives the paths of the files.
 */
function Sheet({
	ready,
	run,
	children,
}: {
	ready: boolean;
	run: () => Promise<string[]>;
	children: ReactNode;
}) {
	const { t } = useI18n();
	const [written, setWritten] = useState<string[]>([]);
	const [failure, setFailure] = useState<unknown>(null);
	const [missing, setMissing] = useState(false);
	const [busy, setBusy] = useState(false);
	return (
		<>
			<Card className="py-2">
				{children}
				<Field label="">
					<Button
						variant="primary"
						busy={busy}
						onClick={() => {
							// A required field that is empty gives an error line, not a dead button.
							setMissing(!ready);
							if (!ready) return;
							setFailure(null);
							setBusy(true);
							run()
								.then(setWritten)
								.catch(setFailure)
								.finally(() => setBusy(false));
						}}
					>
						{t.reports.write}
					</Button>
				</Field>
			</Card>
			{missing ? (
				<p role="alert" className="text-ui text-danger-text">
					{t.reports.form.required}
				</p>
			) : null}
			<ErrorNotice error={failure} />
			{written.length ? (
				<Card pad className="flex flex-col gap-3">
					{written.map((path, i) => (
						<div key={path} className="flex flex-wrap items-center gap-3">
							{i === 0 ? <Badge variant="success">{t.reports.written}</Badge> : null}
							<span role="status" className="flex-[1_1_200px] font-mono text-14 break-words">
								{path}
							</span>
							<SavedActions path={path} onError={setFailure} />
						</div>
					))}
				</Card>
			) : null}
		</>
	);
}

/** `CR-003`: a title, the two versions and the people who approve. It writes the files in the project. */
function ChangeRequest() {
	const { t } = useI18n();
	const f = t.reports.form;
	const members = useTeam().data?.team.members ?? [];
	const [title, setTitle] = useState("");
	const [base, setBase] = useState("main");
	const [head, setHead] = useState("HEAD");
	const [picked, setPicked] = useState<string[]>([]);
	// A project with no team keeps the typed list of names.
	const [typed, setTyped] = useState("");
	return (
		<Sheet
			ready={Boolean(title.trim() && base.trim() && head.trim())}
			run={async () => {
				const names = members.length
					? picked
					: typed
							.split(",")
							.map((a) => a.trim())
							.filter(Boolean);
				const out = await unwrap(
					commands.exportChangeRequestFiles(title, base.trim(), head.trim(), names, true),
				);
				return [out.markdown, out.docx];
			}}
		>
			<Field label={f.title}>
				<Input
					label={f.title}
					className={TITLE}
					value={title}
					onChange={(e) => setTitle(e.target.value)}
				/>
			</Field>
			<Field label={f.base}>
				<Input
					label={f.base}
					className={SHORT}
					value={base}
					onChange={(e) => setBase(e.target.value)}
				/>
			</Field>
			<Field label={f.head}>
				<Input
					label={f.head}
					className={SHORT}
					value={head}
					onChange={(e) => setHead(e.target.value)}
				/>
			</Field>
			<Field label={f.approvers}>
				{members.length ? (
					<span className="flex flex-wrap items-center gap-2">
						{picked.map((name) => (
							<Avatar key={name} name={name} size="s" />
						))}
						<MenuButton
							label={f.add}
							items={members.map((m) => ({
								id: m.handle,
								label: m.name,
								checked: picked.includes(m.name),
								onSelect: () =>
									setPicked((p) =>
										p.includes(m.name) ? p.filter((x) => x !== m.name) : [...p, m.name],
									),
							}))}
						/>
					</span>
				) : (
					<Input
						label={f.approvers}
						className={FIELD}
						value={typed}
						onChange={(e) => setTyped(e.target.value)}
					/>
				)}
			</Field>
		</Sheet>
	);
}

const day = (back: number) => new Date(Date.now() - back * 864e5).toISOString().slice(0, 10);

/** The work done between two versions for a period. The save dialog comes after the form. */
function WorkDone() {
	const { t } = useI18n();
	const f = t.reports.form;
	const [base, setBase] = useState("main");
	const [head, setHead] = useState("HEAD");
	const [from, setFrom] = useState(day(30));
	const [to, setTo] = useState(day(0));
	return (
		<Sheet
			ready={Boolean(base.trim() && head.trim() && from && to)}
			run={async () => {
				const path = await saveAs("work-done", "xlsx");
				if (!path) return [];
				const text = { title: t.reports.workDone, ...t.reports.text, sections: [] };
				await unwrap(
					commands.exportWorkDoneFile(text, base.trim(), head.trim(), from, to, path, true),
				);
				return [path];
			}}
		>
			<Field label={f.base}>
				<Input
					label={f.base}
					className={SHORT}
					value={base}
					onChange={(e) => setBase(e.target.value)}
				/>
			</Field>
			<Field label={f.head}>
				<Input
					label={f.head}
					className={SHORT}
					value={head}
					onChange={(e) => setHead(e.target.value)}
				/>
			</Field>
			<Field label={f.from}>
				<Input
					type="date"
					label={f.from}
					className={FIELD}
					value={from}
					onChange={(e) => setFrom(e.target.value)}
				/>
			</Field>
			<Field label={f.to}>
				<Input
					type="date"
					label={f.to}
					className={FIELD}
					value={to}
					onChange={(e) => setTo(e.target.value)}
				/>
			</Field>
		</Sheet>
	);
}

const FORMS: Record<string, () => ReactNode> = {
	"change-request": ChangeRequest,
	"work-done": WorkDone,
};

/**
 * The form of a report that asks first, as a page: `/library/reports/$form`. A report that the
 * role does not see, or an address with no form, goes back to Reports.
 */
export function ReportForm() {
	const { t } = useI18n();
	const r = t.reports;
	const { form } = useParams({ strict: false }) as { form: string };
	const active = useActiveProject().data;
	const reports = useReports();
	const title = t.library.views.reports;
	const mine = reports.find((x) => x.item.id === form && x.item.form);
	const Form = FORMS[form];
	if (active === null) return <NoProject title={title} icon={<DocumentTextIcon size={16} />} />;
	if (!mine || !Form) return <Navigate to="/library/reports" replace />;
	const others = reports.filter((x) => x.item.form && x.item.id !== form);
	const plain = reports.filter((x) => !x.item.form);
	return (
		<LibraryPage
			title={mine.item.label}
			back={<BackLink label={title} render={(p) => <Link to="/library/reports" {...p} />} />}
		>
			<PageColumns>
				<DetailColumn className="min-w-80 flex-[690_1_0px]">
					<Form />
				</DetailColumn>
				<SideCards className="min-w-80 flex-[460_1_0px]">
					{others.length ? (
						<LinkedCard title={r.askFirst}>
							{others.map(({ item }) => (
								<LinkedRow
									key={item.id}
									label={item.label}
									trailing={<span className={buttonVariants()}>{r.fillShort}</span>}
									render={(p) => (
										<Link to="/library/reports/$form" params={{ form: item.id }} {...p} />
									)}
								/>
							))}
						</LinkedCard>
					) : null}
					<LinkedCard title={r.noForm}>
						{plain.length ? (
							<Row className="py-3">{plain.map((x) => x.name).join(", ")}</Row>
						) : null}
						<LinkedRow label={r.all} render={(p) => <Link to="/library/reports" {...p} />} />
					</LinkedCard>
					{plain.some((x) => x.item.id === "dossier-complete") ? (
						<LinkedCard title={r.parts}>
							<Row className="gap-1.5 py-3">
								{r.dossierSections.map((part) => (
									<Badge key={part}>{part}</Badge>
								))}
							</Row>
						</LinkedCard>
					) : null}
				</SideCards>
			</PageColumns>
		</LibraryPage>
	);
}
