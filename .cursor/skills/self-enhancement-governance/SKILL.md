---
name: self-enhancement-governance
description: Maintains Cursor guidance artifacts when the user introduces new design decisions, conventions, workflows, or preferred ways of doing things. Use when instructions define or change project standards, architecture rules, coding conventions, process requirements, or reusable patterns.
---

# Self-Enhancement Governance

## Purpose

Convert new user decisions into durable guidance by updating:
- project rules in `.cursor/rules/` for always-on or file-scoped constraints
- project skills in `.cursor/skills/` for reusable workflows and domain playbooks

## Trigger Conditions

Apply this workflow whenever the user instruction introduces or changes:
- architecture or layering decisions
- coding conventions or design standards
- required process/workflow steps
- preferred implementation patterns
- review/checklist expectations

## Decision Flow

1. Identify the new decision and restate it as a short, testable rule.
2. Choose destination:
   - Update/create `.cursor/rules/*.mdc` when guidance should persist broadly or always apply.
   - Update/create `.cursor/skills/*/SKILL.md` when guidance is a reusable task workflow.
   - Update both when one decision has both policy and workflow implications.
3. Prefer extending existing artifacts over creating duplicates.
4. Keep wording concise, actionable, and consistent with existing terminology.

## Update Standards

- Rules:
  - Keep focused on one concern.
  - Use `alwaysApply: true` only for universal expectations.
  - Use `globs` for file-scoped behavior.
- Skills:
  - Keep `name` lowercase and hyphenated.
  - Description must state both what the skill does and when to apply it.
  - Keep `SKILL.md` concise; link to extra docs only when needed.

## Completion Checklist

- Decision captured in persistent artifact(s).
- No conflicting guidance introduced.
- Existing related rule/skill updated when appropriate.
- User informed which files were updated and why.
