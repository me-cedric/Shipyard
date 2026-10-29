<div align="center">
<img src="docs/assets/logo.svg" alt="Shipyard" width="88">

# Shipyard
</div>

Design, specify, plan and ship a project with a team of people and agents. Everything lives in the Git repository.

- Plan: [`docs/plan/MASTER-PLAN.md`](docs/plan/MASTER-PLAN.md)
- Rules: [`docs/openspec/constitution.md`](docs/openspec/constitution.md), [`AGENTS.md`](AGENTS.md)
- Decisions: [`docs/decisions/`](docs/decisions/)
- Open questions: [`docs/delivery/questions/`](docs/delivery/questions/)

## Setup

```bash
git clone --recurse-submodules https://github.com/me-cedric/Shipyard.git
cd Shipyard
node docs/agent-compass/bin/ac.mjs doctor
```
