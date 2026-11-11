//! The questions loop in the engine (spec `questions-loop`, REQ-002, REQ-004 to REQ-007, REQ-009,
//! REQ-011 to REQ-014, REQ-016 to REQ-019) and the agent tools of the run bus (`factory`
//! REQ-016 to REQ-019): [`Factory`] implements `shipyard_mcp::tools::agent::AgentEvents`.
//!
//! Ask: check the shape, give the next Q-NNN, write the RAID file of a spec question, move the run
//! to `WaitingForAnswer` (the ticket follows the state map), post the marked comment. Answer: the
//! first reply after the marker (`pickup::answers`), or a choice in the Inbox. A choice in the
//! Inbox also goes on the ticket as one comment with the marker `<!-- shipyard:a Q-NNN -->`
//! (REQ-016). The run goes back
//! to its return state when no question of it is open; the agents start again with the answers,
//! on their CLI session when they have one.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use shipyard_core::delivery::clean_outgoing;
use shipyard_core::question::{Choice, Outcome, Question, QuestionState, all_answered};
use shipyard_core::rights::{Found, identify};
use shipyard_core::run::{Cause, RunEvent, RunState};
use shipyard_core::work_item::Comment;
use shipyard_mcp::session::Binding;
use shipyard_mcp::tools::agent::{self, AgentEvent, AgentEvents, AskQuestion};
use shipyard_store::raid;
use shipyard_store::run_log::kind;

use crate::approvals::Write;
use crate::fence::fence;
use crate::iso;
use crate::run_engine::{ALERT, Factory, Inner};

/// Run log kind of each question event: asked, answered, unclear, late, edited, withdrawn.
pub const QUESTION: &str = "question";

/// A question of a run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Asked {
    pub q: Question,
    /// The step that asked.
    pub step: String,
    /// Seconds.
    pub at: u64,
    pub reminded: bool,
    /// The unclear reply was asked again once.
    pub again: bool,
}

/// The comment of a question (REQ-006): the marker, the options from 1 with the recommended one
/// marked, one line that tells how to reply.
pub fn question_comment(q: &Question, lead: &str) -> String {
    let mut body = format!(
        "<!-- shipyard:q {} -->\n**{}** {lead}{}\n\n",
        q.id, q.id, q.question
    );
    for (i, o) in q.options.iter().enumerate() {
        let mark = if q.recommended as usize == i + 1 {
            " (recommended)"
        } else {
            ""
        };
        body.push_str(&format!("{}. {o}{mark}\n", i + 1));
    }
    body.push_str("\nReply with the option number, a letter or `/answer B`.");
    if q.free_text {
        body.push_str(" Free text is also an answer.");
    }
    // The agent wrote the question: no attribution line, no mention that notifies a person.
    clean_outgoing(&body)
}

/// The comment that an answer in the app posts (`questions-loop` REQ-016): the answer marker and
/// the chosen option or text. It repeats the question when the question comment never went out
/// (`lead`). The text is a person's: no mention that notifies anybody.
fn answer_comment(q: &Question, with_question: bool) -> String {
    let mut body = format!("<!-- shipyard:a {} -->\n**{}** ", q.id, q.id);
    if with_question {
        body.push_str(&format!("{}\n\n", q.question));
    }
    match q.answer.as_ref().map(|a| &a.choice) {
        Some(Choice::Option { n }) => body.push_str(&format!("Answer: {n}. {}", answer_text(q))),
        _ => body.push_str(&format!("Answer: {}", answer_text(q))),
    }
    clean_outgoing(&body)
}

fn answer_text(q: &Question) -> String {
    match q.answer.as_ref().map(|a| &a.choice) {
        Some(Choice::Option { n }) => q.options.get(*n as usize - 1).cloned().unwrap_or_default(),
        Some(Choice::Text { text }) => text.clone(),
        None => String::new(),
    }
}

fn outcome_name(o: Outcome) -> &'static str {
    match o {
        Outcome::Answered => "answered",
        Outcome::Unclear => "unclear",
        Outcome::Late => "late",
        Outcome::Closed => "closed",
    }
}

impl Factory {
    /// `ask_question` of an agent (REQ-002, REQ-004 to REQ-007). Returns the question id.
    pub fn ask(&self, run_id: &str, step: &str, a: AskQuestion) -> Result<String, String> {
        self.lock().ask(run_id, step, a)
    }

    /// An answer in the Inbox, or the choice on the card of an unclear reply (REQ-008, REQ-011).
    pub fn answer(&self, run_id: &str, id: &str, choice: Choice) -> Result<(), String> {
        let mut inner = self.lock();
        let i = inner.question(run_id, id)?;
        let out = inner.rec(run_id).questions[i].q.choose(choice);
        if out == Outcome::Unclear {
            return Err("the choice is not an option of the question".into());
        }
        inner.after_reply(run_id, i, out, "");
        if out == Outcome::Answered {
            inner.post_answer(run_id, i);
        }
        Ok(())
    }

    /// A ticket comment changed. An answer keeps its text; the log and the card note it (REQ-012).
    pub fn comment_edited(&self, key: &str, comment: &str) {
        let mut inner = self.lock();
        let ids: Vec<String> = inner
            .runs
            .values()
            .filter(|r| r.key == key)
            .map(|r| r.id.clone())
            .collect();
        for id in ids {
            for i in 0..inner.runs[&id].questions.len() {
                if inner.rec(&id).questions[i].q.edit(comment) {
                    let q = &inner.runs[&id].questions[i].q;
                    let payload = json!({"ref": format!("q:{}", q.id), "outcome": "edited", "comment": comment});
                    inner.log(&id, None, QUESTION, payload);
                }
            }
        }
    }

    /// Every question with its run id, for the Inbox and the inspector (REQ-020).
    pub fn questions(&self) -> Vec<(String, Question)> {
        let inner = self.lock();
        inner
            .runs
            .values()
            .flat_map(|r| r.questions.iter().map(|a| (r.id.clone(), a.q.clone())))
            .collect()
    }

    /// `post_progress` and every other tool call: one `tool` event in the run log (REQ-016).
    /// It resets the stall timer of the step.
    pub fn tool(&self, run_id: &str, step: &str, payload: Value) -> Result<(), String> {
        let mut inner = self.lock();
        inner.run(run_id)?;
        inner.tool_event(run_id, step, payload);
        Ok(())
    }

    /// `report`: the step ends with this output (REQ-018). A review that is not `done` has a
    /// blocking finding (REQ-036). A `failed` report is a failed step, with its retries.
    pub fn report(&self, run_id: &str, step: &str, r: agent::Report) -> Result<(), String> {
        let mut inner = self.lock();
        let (sid, i) = inner.locate(run_id, step)?;
        let mut out = r.output.clone().unwrap_or_default();
        out.entry("summary")
            .or_insert_with(|| r.summary.clone().into());
        let payload = json!({
            "tool": "report", "outcome": r.outcome, "summary": r.summary, "refs": r.refs,
            "output": out,
        });
        inner.log(run_id, Some(step), kind::TOOL, payload);
        match r.outcome {
            agent::Outcome::Failed => inner.unit_failed(run_id, &sid, i, &r.summary),
            o => inner.unit_done(
                run_id,
                &sid,
                i,
                Value::Object(out),
                o != agent::Outcome::Done,
            ),
        }
        inner.pump_run(run_id);
        Ok(())
    }
}

impl AgentEvents for Factory {
    /// The run bus. `read_ref` reads the index of the project of the run. A call of an old
    /// attempt is ignored and logged (REQ-059).
    fn emit(&self, who: &Binding, event: AgentEvent) -> Result<Value, String> {
        self.fenced(who)?;
        let (run, step) = (who.run.as_str(), who.step.as_str());
        match event {
            AgentEvent::AskQuestion(a) => {
                let id = self.ask(run, step, a)?;
                Ok(json!({"question": id, "state": "the run waits for the answer"}))
            }
            AgentEvent::PostProgress(p) => {
                self.tool(run, step, json!({"tool": "post_progress", "text": p.text}))?;
                Ok(json!({"ok": true}))
            }
            AgentEvent::Report(r) => {
                self.report(run, step, r)?;
                Ok(json!({"ok": true}))
            }
            AgentEvent::Message(m) => self.lock().message(run, step, m),
            AgentEvent::Handoff(h) => self.lock().handoff(run, step, h),
            AgentEvent::SpawnSubtask(t) => self.lock().spawn(run, step, t),
            AgentEvent::ReadRef(r) => self.read_ref(run, step, &r.reference),
            AgentEvent::ReadTicket(t) => {
                let inner = self.lock();
                inner.may_read(run, Some(shipyard_core::rights::Area::Work))?;
                let key = t
                    .reference
                    .strip_prefix("wi:")
                    .ok_or("a ticket ref starts with `wi:`")?;
                let p = inner.project_of(run).ok_or("the run is not open")?;
                let ticket = p
                    .mirror
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .ticket(&p.source, key)
                    .map_err(|e| e.to_string())?
                    .ok_or_else(|| format!("{} is not in the mirror", t.reference))?;
                serde_json::to_value(ticket).map_err(|e| e.to_string())
            }
        }
    }
}

impl Inner {
    fn question(&self, run_id: &str, id: &str) -> Result<usize, String> {
        self.run(run_id)?
            .questions
            .iter()
            .position(|a| a.q.id == id)
            .ok_or_else(|| format!("no question {id} in run {run_id}"))
    }

    fn ask(&mut self, run_id: &str, step: &str, a: AskQuestion) -> Result<String, String> {
        let rec = self.run(run_id)?;
        let state = rec.run.state;
        if !(state.clocks_run() || state == shipyard_core::run::RunState::WaitingForAnswer) {
            return Err(format!("the run cannot ask in {}", state.as_str()));
        }
        if matches!(a.kind, agent::QuestionKind::Spec) && a.spec.is_none() {
            return Err("a spec question needs the ref of its spec".into());
        }
        let mut q = Question::new(
            "Q-0",
            &a.question,
            a.options,
            a.recommended,
            a.free_text,
            a.spec,
        )
        .map_err(|e| e.to_string())?;
        let (key, project) = (rec.key.clone(), rec.project.clone());
        let taken: Vec<String> = self
            .runs
            .values()
            .filter(|r| r.project == project)
            .flat_map(|r| r.questions.iter().map(|a| a.q.id.clone()))
            .collect();
        let root = self
            .projects
            .get(&project)
            .ok_or("the project is not open")?
            .root
            .clone();
        let now = self.now_s();
        q.id = match &q.spec {
            // REQ-007: the RAID file, in the working copy, not committed. `create` takes the id.
            Some(_) => {
                let by = format!("run:{run_id}/{step}");
                let item = raid::from_question(&q, &iso(self.clock.now()), &by, &key);
                raid::create(&root, item, &taken)
                    .map_err(|e| e.to_string())?
                    .id
            }
            None => raid::next_id(
                &raid::list_register(&root).map_err(|e| e.to_string())?,
                &taken,
            ),
        };
        let id = q.id.clone();
        let payload = json!({
            "tool": "ask_question", "ref": format!("q:{id}"), "ticket": format!("wi:{key}"),
            "question": q,
        });
        self.log(run_id, Some(step), QUESTION, payload);
        let comment = question_comment(&q, "");
        self.rec(run_id).questions.push(Asked {
            q,
            step: step.into(),
            at: now,
            reminded: false,
            again: false,
        });
        self.transition(run_id, RunEvent::Ask);
        if self
            .project_of(run_id)
            .is_some_and(|p| p.writer.can_comment())
        {
            self.write(run_id, Write::Comment { key, body: comment });
        }
        Ok(id)
    }

    /// The answer of a person in the app goes on the ticket too (`questions-loop` REQ-016). The
    /// click is the consent for this one comment: it goes at once, whatever the comment switch
    /// says. A question comment that still waits for a click is replaced by one comment that
    /// holds the question and the answer. A tracker with no comments gets none.
    fn post_answer(&mut self, run_id: &str, i: usize) {
        let q = self.runs[run_id].questions[i].q.clone();
        if !self
            .project_of(run_id)
            .is_some_and(|p| p.writer.can_comment())
        {
            let note = json!({"note": format!("{}: the answer is not on the ticket: the tracker has no comments", q.id)});
            self.log(run_id, None, kind::NOTE, note);
            return;
        }
        let replaced = self.drop_question_approvals(run_id, &q.id);
        let key = self.runs[run_id].key.clone();
        let body = answer_comment(&q, replaced);
        self.send(run_id, &Write::Comment { key, body }, None);
    }

    /// A new ticket comment from the tick (REQ-009, REQ-022).
    pub(crate) fn on_comment(
        &mut self,
        key: &str,
        c: &Comment,
        answers: Option<&str>,
        stop: Option<&str>,
    ) {
        let hit = answers.and_then(|qid| {
            self.runs.values().find_map(|r| {
                let i = r.questions.iter().position(|a| a.q.id == qid)?;
                (r.key == key).then(|| (r.id.clone(), i))
            })
        });
        if let Some((run_id, i)) = hit {
            let out = self.rec(&run_id).questions[i].q.reply(&c.id, &c.body);
            self.after_reply(&run_id, i, out, &c.id);
        }
        if let Some(run_id) = stop {
            self.stop_reply(key, run_id, c);
        }
    }

    /// A reply on the ticket after a stop report (REQ-022). The first reply of a team member
    /// unblocks the run, with the reply as the message. A member is a person that the team file
    /// finds, or anyone while the team names no admin. Any other reply is logged and changes
    /// nothing: a reply never resumes a `Paused` run.
    fn stop_reply(&mut self, key: &str, run_id: &str, c: &Comment) {
        let Some(rec) = self.runs.get(run_id).filter(|r| r.key == key) else {
            return;
        };
        let (state, project) = (rec.run.state, rec.project.clone());
        if !matches!(state, RunState::Blocked | RunState::Paused) {
            return;
        }
        // A team with no admin (or no team file) is Solo: any reply counts (adr:0022). A project
        // on a public issue tracker names an admin to close this. A team that the app could not
        // read is not in `teams`: nobody is a member. The tracker account only: a display name is
        // not unique.
        let member = self.teams.get(&project).is_some_and(|t| {
            let (m, found) = identify(t, std::slice::from_ref(&c.author.id), None);
            m.is_some() || found == Found::Solo
        });
        let why = match (state, member) {
            (RunState::Paused, _) => Some("a reply does not resume a paused run"),
            (_, false) => Some("the author is not a team member"),
            _ => None,
        };
        if let Some(why) = why {
            let note = json!({"note": format!("reply {} of {}: {why}", c.id, c.author.id)});
            self.log(run_id, None, kind::NOTE, note);
            return;
        }
        let text = fence("ticket reply", &c.body);
        if let Err(e) = self.unblock_with(run_id, Some(&text)) {
            self.log(
                run_id,
                None,
                kind::NOTE,
                json!({"note": format!("reply {}: {e}", c.id)}),
            );
        }
        self.pump_run(run_id);
    }

    fn after_reply(&mut self, run_id: &str, i: usize, out: Outcome, comment: &str) {
        let a = &self.runs[run_id].questions[i];
        let (q, again) = (a.q.clone(), a.again);
        let payload = json!({
            "ref": format!("q:{}", q.id), "outcome": outcome_name(out), "comment": comment,
            "answer": q.answer, "text": answer_text(&q), "unclear": q.unclear,
        });
        self.log(run_id, None, QUESTION, payload);
        match out {
            // Ask again once (`q:Q-027`); after that the card decides.
            Outcome::Unclear if !again => {
                self.rec(run_id).questions[i].again = true;
                let key = self.runs[run_id].key.clone();
                if self
                    .project_of(run_id)
                    .is_some_and(|p| p.writer.can_comment())
                {
                    let body = question_comment(&q, "The reply is not clear. ");
                    self.write(run_id, Write::Comment { key, body });
                }
            }
            Outcome::Answered => {
                if q.spec.is_some()
                    && let Some(root) = self.project_of(run_id).map(|p| p.root.clone())
                    && let Err(e) = raid::answer(&root, &q.id, &answer_text(&q))
                {
                    self.log(
                        run_id,
                        None,
                        kind::NOTE,
                        json!({"note": format!("{}: {e}", q.id)}),
                    );
                }
                let rec = &self.runs[run_id];
                let qs: Vec<Question> = rec.questions.iter().map(|a| a.q.clone()).collect();
                // A late answer moves a run that escalated with no answer back too (REQ-019).
                let late = rec.run.state == RunState::Blocked
                    && rec
                        .escalation
                        .as_ref()
                        .is_some_and(|e| e.cause == Cause::NoAnswer);
                if all_answered(&qs) && rec.run.state == RunState::WaitingForAnswer {
                    self.transition(run_id, RunEvent::Answered);
                    self.pump_run(run_id);
                } else if all_answered(&qs) && late && self.unblock_with(run_id, None).is_ok() {
                    self.pump_run(run_id);
                }
            }
            _ => {}
        }
    }

    /// The answered questions of the run, for a brief (REQ-017).
    pub(crate) fn answers_text(&self, run_id: &str) -> String {
        let answered: Vec<String> = self.runs[run_id]
            .questions
            .iter()
            .filter(|a| a.q.state == QuestionState::Answered)
            .map(|a| {
                // A free-text answer is a person's text from a ticket comment: data.
                let text = match a.q.answer.as_ref().map(|x| &x.choice) {
                    Some(Choice::Text { .. }) => fence("ticket reply", &answer_text(&a.q)),
                    _ => answer_text(&a.q),
                };
                format!("- {} {}: {text}\n", a.q.id, a.q.question)
            })
            .collect();
        match answered.is_empty() {
            true => String::new(),
            false => format!("\nAnswers:\n{}", answered.concat()),
        }
    }

    /// The wait of an open question (REQ-019, `q:Q-028`): one reminder after `remind_after_h`,
    /// with one ticket comment under the comment switch and no approval. After
    /// `escalate_after_h` the run escalates with the cause no answer, and the question stays open.
    pub(crate) fn remind(&mut self, run_id: &str, now: u64) {
        let Some(wait) = self.project_of(run_id).map(|p| p.automation.questions) else {
            return;
        };
        let remind = u64::from(wait.remind_after_h) * 3600;
        let escalate = u64::from(wait.escalate_after_h) * 3600;
        let (mut due, mut late) = (Vec::new(), None);
        for a in &mut self.rec(run_id).questions {
            if a.q.state != QuestionState::Open {
                continue;
            }
            let age = now.saturating_sub(a.at);
            // A question that is already late gets the stop report, not a reminder too.
            if !a.reminded && age >= remind && age < escalate {
                a.reminded = true;
                due.push(a.q.clone());
            }
            if age >= escalate && late.is_none() {
                late = Some(format!("{}: {}", a.q.id, a.q.question));
            }
        }
        for q in due {
            self.log(
                run_id,
                None,
                ALERT,
                json!({"remind": format!("q:{}", q.id)}),
            );
            let write = Write::Comment {
                key: self.runs[run_id].key.clone(),
                body: question_comment(&q, "Reminder: "),
            };
            let ticketless = self.runs[run_id]
                .key
                .starts_with(crate::run_engine::TICKETLESS_PREFIX);
            let can = !ticketless
                && self
                    .project_of(run_id)
                    .is_some_and(|p| p.writer.can_comment());
            if can && self.may_send(run_id, &write) {
                self.send(run_id, &write, None);
            }
        }
        if let Some(line) = late
            && self.runs[run_id].run.state == RunState::WaitingForAnswer
        {
            self.escalate(run_id, Cause::NoAnswer, &[line]);
        }
    }

    /// The ticket became terminal: each open ticket question is withdrawn, with no comment. A
    /// spec question stays open (REQ-018).
    pub(crate) fn withdraw_ticket_questions(&mut self, run_id: &str) {
        let mut gone = Vec::new();
        for a in &mut self.rec(run_id).questions {
            if a.q.spec.is_none() && a.q.withdraw() {
                gone.push(a.q.id.clone());
            }
        }
        for id in gone {
            self.log(
                run_id,
                None,
                QUESTION,
                json!({"ref": format!("q:{id}"), "outcome": "withdrawn"}),
            );
        }
    }
}
