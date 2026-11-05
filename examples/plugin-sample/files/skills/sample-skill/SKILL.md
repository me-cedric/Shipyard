---
name: sample-skill
description: Greet the {{config.team}} team and state the sample rules. Use when a person asks what the sample plugin does.
---

# Sample skill

This skill came from the `acme-sample` plugin.

1. Say which team this project serves: {{config.team}}.
2. Retry a failed step at most {{config.retries}} times.
3. Strict mode: {{config.strict}}.
