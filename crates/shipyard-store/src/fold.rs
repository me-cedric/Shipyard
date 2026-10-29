//! Fold an answer into a spec text (spec `specs`, REQ-015). Pure text; the caller writes the file
//! with `safe_write`.

const OPEN: &str = "[NEEDS CLARIFICATION:";

fn count_h2(t: &str) -> usize {
    t.lines().filter(|l| l.starts_with("## ")).count()
}

/// Index after the last line that is not blank, in `from..to`.
fn after_last(lines: &[&str], from: usize, to: usize) -> usize {
    (from..to)
        .rev()
        .find(|&i| !lines[i].trim().is_empty())
        .map_or(from + 1, |i| i + 1)
}

/// Replaces each marker that cites `question_id` with the answer. Adds the line
/// `- Q-NNN <question>: <answer>` under `### Clarifications` in `## Purpose`. Adds no `## ` line.
pub fn fold(spec: &str, question_id: &str, question: &str, answer: &str) -> Result<String, String> {
    if question.contains('\n') || answer.contains('\n') {
        return Err("the question and the answer must be one line".into());
    }
    let mut replaced = String::new();
    let (mut rest, mut hits) = (spec, 0);
    while let Some(i) = rest.find(OPEN) {
        let after = &rest[i + OPEN.len()..];
        let Some(end) = after.find(']') else { break };
        let cites = after[..end]
            .trim()
            .strip_prefix(question_id)
            .is_some_and(|r| !r.starts_with(|c: char| c.is_ascii_digit()));
        replaced.push_str(&rest[..i]);
        if cites {
            replaced.push_str(answer);
            hits += 1;
        } else {
            replaced.push_str(&rest[i..i + OPEN.len() + end + 1]);
        }
        rest = &after[end + 1..];
    }
    replaced.push_str(rest);
    if hits == 0 {
        return Err(format!("no marker cites {question_id}"));
    }

    let mut lines: Vec<&str> = replaced.lines().collect();
    let purpose = lines
        .iter()
        .position(|l| l.trim_end() == "## Purpose")
        .ok_or("the spec has no `## Purpose` section")?;
    let end = (purpose + 1..lines.len())
        .find(|&i| lines[i].starts_with("## "))
        .unwrap_or(lines.len());
    let bullet = format!("- {question_id} {question}: {answer}");
    match (purpose + 1..end).find(|&i| lines[i].trim_end() == "### Clarifications") {
        Some(c) => {
            let block_end = (c + 1..end)
                .find(|&i| lines[i].starts_with('#'))
                .unwrap_or(end);
            lines.insert(after_last(&lines, c, block_end), &bullet);
        }
        None => {
            let at = after_last(&lines, purpose, end);
            lines.splice(at..at, ["", "### Clarifications", "", &bullet]);
        }
    }
    let mut out = lines.join("\n");
    if replaced.ends_with('\n') {
        out.push('\n');
    }
    if count_h2(&out) != count_h2(spec) {
        return Err("the fold would change the sections".into());
    }
    Ok(out)
}
