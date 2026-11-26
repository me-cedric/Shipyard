import { Link } from "@tanstack/react-router";
import { useRef } from "react";
import { nameOf } from "@/features/factory/runs/run-live";
import { EarlierVersions } from "@/features/knowledge/page-history";
import { WithProject } from "@/features/shell/no-project";
import { useRoles } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { copyText } from "@/lib/menus";
import { useRights } from "@/lib/rights";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { linkClass } from "@/ui/atoms/link-button";
import { Card } from "@/ui/molecules/card";
import { Row } from "@/ui/molecules/row";
import { LibraryPage, LinkedCard, PageColumns, SideCards } from "@/ui/templates/library-page";
import { FileEditor } from "./file-editor";

const PATH = "docs/openspec/constitution.md";

/** The rules of the document: each item of a list, in order. A line that continues an item joins it. */
export function parseRules(text: string): string[] {
	const rules: string[] = [];
	let open = false;
	for (const raw of text.split("\n")) {
		const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(raw);
		if (item) {
			rules.push(item[1] ?? "");
			open = true;
		} else if (open && /^\s+\S/.test(raw)) rules[rules.length - 1] += ` ${raw.trim()}`;
		else open = false;
	}
	return rules;
}

/** Puts the caret at the end of the text of the editor under `host`. */
export function caretToEnd(host: HTMLElement | null) {
	// The editor mounts with the next draw.
	setTimeout(() => {
		const box = host?.querySelector("textarea");
		if (!box) return;
		box.focus();
		box.setSelectionRange(box.value.length, box.value.length);
		box.scrollTop = box.scrollHeight;
	});
}

/** The roles that can change the rules, from the rights of today, and the way to Crew / Rights. */
function WhoChanges() {
	const { t } = useI18n();
	const p = t.specs.page;
	const roles = useRights().view?.roles ?? [];
	const can = roles.filter((r) => r.rights.includes("specs.edit"));
	return (
		<LinkedCard title={p.whoChanges}>
			{can.map((r) => (
				<Row key={r.role}>
					<span className="min-w-0 font-semibold">{t.rights.role[r.role]}</span>
					<Badge variant="success" className="ml-auto">
						{p.canChange}
					</Badge>
				</Row>
			))}
			{roles.length > can.length ? (
				<Row>
					<span className="min-w-0 font-semibold">{p.otherRoles}</span>
					<Badge className="ml-auto">{p.canRead}</Badge>
				</Row>
			) : null}
			<Row>
				<Link to="/crew/rights" className={linkClass}>
					{p.changeRights}
				</Link>
			</Row>
		</LinkedCard>
	);
}

/** The agent roles of Crew: each one reads the rules before it works. */
function WhoFollows() {
	const { t } = useI18n();
	const roles = useRoles().data ?? [];
	if (!roles.length) return null;
	return (
		<LinkedCard title={t.specs.page.whoFollows}>
			{roles.map((r) => (
				<Row key={r.id}>
					<Avatar name={nameOf(r.id)} agent />
					<span className="min-w-0 font-semibold">{nameOf(r.id)}</span>
				</Row>
			))}
		</LinkedCard>
	);
}

/** Library / Project rules: one numbered card for each rule of the document (REQ-014). */
export function Constitution() {
	const { t } = useI18n();
	const p = t.specs.page;
	const title = t.tabs.specs.constitution;
	const host = useRef<HTMLDivElement>(null);
	return (
		<WithProject title={title} icon={null}>
			<FileEditor
				path={PATH}
				title={title}
				refId={PATH}
				read
				page={(text) => {
					const rules = parseRules(text);
					return rules.length ? (
						<article aria-label={title}>
							<ol className="flex flex-col gap-3">
								{rules.map((rule, i) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: the rules have no id and keep their order
									<li key={i}>
										<Card className="flex items-center gap-4 px-6 py-5 text-20">
											<span
												aria-hidden="true"
												className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-17 font-semibold text-accent-text"
											>
												{i + 1}
											</span>
											<span className="min-w-0 break-words">{rule}</span>
										</Card>
									</li>
								))}
							</ol>
						</article>
					) : null;
				}}
				frame={({ modes, editing, edit, body }) => (
					<LibraryPage
						title={title}
						className="pt-3"
						action={
							<>
								{modes}
								<Button
									onClick={() => {
										edit();
										caretToEnd(host.current);
									}}
								>
									{p.addRule}
								</Button>
								{editing ? null : (
									<Button variant="primary" onClick={edit}>
										{t.knowledge.handbook.edit}
									</Button>
								)}
							</>
						}
						menu={[{ label: p.copyFile, onClick: () => void copyText(PATH) }]}
					>
						<PageColumns>
							<div ref={host} className="flex min-w-0 flex-[3_1_480px] flex-col gap-3">
								{editing ? (
									<Card pad className="flex min-h-[32rem] flex-col">
										{body}
									</Card>
								) : (
									body
								)}
							</div>
							<SideCards className="flex-[2_1_300px]">
								<WhoChanges />
								<WhoFollows />
								<EarlierVersions path={PATH} />
							</SideCards>
						</PageColumns>
					</LibraryPage>
				)}
			/>
		</WithProject>
	);
}
