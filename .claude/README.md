# Job Radar — Claude Configuration

This directory contains Claude agents, commands, and skills for the Job Radar project.
It is used by both Cowork (reads `skills/`) and Claude Code CLI (reads everything).

---

## Agents (`agents/`)

Specialized subagents that can be launched for specific tasks:

| Agent | Purpose |
|---|---|
| `auth-route-debugger` | Debug NextAuth + FastAPI auth issues |
| `auth-route-tester` | Test authenticated API routes |
| `auto-error-resolver` | Autonomously investigate and fix errors |
| `code-architecture-reviewer` | Review code structure and patterns |
| `code-refactor-master` | Refactor code to improve quality |
| `documentation-architect` | Create and maintain documentation |
| `frontend-error-fixer` | Fix frontend/UI bugs |
| `plan-reviewer` | Review implementation plans |
| `refactor-planner` | Plan refactoring strategies |
| `web-research-specialist` | Research external docs, libraries, APIs |

---

## Commands (`commands/`)

Slash commands available in Claude Code CLI:

| Command | Purpose |
|---|---|
| `dev-docs` | Generate developer documentation |
| `dev-docs-update` | Update existing documentation |
| `route-research-for-testing` | Research route structure for test writing |

---

## Skills (`skills/`)

Domain knowledge packs that activate contextually:

| Skill | Purpose | Status |
|---|---|---|
| `backend-dev-guidelines` | FastAPI/Python backend patterns | ✅ Job Radar adapted |
| `frontend-dev-guidelines` | Next.js 14 + Tailwind frontend patterns | ✅ Job Radar adapted |
| `error-tracking` | Error handling and monitoring patterns | ✅ Ready |
| `route-tester` | API route testing patterns | ✅ Ready |
| `skill-developer` | Meta-skill for creating new skills | ✅ Ready |
| `skill-rules.json` | Skill activation triggers | ✅ Job Radar adapted |

> Note: `backend-dev-guidelines/resources/` and `frontend-dev-guidelines/resources/` contain
> template content from an Express/MUI project. The `SKILL.md` files in each folder are the
> canonical Job Radar-specific guides. The resource files are kept for structural reference.

---

## What's NOT included

- **Hooks** — Skipped. Claude Code CLI hooks require `tsx` runtime and were written for
  a different project structure. They do nothing in Cowork.
- **settings.json** — Skipped. The original referenced a MySQL MCP that conflicts with
  Job Radar's existing Cowork configuration.
