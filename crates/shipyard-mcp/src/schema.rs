//! A small JSON Schema checker for the tool inputs (REQ-016). It knows only the keywords that the
//! eight tool schemas use, so the schema that the agent reads is the schema that we check.
//!
//! shortcut: no `$ref`, `oneOf` or `pattern`. Add the `jsonschema` crate if a tool needs them.

use serde_json::Value;

/// `Ok` when `value` fits `schema`. The error names the first field that does not fit.
pub fn check(schema: &Value, value: &Value) -> Result<(), String> {
    walk(schema, value, "")
}

fn walk(schema: &Value, value: &Value, path: &str) -> Result<(), String> {
    let fail = |why: String| {
        Err(if path.is_empty() {
            why
        } else {
            format!("{path}: {why}")
        })
    };
    if let Some(kind) = schema["type"].as_str() {
        let fits = match kind {
            "object" => value.is_object(),
            "string" => value.is_string(),
            "integer" => value.is_i64() || value.is_u64(),
            "boolean" => value.is_boolean(),
            "array" => value.is_array(),
            _ => false,
        };
        if !fits {
            return fail(format!("must be {kind}"));
        }
    }
    if let Some(allowed) = schema["enum"].as_array()
        && !allowed.contains(value)
    {
        let names: Vec<String> = allowed.iter().map(|a| a.to_string()).collect();
        return fail(format!("must be one of {}", names.join(", ")));
    }
    if let Some(text) = value.as_str() {
        let len = text.chars().count() as u64;
        if schema["minLength"].as_u64().is_some_and(|m| len < m) {
            return fail(format!("needs {} characters or more", schema["minLength"]));
        }
        if schema["maxLength"].as_u64().is_some_and(|m| len > m) {
            return fail(format!("needs {} characters or fewer", schema["maxLength"]));
        }
    }
    if let Some(n) = value.as_i64() {
        if schema["minimum"].as_i64().is_some_and(|m| n < m) {
            return fail(format!("must be {} or more", schema["minimum"]));
        }
        if schema["maximum"].as_i64().is_some_and(|m| n > m) {
            return fail(format!("must be {} or less", schema["maximum"]));
        }
    }
    if let Some(items) = value.as_array() {
        let len = items.len() as u64;
        if schema["minItems"].as_u64().is_some_and(|m| len < m) {
            return fail(format!("needs {} items or more", schema["minItems"]));
        }
        if schema["maxItems"].as_u64().is_some_and(|m| len > m) {
            return fail(format!("needs {} items or fewer", schema["maxItems"]));
        }
        for (i, item) in items.iter().enumerate() {
            walk(&schema["items"], item, &format!("{path}[{i}]"))?;
        }
    }
    if let Some(object) = value.as_object() {
        for name in schema["required"].as_array().into_iter().flatten() {
            let name = name.as_str().unwrap_or_default();
            if !object.contains_key(name) {
                return fail(format!("{name} is required"));
            }
        }
        let props = schema["properties"].as_object();
        for (key, item) in object {
            let sub = format!("{path}{}{key}", if path.is_empty() { "" } else { "." });
            match props.and_then(|p| p.get(key)) {
                Some(s) => walk(s, item, &sub)?,
                None if schema["additionalProperties"] == false => {
                    return Err(format!("{sub}: is not an input of this tool"));
                }
                None => {}
            }
        }
    }
    Ok(())
}
