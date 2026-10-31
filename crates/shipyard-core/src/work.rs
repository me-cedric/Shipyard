//! Work rules: assignee suggestion, effort maths, Gantt, plan diff and time reconciliation
//! (spec `work`). No I/O. A date is `YYYY-MM-DD` text; the maths use a day number inside.
//!
//! No total and no date that these functions compute goes into a file (REQ-010, REQ-017).

use crate::refs::{self, Ref};
use crate::work_item::WorkItem;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::{BTreeMap, BTreeSet, HashMap};

/// One working day is eight hours. An estimate in days maps to minutes with it.
pub const MINUTES_PER_DAY: u32 = 480;

/// The scheduler looks this many days ahead. A task that does not fit is unstaffed.
const HORIZON_DAYS: i32 = 1100;

// ---------------------------------------------------------------- dates

fn days_from_civil(y: i32, m: u32, d: u32) -> i32 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400) as u32;
    let mp = if m > 2 { m - 3 } else { m + 9 };
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe as i32 - 719_468
}

fn civil_from_days(z: i32) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe as i32 + era * 400;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// `YYYY-MM-DD` to a day number, or `None` for a text that is not a real date.
pub fn parse_day(s: &str) -> Option<i32> {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let num = |r: std::ops::Range<usize>| -> Option<u32> {
        let part = s.get(r)?;
        part.bytes()
            .all(|c| c.is_ascii_digit())
            .then(|| part.parse().ok())?
    };
    let (y, m, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let day = days_from_civil(y as i32, m, d);
    (civil_from_days(day) == (y as i32, m, d)).then_some(day)
}

pub fn iso(day: i32) -> String {
    let (y, m, d) = civil_from_days(day);
    format!("{y:04}-{m:02}-{d:02}")
}

fn month_of(day: i32) -> String {
    iso(day)[..7].to_string()
}

/// 0 is Monday.
fn weekday(day: i32) -> u8 {
    (day + 3).rem_euclid(7) as u8
}

// ---------------------------------------------------------------- team

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Span {
    pub from: String,
    pub to: String,
}

/// When a member works at all. Outside `from` and `until`, and inside an absence, capacity is zero.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Availability {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub until: Option<String>,
    pub absences: Vec<Span>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Member {
    pub name: String,
    /// The `<handle>` of `member:<handle>`.
    pub handle: String,
    /// The accounts of this person in the trackers (a Jira account id, a GitHub login).
    pub trackers: Vec<String>,
    pub role: String,
    /// Days per week.
    pub capacity: f64,
    pub skills: Vec<String>,
    /// `None` when the file has none, or when the seal is on and this machine has no passphrase.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub day_rate: Option<f64>,
    pub availability: Availability,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Team {
    pub members: Vec<Member>,
    /// Set by the reader when a day rate is sealed and the passphrase is missing.
    /// A writer refuses a locked team: a write would drop the rates.
    #[serde(skip)]
    pub locked: bool,
}

impl Team {
    /// The member whose handle or tracker account is `id`, compared without case.
    pub fn resolve(&self, id: &str) -> Option<&Member> {
        self.members.iter().find(|m| {
            m.handle.eq_ignore_ascii_case(id)
                || m.trackers.iter().any(|t| t.eq_ignore_ascii_case(id))
        })
    }

    /// Why this team is not valid, or `None` (REQ-003). A handle or a tracker account that two
    /// members share names the duplicate: the pickup would pick the wrong person.
    pub fn check(&self) -> Result<(), String> {
        let mut seen: HashMap<String, usize> = HashMap::new();
        for (i, m) in self.members.iter().enumerate() {
            if m.name.trim().is_empty() {
                return Err(format!("member {} has no name", i + 1));
            }
            if !matches!(
                refs::parse(&format!("member:{}", m.handle)),
                Some(Ref::Slug(..))
            ) {
                return Err(format!(
                    "`{}` is not a handle: use lower case letters, digits and `-`",
                    m.handle
                ));
            }
            if !(0.0..=7.0).contains(&m.capacity) {
                return Err(format!(
                    "capacity of {} is not between 0 and 7 days",
                    m.handle
                ));
            }
            if m.day_rate.is_some_and(|r| r < 0.0 || !r.is_finite()) {
                return Err(format!("day rate of {} is not a number", m.handle));
            }
            for (a, b) in m.availability.absences.iter().map(|s| (&s.from, &s.to)) {
                if parse_day(a).zip(parse_day(b)).is_none_or(|(a, b)| b < a) {
                    return Err(format!("absence of {} is not a range of dates", m.handle));
                }
            }
            for d in [&m.availability.from, &m.availability.until]
                .into_iter()
                .flatten()
            {
                if parse_day(d).is_none() {
                    return Err(format!("availability of {} has a bad date: {d}", m.handle));
                }
            }
            let mut own: Vec<String> = Vec::new();
            for id in std::iter::once(&m.handle)
                .chain(&m.trackers)
                .map(|s| s.to_ascii_lowercase())
            {
                if own.contains(&id) {
                    continue;
                }
                if seen.insert(id.clone(), i).is_some_and(|first| first != i) {
                    return Err(format!("duplicate handle `{id}`"));
                }
                own.push(id);
            }
        }
        Ok(())
    }
}

// ---------------------------------------------------------------- suggestion

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Reason {
    Skill { skill: String },
    MissingSkill { skill: String },
    FreeDays { days: f64 },
    Full,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub handle: String,
    pub score: f64,
    pub reasons: Vec<Reason>,
}

/// Rank the members for an item that wants `skills` (REQ-007). `booked` holds the days that a
/// member already has in the same period as `capacity` (a week), by handle. It never assigns.
/// A skill weighs ten times a free day, so a fit beats a free calendar.
pub fn suggest(skills: &[String], team: &Team, booked: &BTreeMap<String, f64>) -> Vec<Suggestion> {
    let mut out: Vec<Suggestion> = team
        .members
        .iter()
        .map(|m| {
            let mut reasons = Vec::new();
            let mut hits = 0.0;
            for s in skills {
                if m.skills.iter().any(|k| k.eq_ignore_ascii_case(s)) {
                    hits += 1.0;
                    reasons.push(Reason::Skill { skill: s.clone() });
                } else {
                    reasons.push(Reason::MissingSkill { skill: s.clone() });
                }
            }
            let free = m.capacity - booked.get(&m.handle).copied().unwrap_or(0.0);
            reasons.push(if free > 0.0 {
                Reason::FreeDays { days: free }
            } else {
                Reason::Full
            });
            Suggestion {
                handle: m.handle.clone(),
                score: hits * 10.0 + free.max(0.0),
                reasons,
            }
        })
        .collect();
    out.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then_with(|| a.handle.cmp(&b.handle))
    });
    out
}

// ---------------------------------------------------------------- sheet and effort

/// One task of a lot. `days` is a fixed effort. `percent` is a share of the build effort.
/// Exactly one is set.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Task {
    pub id: String,
    pub name: String,
    pub description: String,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub days: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<f64>,
    /// A task in days feeds the build effort unless it says `other`. A percent task never does.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub other: bool,
    /// The `wi:` key of the ticket of this task (REQ-015).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ticket: Option<String>,
    pub note: String,
    /// A three-point estimate: `days` is the likely value. With both ends set, the task counts
    /// the expected value `(optimistic + 4 × likely + pessimistic) / 6`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub optimistic: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pessimistic: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<Confidence>,
    /// What the estimate takes for granted.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub assumptions: String,
}

/// How sure the person is of an estimate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum Confidence {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Feature {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tasks: Vec<Task>,
}

/// An estimate sheet: the features and tasks of one lot (REQ-009). It holds no total.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Sheet {
    pub name: String,
    pub currency: String,
    /// A fraction of the cost: `0.15` makes the price 15 % above the cost.
    pub margin_rate: f64,
    pub features: Vec<Feature>,
    /// A frozen sheet takes no change, except the one that unfreezes it.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub frozen: bool,
}

impl Sheet {
    pub fn tasks(&self) -> impl Iterator<Item = (&Feature, &Task)> {
        self.features
            .iter()
            .flat_map(|f| f.tasks.iter().map(move |t| (f, t)))
    }

    /// Why this sheet is not valid, or `None`.
    pub fn check(&self) -> Result<(), String> {
        if !(0.0..1000.0).contains(&self.margin_rate) {
            return Err("the margin rate is not a number".into());
        }
        let mut ids = BTreeSet::new();
        for f in &self.features {
            for id in std::iter::once(&f.id).chain(f.tasks.iter().map(|t| &t.id)) {
                // The id ends in an `est:<slug>#<row-id>` ref and in a tracker label.
                if !matches!(
                    refs::parse(&format!("est:x#{id}")),
                    Some(Ref::Estimate { row: Some(_), .. })
                ) {
                    return Err(format!(
                        "`{id}` is not a row id: use lower case letters, digits and `-`"
                    ));
                }
                if !ids.insert(id) {
                    return Err(format!("duplicate row id `{id}`"));
                }
            }
            for t in &f.tasks {
                match (t.days, t.percent) {
                    (Some(d), None) if d >= 0.0 && d.is_finite() => {}
                    (None, Some(p)) if p >= 0.0 && p.is_finite() => {}
                    _ => return Err(format!("task `{}` needs days or percent, not both", t.id)),
                }
                match (t.optimistic, t.days, t.pessimistic) {
                    (None, _, None) => {}
                    (Some(o), Some(m), Some(p))
                        if 0.0 <= o && o <= m && m <= p && p.is_finite() => {}
                    _ => {
                        return Err(format!(
                            "task `{}`: the three-point estimate needs optimistic <= likely <= pessimistic",
                            t.id
                        ));
                    }
                }
            }
        }
        Ok(())
    }
}

/// A percentage of the build effort lands on a whole hour.
pub fn round_to_hour(days: f64) -> f64 {
    (days * 8.0).round() / 8.0
}

/// The days of a task in days: the expected value of a three-point estimate, on a whole hour, or
/// the days as written.
pub fn fixed_days(task: &Task) -> Option<f64> {
    let m = task.days?;
    Some(match (task.optimistic, task.pessimistic) {
        (Some(o), Some(p)) => round_to_hour((o + 4.0 * m + p) / 6.0),
        _ => m,
    })
}

/// The days of the tasks in days that count as build.
pub fn build_days(sheet: &Sheet) -> f64 {
    sheet
        .tasks()
        .filter(|(_, t)| !t.other)
        .filter_map(|(_, t)| fixed_days(t))
        .sum()
}

pub fn task_days(task: &Task, build: f64) -> f64 {
    match (fixed_days(task), task.percent) {
        (Some(d), _) => d,
        (None, Some(p)) => round_to_hour(build * p / 100.0),
        _ => 0.0,
    }
}

/// The day rate of each role: the mean rate of the members that have the role (Q-060, option 1).
/// A member with no rate (sealed and locked) is left out. The key is the role in lower case.
pub fn role_rates(team: &Team) -> BTreeMap<String, f64> {
    let mut sums: BTreeMap<String, (f64, f64)> = BTreeMap::new();
    for m in &team.members {
        if let Some(rate) = m.day_rate {
            let e = sums.entry(m.role.to_ascii_lowercase()).or_default();
            e.0 += rate;
            e.1 += 1.0;
        }
    }
    sums.into_iter().map(|(k, (s, n))| (k, s / n)).collect()
}

/// The fewest members with a rate that a role needs before a cost shows its rate. With one, the
/// cost over the days is the rate of that member. With two, each member works out the other one.
pub const MIN_RATED: usize = 3;

/// The rates that a cost may use: [`role_rates`] without the roles of fewer than [`MIN_RATED`]
/// members with a rate. The days of such a role count as unrated.
pub fn shared_rates(team: &Team) -> BTreeMap<String, f64> {
    let mut rates = role_rates(team);
    rates.retain(|role, _| {
        team.members
            .iter()
            .filter(|m| m.day_rate.is_some() && m.role.eq_ignore_ascii_case(role))
            .count()
            >= MIN_RATED
    });
    rates
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Totals {
    pub days: f64,
    pub cost: f64,
    pub price: f64,
    pub margin: f64,
    /// The roles of tasks that no member rate covers. Their days cost nothing in `cost`.
    pub unrated: Vec<String>,
}

fn rate_of(rates: &BTreeMap<String, f64>, role: &str) -> Option<f64> {
    rates.get(&role.to_ascii_lowercase()).copied()
}

/// Price, cost and margin of a sheet from its entries and the role rates (REQ-010).
pub fn totals(sheet: &Sheet, rates: &BTreeMap<String, f64>) -> Totals {
    let build = build_days(sheet);
    let mut t = Totals::default();
    let mut unrated = BTreeSet::new();
    for (_, task) in sheet.tasks() {
        let days = task_days(task, build);
        t.days += days;
        match rate_of(rates, &task.role) {
            Some(r) => t.cost += days * r,
            None if days > 0.0 => {
                unrated.insert(task.role.clone());
            }
            None => {}
        }
    }
    t.price = t.cost * (1.0 + sheet.margin_rate);
    t.margin = t.price - t.cost;
    t.unrated = unrated.into_iter().collect();
    t
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Portfolio {
    /// One row for each sheet, by slug.
    pub sheets: Vec<(String, Totals)>,
    pub total: Totals,
}

/// All sheets together (REQ-011). Each sheet keeps its own margin rate.
pub fn portfolio(sheets: &[(String, Sheet)], rates: &BTreeMap<String, f64>) -> Portfolio {
    let rows: Vec<(String, Totals)> = sheets
        .iter()
        .map(|(s, sh)| (s.clone(), totals(sh, rates)))
        .collect();
    let mut total = Totals::default();
    let mut unrated = BTreeSet::new();
    for (_, t) in &rows {
        total.days += t.days;
        total.cost += t.cost;
        total.price += t.price;
        total.margin += t.margin;
        unrated.extend(t.unrated.iter().cloned());
    }
    total.unrated = unrated.into_iter().collect();
    Portfolio {
        sheets: rows,
        total,
    }
}

// ---------------------------------------------------------------- Gantt

/// Working days and public holidays (REQ-016).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Calendar {
    /// 1 is Monday, 7 is Sunday.
    pub working_days: Vec<u8>,
    /// The days off that the team adds. The public holidays of `country` come on top.
    pub holidays: Vec<String>,
    /// The country of the public holidays (`holidays::COUNTRIES`). Empty for none. A file with no
    /// country (written before the field existed) has none; a new project starts with France.
    #[serde(default = "no_country")]
    pub country: String,
}

fn no_country() -> String {
    String::new()
}

impl Default for Calendar {
    fn default() -> Self {
        Self {
            working_days: vec![1, 2, 3, 4, 5],
            holidays: Vec::new(),
            country: "FR".into(),
        }
    }
}

impl Calendar {
    /// The public holidays of the country from the year before `today` to four years after: the
    /// span that the scheduler can reach.
    pub fn public_holidays(&self, today: &str) -> Vec<String> {
        let year = today.get(..4).and_then(|y| y.parse().ok()).unwrap_or(2026);
        (year - 1..=year + 4)
            .flat_map(|y| crate::holidays::public(&self.country, y))
            .collect()
    }

    /// The calendar with the public holidays in `holidays`, for the scheduler. Never written.
    fn effective(&self, today: &str) -> Calendar {
        let mut c = self.clone();
        c.holidays.extend(self.public_holidays(today));
        c
    }

    fn works(&self, day: i32) -> bool {
        // A stored holiday is a valid `YYYY-MM-DD`, so the text compares as the day.
        self.working_days.contains(&(weekday(day) + 1)) && !self.holidays.contains(&iso(day))
    }

    fn next_working(&self, mut day: i32) -> i32 {
        for _ in 0..HORIZON_DAYS {
            if self.works(day) {
                break;
            }
            day += 1;
        }
        day
    }
}

/// What a person decided about one task.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct TaskDecision {
    /// A fixed start date.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start: Option<String>,
    /// A member handle.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub member: Option<String>,
}

/// The decisions of a person, for all sheets (REQ-017). Keys are `est:<slug>#<task-id>`.
/// It holds no computed date.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Decisions {
    /// Task refs, the first gets capacity first. A task that is not here follows in sheet order.
    pub order: Vec<String>,
    pub tasks: BTreeMap<String, TaskDecision>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MonthSpend {
    pub month: String,
    pub days: f64,
    pub cost: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Bar {
    pub task: String,
    pub feature: String,
    pub name: String,
    pub role: String,
    /// `None` when no member fits. The bar then runs one day for each day of effort.
    pub member: Option<String>,
    pub start: String,
    pub end: String,
    pub days: f64,
    pub months: Vec<MonthSpend>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Gantt {
    pub bars: Vec<Bar>,
}

impl Gantt {
    /// Effort and cost by month over all bars (REQ-011). It sums to the summary of the sheet.
    pub fn spread(&self) -> Vec<MonthSpend> {
        let mut by: BTreeMap<&str, (f64, f64)> = BTreeMap::new();
        for m in self.bars.iter().flat_map(|b| &b.months) {
            let e = by.entry(&m.month).or_default();
            e.0 += m.days;
            e.1 += m.cost;
        }
        by.into_iter()
            .map(|(month, (days, cost))| MonthSpend {
                month: month.into(),
                days,
                cost,
            })
            .collect()
    }
}

/// Capacity of a member on a day, in days. Zero outside the availability and in an absence.
fn day_capacity(m: &Member, cal: &Calendar, day: i32) -> f64 {
    let a = &m.availability;
    let before = a
        .from
        .as_deref()
        .and_then(parse_day)
        .is_some_and(|f| day < f);
    let after = a
        .until
        .as_deref()
        .and_then(parse_day)
        .is_some_and(|u| day > u);
    let away = a.absences.iter().any(|s| {
        parse_day(&s.from)
            .zip(parse_day(&s.to))
            .is_some_and(|(f, t)| (f..=t).contains(&day))
    });
    if before || after || away || !cal.works(day) || cal.working_days.is_empty() {
        0.0
    } else {
        (m.capacity / cal.working_days.len() as f64).min(1.0)
    }
}

type Spend = Vec<(i32, f64)>;

/// The days a member gives to `days` of work from `from`, given what the member already gave.
fn place(
    m: &Member,
    cal: &Calendar,
    used: &HashMap<(usize, i32), f64>,
    idx: usize,
    from: i32,
    days: f64,
) -> Option<Spend> {
    let mut left = days;
    let mut spend = Vec::new();
    for day in from..from + HORIZON_DAYS {
        let free = day_capacity(m, cal, day) - used.get(&(idx, day)).copied().unwrap_or(0.0);
        if free > 1e-9 {
            let take = free.min(left);
            spend.push((day, take));
            left -= take;
            if left <= 1e-9 {
                return Some(spend);
            }
        }
    }
    None
}

/// The days that each member gave to the tasks: by member index and day number.
type Used = HashMap<(usize, i32), f64>;

/// Schedule one sheet over the team, the calendar and the decisions of a person (REQ-016).
/// Each member works at the capacity of the member, tasks take capacity in the order of
/// `Decisions::order`, a task with no member choice goes to the member of its role that
/// finishes first. `today` is the first day when no decision fixes a start.
pub fn gantt(
    slug: &str,
    sheet: &Sheet,
    team: &Team,
    cal: &Calendar,
    decisions: &Decisions,
    today: &str,
) -> Gantt {
    schedule(slug, sheet, team, cal, decisions, today).0
}

/// The days that each member has booked from `today` over `span` days, by handle, across all
/// sheets (REQ-007). A sheet is scheduled alone, so two lots can book the same member on one
/// day: the sum then exceeds the capacity and the suggestion shows the member as full. A member
/// with no booked day is not in the map.
pub fn booked(
    sheets: &[(String, Sheet)],
    team: &Team,
    cal: &Calendar,
    decisions: &Decisions,
    today: &str,
    span: i32,
) -> BTreeMap<String, f64> {
    let from = parse_day(today).unwrap_or(0);
    let mut out: BTreeMap<String, f64> = BTreeMap::new();
    for (slug, sheet) in sheets {
        let (_, used) = schedule(slug, sheet, team, cal, decisions, today);
        for ((idx, day), days) in used {
            if (from..from + span).contains(&day) {
                *out.entry(team.members[idx].handle.clone()).or_default() += days;
            }
        }
    }
    out
}

/// One day of a member, or of the whole team: the days given and the days the capacity allows.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LoadDay {
    pub day: String,
    pub used: f64,
    pub capacity: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MemberLoad {
    pub handle: String,
    /// The days with work, in date order.
    pub days: Vec<LoadDay>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Load {
    pub members: Vec<MemberLoad>,
    /// Every member together, each working day from the first to the last busy day.
    pub team: Vec<LoadDay>,
}

/// The days that each member gives to all sheets, day by day, beside the capacity (REQ-016). A
/// sheet is scheduled alone, so `used` can be above `capacity`: the member is over capacity on
/// that day. Computed, never written.
pub fn load(
    sheets: &[(String, Sheet)],
    team: &Team,
    cal: &Calendar,
    decisions: &Decisions,
    today: &str,
) -> Load {
    let eff = cal.effective(today);
    let mut used: Used = HashMap::new();
    for (slug, sheet) in sheets {
        for (k, v) in schedule(slug, sheet, team, cal, decisions, today).1 {
            *used.entry(k).or_default() += v;
        }
    }
    let round = |n: f64| (n * 1e6).round() / 1e6;
    let (Some(lo), Some(hi)) = (
        used.keys().map(|k| k.1).min(),
        used.keys().map(|k| k.1).max(),
    ) else {
        return Load::default();
    };
    let members = team
        .members
        .iter()
        .enumerate()
        .filter_map(|(i, m)| {
            let mut days: Vec<(i32, f64)> = used
                .iter()
                .filter(|((j, _), _)| *j == i)
                .map(|((_, d), u)| (*d, *u))
                .collect();
            days.sort_by_key(|d| d.0);
            (!days.is_empty()).then(|| MemberLoad {
                handle: m.handle.clone(),
                days: days
                    .into_iter()
                    .map(|(d, u)| LoadDay {
                        day: iso(d),
                        used: round(u),
                        capacity: round(day_capacity(m, &eff, d)),
                    })
                    .collect(),
            })
        })
        .collect();
    let team_days = (lo..=hi)
        .map(|d| LoadDay {
            day: iso(d),
            used: round(
                (0..team.members.len())
                    .filter_map(|i| used.get(&(i, d)))
                    .sum(),
            ),
            capacity: round(team.members.iter().map(|m| day_capacity(m, &eff, d)).sum()),
        })
        .filter(|d| d.capacity > 0.0 || d.used > 0.0)
        .collect();
    Load {
        members,
        team: team_days,
    }
}

fn schedule(
    slug: &str,
    sheet: &Sheet,
    team: &Team,
    cal: &Calendar,
    decisions: &Decisions,
    today: &str,
) -> (Gantt, Used) {
    let cal = &cal.effective(today);
    let rates = shared_rates(team);
    let build = build_days(sheet);
    let first = cal.next_working(parse_day(today).unwrap_or(0));
    let reference = |id: &str| format!("est:{slug}#{id}");

    let mut tasks: Vec<(&Feature, &Task)> = sheet.tasks().collect();
    let rank = |t: &Task| {
        decisions
            .order
            .iter()
            .position(|r| *r == reference(&t.id))
            .unwrap_or(usize::MAX)
    };
    tasks.sort_by_key(|(_, t)| rank(t)); // stable: the rest keeps the sheet order

    let mut used: Used = HashMap::new();
    let mut bars: HashMap<String, Bar> = HashMap::new();
    for (feature, task) in tasks {
        let days = task_days(task, build);
        let key = reference(&task.id);
        let decision = decisions.tasks.get(&key);
        let start = decision
            .and_then(|d| d.start.as_deref())
            .and_then(parse_day)
            .map_or(first, |d| cal.next_working(d));
        let chosen = decision.and_then(|d| d.member.as_deref());
        let candidates: Vec<usize> = team
            .members
            .iter()
            .enumerate()
            .filter(|(_, m)| match chosen {
                Some(h) => m.handle.eq_ignore_ascii_case(h),
                None => m.role.eq_ignore_ascii_case(&task.role),
            })
            .map(|(i, _)| i)
            .collect();
        let best = candidates
            .into_iter()
            .filter_map(|i| place(&team.members[i], cal, &used, i, start, days).map(|s| (i, s)))
            .min_by(|(i, a), (j, b)| {
                let end = |s: &Spend| s.last().map_or(start, |d| d.0);
                end(a)
                    .cmp(&end(b))
                    .then_with(|| team.members[*i].handle.cmp(&team.members[*j].handle))
            });
        let (member, spend) = match best {
            Some((i, spend)) => {
                for (day, take) in &spend {
                    *used.entry((i, *day)).or_default() += take;
                }
                (Some(team.members[i].handle.clone()), spend)
            }
            None => (None, unstaffed(cal, start, days)),
        };
        let rate = rate_of(&rates, &task.role).unwrap_or(0.0);
        let mut months: BTreeMap<String, f64> = BTreeMap::new();
        for (day, take) in &spend {
            *months.entry(month_of(*day)).or_default() += take;
        }
        bars.insert(
            key.clone(),
            Bar {
                task: key,
                feature: feature.name.clone(),
                name: task.name.clone(),
                role: task.role.clone(),
                member,
                start: iso(spend.first().map_or(start, |d| d.0)),
                end: iso(spend.last().map_or(start, |d| d.0)),
                days,
                months: months
                    .into_iter()
                    .map(|(month, days)| MonthSpend {
                        month,
                        days,
                        cost: days * rate,
                    })
                    .collect(),
            },
        );
    }
    let gantt = Gantt {
        bars: sheet
            .tasks()
            .filter_map(|(_, t)| bars.remove(&reference(&t.id)))
            .collect(),
    };
    (gantt, used)
}

/// One day of effort for each working day, from `start`.
fn unstaffed(cal: &Calendar, start: i32, days: f64) -> Spend {
    let mut left = days;
    let mut day = start;
    let mut out = Vec::new();
    while left > 1e-9 {
        day = cal.next_working(day);
        let take = left.min(1.0);
        out.push((day, take));
        left -= take;
        day += 1;
    }
    out
}

// ---------------------------------------------------------------- plan diff

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum RowKind {
    Epic,
    Story,
}

/// One ticket that the sheets ask for. A feature is an epic. A task is a story.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    /// `est:<slug>#<row-id>`. The ticket holds it as a label (Q-033).
    pub reference: String,
    pub kind: RowKind,
    pub title: String,
    pub description: String,
    /// The estimate of a story, in days. `None` for an epic.
    pub days: Option<f64>,
    /// The ref of the epic row of a story.
    pub parent: Option<String>,
}

/// The rows of one sheet. The effort comes from the sheet at call time and is kept nowhere (REQ-019).
pub fn rows(slug: &str, sheet: &Sheet) -> Vec<Row> {
    let build = build_days(sheet);
    let mut out = Vec::new();
    for f in &sheet.features {
        let epic = format!("est:{slug}#{}", f.id);
        out.push(Row {
            reference: epic.clone(),
            kind: RowKind::Epic,
            title: f.name.clone(),
            description: f.description.clone(),
            days: None,
            parent: None,
        });
        for t in &f.tasks {
            out.push(Row {
                reference: format!("est:{slug}#{}", t.id),
                kind: RowKind::Story,
                title: t.name.clone(),
                description: t.description.clone(),
                days: Some(task_days(t, build)),
                parent: Some(epic.clone()),
            });
        }
    }
    out
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum Action {
    Create,
    Update,
    Unchanged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum Field {
    Title,
    Description,
    Estimate,
    Parent,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiffRow {
    pub row: Row,
    pub action: Action,
    /// The key of the matching ticket.
    pub key: Option<String>,
    /// What differs, for an update.
    pub changes: Vec<Field>,
}

/// Mark each row create, update or unchanged against the mirror (REQ-025). A ticket matches a
/// row when it holds the row ref as a label. It reads the mirror and writes nothing.
pub fn plan_diff(rows: Vec<Row>, mirror: &[WorkItem]) -> Vec<DiffRow> {
    let find = |r: &str| mirror.iter().find(|i| i.labels.iter().any(|l| l == r));
    rows.into_iter()
        .map(|row| {
            let Some(item) = find(&row.reference) else {
                return DiffRow {
                    row,
                    action: Action::Create,
                    key: None,
                    changes: vec![],
                };
            };
            let mut changes = Vec::new();
            if item.title != row.title {
                changes.push(Field::Title);
            }
            if item.description.trim() != row.description.trim() {
                changes.push(Field::Description);
            }
            let want = row
                .days
                .map(|d| (d * f64::from(MINUTES_PER_DAY)).round() as u64);
            if want.is_some() && item.time.as_ref().and_then(|t| t.estimate_minutes) != want {
                changes.push(Field::Estimate);
            }
            let parent_key = row.parent.as_deref().and_then(find).map(|p| p.key.as_str());
            if row.parent.is_some() && item.parent.as_deref() != parent_key {
                changes.push(Field::Parent);
            }
            DiffRow {
                action: if changes.is_empty() {
                    Action::Unchanged
                } else {
                    Action::Update
                },
                key: Some(item.key.clone()),
                changes,
                row,
            }
        })
        .collect()
}

// ---------------------------------------------------------------- time

/// A time entry that a person wrote (REQ-020, REQ-021).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct TimeEntry {
    pub id: String,
    pub day: String,
    pub minutes: u32,
    pub note: String,
    /// The `wi:` key of the ticket.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ticket: Option<String>,
    /// The tracker worklog id: the receipt (REQ-023).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worklog: Option<String>,
}

const MARK: &str = "shipyard log=";

/// The note that a sent worklog carries: the text, then the mark of the entry (REQ-023).
pub fn worklog_note(note: &str, entry_id: &str) -> String {
    match note.trim() {
        "" => format!("{MARK}{entry_id}"),
        text => format!("{text}\n\n{MARK}{entry_id}"),
    }
}

/// The entry id in a worklog note. The last mark wins, so text typed by a person cannot
/// point a worklog at another entry.
pub fn parse_mark(comment: &str) -> Option<String> {
    comment
        .lines()
        .rev()
        .find_map(|l| l.trim().strip_prefix(MARK))
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(String::from)
}

/// A worklog as the tracker holds it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackerLog {
    pub id: String,
    pub minutes: u32,
    pub note: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum TimeState {
    InTracker,
    ToSend,
    OnlyInTracker,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TimeRow {
    pub state: TimeState,
    pub entry: Option<TimeEntry>,
    pub log: Option<TrackerLog>,
    /// The two durations differ. The system flags it and never corrects it (REQ-024).
    pub differs: bool,
    /// A worklog carries the mark of this entry but the entry has no receipt: a lost
    /// response. The person stores the id, the system does not send again.
    pub lost_receipt: bool,
}

/// Put the entries of a ticket beside its tracker worklogs (REQ-024). It never adds the two.
pub fn reconcile(entries: &[TimeEntry], logs: &[TrackerLog]) -> Vec<TimeRow> {
    let mut rows = Vec::new();
    let mut paired: BTreeSet<&str> = BTreeSet::new();
    for e in entries {
        let by_receipt = e
            .worklog
            .as_deref()
            .and_then(|w| logs.iter().find(|l| l.id == w));
        let by_mark = || {
            logs.iter()
                .find(|l| parse_mark(&l.note).as_deref() == Some(e.id.as_str()))
        };
        let log = by_receipt.or_else(by_mark);
        if let Some(l) = log {
            paired.insert(&l.id);
        }
        rows.push(TimeRow {
            state: if log.is_some() || e.worklog.is_some() {
                TimeState::InTracker
            } else {
                TimeState::ToSend
            },
            differs: log.is_some_and(|l| l.minutes != e.minutes),
            lost_receipt: e.worklog.is_none() && log.is_some(),
            entry: Some(e.clone()),
            log: log.cloned(),
        });
    }
    for l in logs.iter().filter(|l| !paired.contains(l.id.as_str())) {
        rows.push(TimeRow {
            state: TimeState::OnlyInTracker,
            entry: None,
            log: Some(l.clone()),
            differs: false,
            lost_receipt: false,
        });
    }
    rows
}
