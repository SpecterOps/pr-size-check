# PR size check

A dependency-free GitHub Action that fails a pull request when its diff exceeds a line threshold. It counts additions and deletions from GitHub's pull-request-files API, so it does not need to check out or execute pull-request code.

```yaml
name: PR size

on:
  pull_request:
    types: [opened, reopened, synchronize, labeled, unlabeled]

permissions:
  pull-requests: read

jobs:
  pr-size:
    runs-on: ubuntu-latest
    steps:
      - uses: your-org/pr-size-check@<full-commit-sha>
        with:
          github-token: ${{ github.token }}
          max-lines: 800
          ignored-paths: |
            docs/**
            **/*.lock
            **/generated/**
          bypass-label: size-exempt
          count: additions-and-deletions
```

`bypass-label` is deliberately exact (case-insensitive). Include `labeled` and `unlabeled` in the workflow triggers so a required check is recalculated when the exemption changes.

## Inputs

| Input | Required | Default | Meaning |
| --- | --- | --- | --- |
| `github-token` | Yes | — | Token with `pull-requests: read`. |
| `max-lines` | Yes | — | Non-negative failure threshold. |
| `ignored-paths` | No | empty | Newline-separated glob patterns. |
| `bypass-label` | No | empty | Label that passes the check. |
| `count` | No | `additions-and-deletions` | Or `additions-only`. |
| `fail-on-exceed` | No | `true` | Set `false` for reporting-only mode. |
| `message` | No | empty | Text appended to a threshold error. |

## Outputs

`counted-lines`, `skipped-files`, and `bypassed` are available as action outputs.

## Development

Runs on GitHub Actions' Node 24 runtime. Run tests locally with Node 24 or newer:

```sh
npm test
```
