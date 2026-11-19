import { useRouter, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { BackLink } from "@/ui/molecules/back-link";
import { PageHeader } from "@/ui/molecules/page-header";
import { SetupCard, SetupRow } from "./parts/setup-card";
import { type Pill, SetupPills } from "./parts/setup-pills";
import { oldPageAnchor } from "./setup-address";

type Scope = "project" | "computer" | "me";

/** The first page of each scope: the address of the scope with no `?page`. */
export const SCOPE_HOME = { project: "details", computer: "connections", me: "me" } as const;

/**
 * The pills of each scope, in the order of the design. A pill with `anchor` opens a card of the
 * first page. A pill shows when it is the first page, an anchor, or a page that the scope registers.
 */
const PILLS: Record<Scope, readonly { id: string; anchor?: string }[]> = {
	project: [
		{ id: "details" },
		{ id: "alone", anchor: "alone" },
		{ id: "automation" },
		{ id: "extensions" },
	],
	computer: [{ id: "connections" }, { id: "models" }, { id: "health" }],
	me: [],
};

export type ScopePage = {
	/** The address of the page is `?page=<id>`. An id of `PILLS` puts the page on the pill row. */
	id: string;
	/** The name of the page: the text of its row on the first page, and of a back link to it. */
	label: string;
	view: ReactNode;
	/** The view has no page header of its own: the scope draws the title row. A view of before draws its own. */
	bare?: boolean;
	/** The id of the page that the back link opens. Without it: the first page of the scope. */
	back?: string;
	/** The first page (or the page of `back`) draws its own link to this page: the scope adds no row for it. */
	linked?: boolean;
	/** The level-one heading in place of "Setup", such as "1 problem". */
	title?: string;
	/** Not drawn. */
	icon?: ReactNode;
};

/**
 * One scope of Setup (`spec:app-redesign#REQ-024`): the title "Setup" with the section switch, the
 * pills of the scope, then the page. The address `?page=<id>` shows a page of the scope. A page
 * that is no pill has a back link in place of the pills.
 */
export function SetupScope({
	scope,
	pages,
	count,
	children,
}: {
	scope: Scope;
	pages: ScopePage[];
	/** The count of the page header. */
	count?: number;
	/** The first page of the scope. */
	children: ReactNode;
}) {
	const { t } = useI18n();
	const router = useRouter();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const hash = useRouterState({ select: (s) => s.location.hash });
	const id = useRouterState({
		select: (s) => new URLSearchParams(s.location.searchStr).get("page"),
	});
	const home = SCOPE_HOME[scope];
	const page = pages.find((p) => p.id === id);
	// The id of the first page, or a page id of before, opens the first page on its anchor. Another
	// id that no page has waits: a page can register when its data loads.
	// The scope of the page before can still show while the next one loads: it does not act then.
	const here = pathname.replace(/\/$/, "") === `/setup/${scope}`;
	const old = here && id && !page ? (id === home ? "" : oldPageAnchor(scope, id)) : undefined;
	const gone = old === undefined ? undefined : hash || old;
	useEffect(() => {
		if (gone !== undefined) router.history.replace(`${pathname}${gone ? `#${gone}` : ""}`);
	}, [gone, pathname, router]);

	const pillLabel: Record<string, string> = t.settings.pills;
	const address = (to: string) => (to === home ? pathname : `${pathname}?page=${to}`);
	const link = (href: string) => ({
		href,
		onClick: (e: { preventDefault: () => void }) => {
			e.preventDefault();
			router.history.push(href);
		},
	});
	const pills: Pill[] = PILLS[scope]
		.filter((p) => p.anchor || p.id === home || pages.some((x) => x.id === p.id))
		.map((p) => ({
			id: p.id,
			label: pillLabel[p.id] ?? p.id,
			href: p.anchor ? `${pathname}#${p.anchor}` : address(p.id),
			current: !p.anchor && p.id === (page?.id ?? home),
		}));
	const isPill = (to: string) => pills.some((p) => p.id === to);
	const nameOf = (to: string) =>
		pages.find((p) => p.id === to)?.label ?? pillLabel[to] ?? t.settings.scope[scope];
	const row = pills.length ? <SetupPills label={t.settings.scope[scope]} items={pills} /> : null;

	if (page) {
		const parent = page.back ?? home;
		const back = isPill(page.id) ? undefined : (
			<BackLink label={nameOf(parent)} render={(a) => <a {...link(address(parent))} {...a} />} />
		);
		// The pages that this page holds and that it does not link itself.
		const under = pages.filter((p) => p.back === page.id && !p.linked);
		return (
			<div className="flex flex-col">
				{page.bare ? (
					<PageHeader title={page.title ?? t.ui.place.setup} back={back} />
				) : back ? (
					<div className="flex px-4">{back}</div>
				) : null}
				{back ? null : row}
				{page.view}
				<Rows pages={under} address={address} />
			</div>
		);
	}
	// The pages with no pill that the first page does not link itself.
	const rest = pages.filter(
		(p) => !isPill(p.id) && !p.linked && (p.back === undefined || p.back === home),
	);
	return (
		<div className="flex flex-col">
			{/* Each page has one level-one heading (ux-declutter REQ-017). */}
			<PageHeader title={t.ui.place.setup} count={count} />
			{row}
			{children}
			<Rows pages={rest} address={address} />
		</div>
	);
}

/** A card with one chevron row for each page: no page of a scope is without a link. */
function Rows({ pages, address }: { pages: ScopePage[]; address: (id: string) => string }) {
	const { t } = useI18n();
	if (!pages.length) return null;
	return (
		<div className="px-4 pb-10">
			<SetupCard title={t.ui.more}>
				{pages.map((p) => (
					<SetupRow key={p.id} label={p.label} href={address(p.id)} />
				))}
			</SetupCard>
		</div>
	);
}
