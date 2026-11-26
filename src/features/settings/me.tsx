import { useEffect, useState } from "react";
import { PermissionsCard, ReplayTour } from "@/features/onboarding";
import { useBudgetStatus } from "@/features/shell/budget-notice";
import { useSignOut } from "@/features/shell/sign-out";
import { format, LANGS, useI18n } from "@/lib/i18n";
import { commands, type EventSource, unwrap } from "@/lib/ipc";
import { logError } from "@/lib/log";
import { type Overridable, ROLES, type Role, usePrefs } from "@/lib/prefs";
import { useRightsView } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useTeam } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Segmented } from "@/ui/atoms/segmented";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ChevronRightIcon } from "@/ui/icons";
import { Row } from "@/ui/molecules/row";
import { Fold } from "./connections/fold";
import { LanguageFiles, LanguageRows } from "./languages";
import { textSizeShown } from "./look-rows";
import { DefaultAgentSelect, DefaultModelSelect, TerminalAppSelect } from "./me/personal";
import { ValueSelect } from "./me/value-select";
import { Column, Columns, SetupCard, SetupRow, Stepper, Toggle } from "./parts";
import { PictureField, usePicture } from "./picture-field";
import { ThemeCard, ThemeFiles } from "./themes";

/** Where the update check reads the latest release. It saves when the field loses focus. */
function ReleaseUrl() {
	const { t } = useI18n();
	const [url, setUrl] = useState("");
	useEffect(() => {
		unwrap(commands.prefsGet())
			.then((p) => setUrl(p.releaseUrl))
			.catch(logError);
	}, []);
	return (
		<Input
			label={t.prefs.releaseUrl}
			value={url}
			onChange={(e) => setUrl(e.target.value)}
			// An empty value restores the default address, and the field shows it.
			onBlur={() =>
				unwrap(commands.prefsSet({ releaseUrl: url }))
					.then((p) => setUrl(p.releaseUrl))
					.catch(logError)
			}
			className="w-80"
		/>
	);
}

/** The four plain groups of the notifications, each with the sources that it holds. */
const GROUPS: { id: "agent" | "review" | "ended" | "news"; sources: EventSource[] }[] = [
	{ id: "agent", sources: ["question", "approval"] },
	{ id: "review", sources: ["review-draft", "pr-checks"] },
	{ id: "ended", sources: ["run", "run-ended", "sync-failure", "scan-failed"] },
	{ id: "news", sources: ["update", "remote-head"] },
];

const DIAGRAM_FORMATS = [
	{ value: "excalidraw", label: "Excalidraw" },
	{ value: "mermaid", label: "Mermaid" },
	{ value: "drawio", label: "draw.io" },
	{ value: "bpmn", label: "BPMN" },
];

// One queue for all switches: each write reads the stored list after the write before it is done.
let writes: Promise<unknown> = Promise.resolve();

/** The sources that a person turned off (`Prefs.notifyOff`), and the write of a change (REQ-008). */
function useNotifyOff() {
	const [off, setOff] = useState<EventSource[]>([]);
	useEffect(() => {
		unwrap(commands.prefsGet())
			.then((p) => setOff(p.notifyOff))
			.catch(logError);
	}, []);
	const set = (sources: EventSource[], on: boolean) => {
		writes = writes
			.then(() => unwrap(commands.prefsGet()))
			.then((p) =>
				unwrap(
					commands.prefsSet({
						notifyOff: on
							? p.notifyOff.filter((s) => !sources.includes(s))
							: [...p.notifyOff.filter((s) => !sources.includes(s)), ...sources],
					}),
				),
			)
			.then((p) => setOff(p.notifyOff))
			.catch(logError);
	};
	return { off, set };
}

type Notify = ReturnType<typeof useNotifyOff>;

function Notifications({ notify: { off, set } }: { notify: Notify }) {
	const { t } = useI18n();
	const s = t.personal.setup;
	const { sound, setPrefs } = usePrefs();
	// The level of the budget notice is Warn at of the budgets.
	const percent = useBudgetStatus().data?.warnPercent ?? 80;
	const budget = format(t.shellFn.notify.budget, { percent });
	return (
		<SetupCard id="section-notifications" title={t.notifications.title}>
			{/* The design shows the two groups that need a person; the other sources have a switch under More. */}
			{GROUPS.slice(0, 2).map((g) => (
				<SetupRow key={g.id} label={s.notify[g.id]}>
					<Toggle
						label={s.notify[g.id]}
						checked={g.sources.every((x) => !off.includes(x))}
						onCheckedChange={(on) => set(g.sources, on)}
					/>
				</SetupRow>
			))}
			<SetupRow label={budget}>
				<Toggle
					label={budget}
					checked={!off.includes("budget")}
					onCheckedChange={(on) => set(["budget"], on)}
				/>
			</SetupRow>
			<SetupRow label={t.shellFn.notify.sound}>
				<Toggle
					label={t.shellFn.notify.sound}
					checked={sound}
					onCheckedChange={(on) => setPrefs({ sound: on })}
				/>
			</SetupRow>
		</SetupCard>
	);
}

/** One switch for each notification: a row of the More card of Setup / Me. */
function EachNotification({ notify: { off, set } }: { notify: Notify }) {
	const { t } = useI18n();
	return (
		<Fold label={t.personal.setup.eachNotification}>
			{GROUPS.flatMap((g) => g.sources).map((x) => (
				<SetupRow key={x} label={t.notifications.source[x]}>
					<Toggle
						label={t.notifications.source[x]}
						checked={!off.includes(x)}
						onCheckedChange={(on) => set([x], on)}
					/>
				</SetupRow>
			))}
		</Fold>
	);
}

/** A row that runs an action and ends with a chevron, as the rows that open a page. */
function ActionRow({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<Row
			render={(row) => (
				<button
					type="button"
					onClick={onClick}
					{...row}
					className={`${row.className} w-full cursor-pointer text-left hover:bg-n-3`}
				/>
			)}
		>
			<span className="min-w-0 font-semibold">{label}</span>
			<span aria-hidden="true" className="ml-auto flex text-n-11">
				<ChevronRightIcon size={20} />
			</span>
		</Row>
	);
}

/**
 * Setup / Me (`spec:app-redesign#REQ-024`): the theme, the person, the language, the look, the
 * notifications, the updates and the tools. The permissions are under This computer: `permissions`
 * keeps them here for a role that does not see it.
 */
export function Me({ permissions = false }: { permissions?: boolean }) {
	const { t } = useI18n();
	const s = t.personal.setup;
	const prefs = usePrefs();
	const { density, contrast, role, overridden, setPrefs, promptLang, diagramFormat, uiScale } =
		prefs;
	const roles: Role[] = ["none", ...ROLES];
	const avatar = usePicture("avatar").data;
	const handle = useRightsView().data?.person.member;
	const person = useTeam().data?.team.members.find((m) => m.handle === handle)?.name;
	const name = person ?? t.shell.account;
	const { setShortcutsOpen } = useShell();
	const signOut = useSignOut();
	const notify = useNotifyOff();
	// The mark: the active project sets this value, and it replaces the one below.
	const marked = (key: Overridable, control: React.ReactNode) => (
		<>
			{overridden.includes(key) ? <StatusDot status="info" label={t.projects.overridden} /> : null}
			{control}
		</>
	);
	return (
		<>
			<div className="flex flex-col px-4 pb-6">
				<ThemeCard />
			</div>
			<Columns className="pt-0">
				<Column>
					<SetupCard id="section-me" title={t.tabs.settings.me}>
						<SetupRow
							label={
								<span className="flex items-center gap-3">
									<Avatar name={name} src={avatar ?? undefined} />
									{name}
								</span>
							}
						>
							<Button className="min-h-control text-danger-text" onClick={() => void signOut()}>
								{t.shellFn.signOut.label}
							</Button>
						</SetupRow>
						<SetupRow label={s.roleView}>
							<ValueSelect
								label={s.roleView}
								value={role}
								onValueChange={(v) => setPrefs({ role: v as Role })}
								items={roles.map((r) => ({
									value: r,
									label: r === "viewer" ? t.home.roles.viewer : t.role[r],
								}))}
							/>
						</SetupRow>
					</SetupCard>
					<SetupCard id="section-language" title={t.prefs.language}>
						<LanguageRows />
						<SetupRow label={t.prefs.promptLang}>
							<ValueSelect
								label={t.prefs.promptLang}
								value={promptLang || "follow"}
								onValueChange={(v) => setPrefs({ promptLang: v === "follow" ? "" : v })}
								items={[
									{ value: "follow", label: t.prefs.promptFollow },
									...LANGS.map((l) => ({ value: l, label: t.lang[l] })),
								]}
							/>
						</SetupRow>
						<SetupRow label={t.prefs.diagramFormat}>
							<ValueSelect
								label={t.prefs.diagramFormat}
								value={diagramFormat || "excalidraw"}
								onValueChange={(v) => setPrefs({ diagramFormat: v })}
								items={DIAGRAM_FORMATS}
							/>
						</SetupRow>
					</SetupCard>
					<SetupCard id="section-look" title={s.look}>
						<SetupRow label={s.density}>
							{marked(
								"density",
								<span className="-my-1 flex">
									<Segmented
										label={s.density}
										value={density === "compact" ? "compact" : "default"}
										onValueChange={(v) =>
											setPrefs({ density: v === "compact" ? "compact" : "default" })
										}
										items={[
											{ value: "default", label: s.comfortable },
											{ value: "compact", label: t.prefs.compact },
										]}
									/>
								</span>,
							)}
						</SetupRow>
						<SetupRow label={t.prefs.contrast}>
							{marked(
								"contrast",
								<Toggle
									label={t.prefs.contrast}
									checked={contrast === "high"}
									onCheckedChange={(c) => setPrefs({ contrast: c ? "high" : "default" })}
								/>,
							)}
						</SetupRow>
						<SetupRow id="text-size" label={t.workspace.view.size}>
							<Stepper
								label={t.workspace.view.size}
								value={uiScale}
								min={14}
								max={20}
								show={textSizeShown}
								onValueChange={(v) => setPrefs({ uiScale: v })}
							/>
						</SetupRow>
						<SetupRow id="avatar" label={s.picture}>
							<PictureField which="avatar" label={t.extras.picture.avatar} person={name} />
						</SetupRow>
					</SetupCard>
				</Column>
				<Column>
					<Notifications notify={notify} />
					<SetupCard id="section-updates" title={s.updates}>
						<SetupRow label={t.prefs.autoUpdate}>
							<Toggle
								label={t.prefs.autoUpdate}
								checked={prefs.autoUpdateCheck}
								onCheckedChange={(c) => setPrefs({ autoUpdateCheck: c })}
							/>
						</SetupRow>
						<SetupRow label={t.shellFn.notify.channel}>
							<Segmented
								label={t.shellFn.notify.channel}
								value={prefs.releaseChannel}
								onValueChange={(v) => setPrefs({ releaseChannel: v })}
								items={[
									{ value: "stable", label: t.shellFn.notify.stable },
									{ value: "preview", label: t.shellFn.notify.preview },
								]}
							/>
						</SetupRow>
						<Fold label={t.ui.more}>
							<SetupRow label={t.prefs.releaseUrl}>
								<ReleaseUrl />
							</SetupRow>
						</Fold>
					</SetupCard>
					<SetupCard id="section-agent" title={s.tools}>
						<SetupRow label={t.personal.prefs.defaultAgent}>
							<DefaultAgentSelect />
						</SetupRow>
						<SetupRow label={t.reports.terminal.app}>
							<TerminalAppSelect />
						</SetupRow>
						<SetupRow label={t.settings.pages.look} href="/setup/me?page=look" />
						<ActionRow label={s.shortcuts} onClick={() => setShortcutsOpen(true)} />
						<Fold label={t.ui.more}>
							<SetupRow label={t.personal.prefs.defaultModel}>
								<DefaultModelSelect />
							</SetupRow>
						</Fold>
					</SetupCard>
					{permissions ? <PermissionsCard /> : null}
				</Column>
			</Columns>
			<div className="-mt-6 px-4 pb-10">
				<SetupCard title={t.ui.more}>
					<ThemeFiles />
					<LanguageFiles />
					<EachNotification notify={notify} />
					{permissions ? <ReplayTour /> : null}
				</SetupCard>
			</div>
		</>
	);
}
