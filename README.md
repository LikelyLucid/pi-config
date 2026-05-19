# Pi Config

Personal [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) configuration for this NixOS setup.

## Files

| File            | Purpose                                               |
| --------------- | ----------------------------------------------------- |
| `AGENTS.md`     | Core agent identity, principles, and behavioral rules |
| `settings.json` | Pi editor settings — provider, model, theme           |

## Setup

Pi auto-discovers configuration from `~/.pi/agent/` (global) or `.pi/` (project-local). No symlinks needed.

```bash
# To use as global agent config
mkdir -p ~/.pi
cp -r pi-config ~/.pi/agent
```

## Settings

- **Provider**: Anthropic
- **Default Model**: Claude Sonnet 4.6
- **Theme**: Dark
- **Thinking Level**: Medium

## Principles

The `AGENTS.md` defines how Pi behaves:

- Proactive mindset — explore before asking
- Professional objectivity — honest, direct feedback
- Keep it simple — no over-engineering
- Read before editing
- Try before asking
- Verify before claiming done
