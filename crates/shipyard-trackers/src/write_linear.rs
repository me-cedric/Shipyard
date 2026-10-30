//! Linear writes, GraphQL. Linear holds no time record (flag `time_tracking` off): a worklog is
//! `Unsupported`, and an estimate in days has no field (Linear counts points), so it is skipped.
//!
//! An id that a mutation needs is an issue id (a UUID), not the `ENG-42` key: each call looks the
//! issue up first.

use crate::Tracker;
use crate::linear::Linear;
use crate::marker;
use crate::model::*;
use crate::work::*;
use serde_json::{Value, json};
use shipyard_core::work::Field;
use shipyard_http::{items, text};

impl Linear {
    /// Run a mutation. `field` is the mutation name: its `success` must be true.
    fn mutate(&self, query: &str, variables: Value, field: &str) -> Result<Value, TrackerError> {
        let v = self.gql(query, variables)?;
        match v["data"][field]["success"].as_bool() {
            Some(true) => Ok(v),
            _ => Err(TrackerError::Refused(format!(
                "Linear did not apply {field}"
            ))),
        }
    }

    fn issue_id(&self, key: &str) -> Result<String, TrackerError> {
        let v = self.gql(
            "query($id: String!) { issue(id: $id) { id } }",
            json!({ "id": key }),
        )?;
        match text(&v, "/data/issue/id") {
            id if id.is_empty() => Err(TrackerError::NotFound(key.into())),
            id => Ok(id),
        }
    }

    /// The id of the label `name` that the team can use: the team's own or a workspace label.
    /// A missing label is created, as Jira and GitHub do on the first use.
    fn label_id(&self, team: &str, name: &str) -> Result<String, TrackerError> {
        let v = self.gql(
            "query($name: String!) { issueLabels(first: 10, filter: { name: { eqIgnoreCase: $name } }) { nodes { id team { id } } } }",
            json!({ "name": name }),
        )?;
        let found = items(&v, "/data/issueLabels/nodes").iter().find(|l| {
            let owner = text(l, "/team/id");
            owner.is_empty() || owner == team
        });
        if let Some(l) = found {
            return Ok(text(l, "/id"));
        }
        let made = self.mutate(
            "mutation($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { success issueLabel { id } } }",
            json!({ "input": { "name": name, "teamId": team } }),
            "issueLabelCreate",
        )?;
        Ok(text(&made, "/data/issueLabelCreate/issueLabel/id"))
    }

    fn update_issue(&self, id: &str, input: Value) -> Result<(), TrackerError> {
        self.mutate(
            "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }",
            json!({ "id": id, "input": input }),
            "issueUpdate",
        )?;
        Ok(())
    }
}

/// An estimate in days has no field in Linear.
fn skipped(f: &Fields) -> Vec<Field> {
    f.days.iter().map(|_| Field::Estimate).collect()
}

impl TrackerWrite for Linear {
    fn assign(&self, key: &str, account: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Assignee)?;
        self.update_issue(&self.issue_id(key)?, json!({ "assigneeId": account }))
    }

    fn add_label(&self, key: &str, label: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Labels)?;
        let v = self.gql(
            "query($id: String!) { issue(id: $id) { id team { id } labels { nodes { name } } } }",
            json!({ "id": key }),
        )?;
        let issue = &v["data"]["issue"];
        if !issue.is_object() {
            return Err(TrackerError::NotFound(key.into()));
        }
        if items(issue, "/labels/nodes")
            .iter()
            .any(|l| text(l, "/name").eq_ignore_ascii_case(label))
        {
            return Ok(());
        }
        let label = self.label_id(&text(issue, "/team/id"), label)?;
        self.mutate(
            "mutation($id: String!, $labelId: String!) { issueAddLabel(id: $id, labelId: $labelId) { success } }",
            json!({ "id": text(issue, "/id"), "labelId": label }),
            "issueAddLabel",
        )?;
        Ok(())
    }

    fn remove_label(&self, key: &str, label: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Labels)?;
        let v = self.gql(
            "query($id: String!) { issue(id: $id) { id labels { nodes { id name } } } }",
            json!({ "id": key }),
        )?;
        let issue = &v["data"]["issue"];
        if !issue.is_object() {
            return Err(TrackerError::NotFound(key.into()));
        }
        let Some(l) = items(issue, "/labels/nodes")
            .iter()
            .find(|l| text(l, "/name").eq_ignore_ascii_case(label))
        else {
            return Ok(());
        };
        self.mutate(
            "mutation($id: String!, $labelId: String!) { issueRemoveLabel(id: $id, labelId: $labelId) { success } }",
            json!({ "id": text(issue, "/id"), "labelId": text(l, "/id") }),
            "issueRemoveLabel",
        )?;
        Ok(())
    }

    fn set_priority(&self, key: &str, priority: &str) -> Result<(), TrackerError> {
        // Linear priority: 1 urgent, 2 high, 3 medium, 4 low. Lowest shares the last place.
        let n = super::work::rank(priority)?.min(4);
        self.update_issue(&self.issue_id(key)?, json!({ "priority": n }))
    }

    fn set_due_date(&self, key: &str, day: Option<&str>) -> Result<(), TrackerError> {
        self.update_issue(&self.issue_id(key)?, json!({ "dueDate": day }))
    }

    fn transition(&self, key: &str, to: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Transitions)?;
        let v = self.gql(
            "query($id: String!) { issue(id: $id) { id team { states { nodes { id name } } } } }",
            json!({ "id": key }),
        )?;
        let issue = &v["data"]["issue"];
        if !issue.is_object() {
            return Err(TrackerError::NotFound(key.into()));
        }
        let states = items(issue, "/team/states/nodes");
        let Some(state) = states
            .iter()
            .find(|s| text(s, "/name").eq_ignore_ascii_case(to))
        else {
            let names: Vec<String> = states.iter().map(|s| text(s, "/name")).collect();
            return Err(TrackerError::Refused(format!(
                "{key} cannot move to {to}. The team has: {}",
                names.join(", ")
            )));
        };
        self.update_issue(
            &text(issue, "/id"),
            json!({ "stateId": text(state, "/id") }),
        )
        .map_err(refused)
    }

    fn add_worklog(&self, _: &Click, _: &str, _: &NewWorklog) -> Result<Worklog, TrackerError> {
        Err(Capability::TimeTracking.into())
    }

    fn worklogs(&self, _: &str) -> Result<Vec<Worklog>, TrackerError> {
        Err(Capability::TimeTracking.into())
    }

    fn create(
        &self,
        scope: &str,
        _epic: bool,
        f: &Fields,
        label: &str,
    ) -> Result<Written, TrackerError> {
        let teams = self.gql(
            "query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id } } }",
            json!({ "key": scope }),
        )?;
        let team = text(&teams, "/data/teams/nodes/0/id");
        if team.is_empty() {
            return Err(TrackerError::NotFound(format!("team {scope}")));
        }
        let mut input = json!({
            "teamId": team,
            "title": f.title.clone().unwrap_or_default(),
            "description": f.description.clone().unwrap_or_default(),
            "labelIds": [self.label_id(&team, label)?],
        });
        if let Some(p) = &f.parent {
            input["parentId"] = json!(self.issue_id(p)?);
        }
        let made = self.mutate(
            "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier } } }",
            json!({ "input": input }),
            "issueCreate",
        )?;
        Ok(Written {
            key: text(&made, "/data/issueCreate/issue/identifier"),
            skipped: skipped(f),
        })
    }

    fn update(&self, key: &str, f: &Fields) -> Result<Written, TrackerError> {
        let mut input = json!({});
        if let Some(t) = &f.title {
            input["title"] = json!(t);
        }
        if let Some(d) = &f.description {
            input["description"] = json!(d);
        }
        if let Some(p) = &f.parent {
            input["parentId"] = json!(self.issue_id(p)?);
        }
        if input.as_object().is_some_and(|o| !o.is_empty()) {
            self.update_issue(&self.issue_id(key)?, input)?;
        }
        Ok(Written {
            key: key.into(),
            skipped: skipped(f),
        })
    }

    fn comments_page(
        &self,
        key: &str,
        cursor: Option<&str>,
    ) -> Result<Page<Comment>, TrackerError> {
        self.comment_page(key, cursor)
    }

    fn add_comment(&self, key: &str, body: &str) -> Result<String, TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        let made = self.mutate(
            "mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id } } }",
            json!({ "input": { "issueId": self.issue_id(key)?, "body": marker::to_wire(body, true) } }),
            "commentCreate",
        )?;
        Ok(text(&made, "/data/commentCreate/comment/id"))
    }

    fn edit_comment(&self, _key: &str, id: &str, body: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        self.mutate(
            "mutation($id: String!, $input: CommentUpdateInput!) { commentUpdate(id: $id, input: $input) { success } }",
            json!({ "id": id, "input": { "body": marker::to_wire(body, true) } }),
            "commentUpdate",
        )
        .map(|_| ())
        .map_err(own)
    }

    fn delete_comment(&self, _key: &str, id: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        self.mutate(
            "mutation($id: String!) { commentDelete(id: $id) { success } }",
            json!({ "id": id }),
            "commentDelete",
        )
        .map(|_| ())
        .map_err(own)
    }
}
