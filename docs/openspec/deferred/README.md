# Deferred spec changes

A folder here is a spec change that the owner set aside. It is not work to do: Flow and the spec checks do not read this folder.

The test plan of a change is beside it as `<capability>.feature.txt`: the `.txt` keeps its requirement tags out of the ref check, because the requirements are not in `changes/`.

To take a change up again, move its folder back to `docs/openspec/changes/`, and move its test plan back to `docs/delivery/test-plans/` with the name `<capability>.feature`.

| Change | Set aside | Reason |
|---|---|---|
| `add-azure-sign-in` | 2026-11-27 | It needs a Microsoft Entra application registration (Q-132). Azure uses a pasted key until then. |
