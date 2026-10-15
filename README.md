# skills

Claude Code plugins I use every day, published so anyone can install them.

| Plugin | What it does |
|---|---|
| [team](plugins/team) | Runs non-trivial tasks as a small team: Opus plans and reviews, up to 4 Sonnet workers execute in parallel, and the planner checks each worker's diff before trusting its report |

## Install

Add the marketplace once, then install the plugins you want:

```
/plugin marketplace add mjuncalacuna/skills
/plugin install team@skills
```

Then `/reload-plugins` or start a new session. To get updates later: `claude plugin update team@skills`.

## License

MIT. Made by [Manuel Juncal](https://www.linkedin.com/in/mjuncalacuna/).
