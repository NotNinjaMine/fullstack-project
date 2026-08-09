# Git branching and commit strategy

## Workflow

`main` is the submission-ready branch. Work is developed on a short-lived
feature or documentation branch, reviewed and tested, then merged into `main`
with a pull request. A branch should contain one coherent change and should be
deleted after the merge.

Recommended branch names:

- `feature/member-1-identity`
- `feature/member-2-employee-leave`
- `feature/member-3-approvals`
- `feature/member-4-calendar-coverage`
- `feature/member-5-hr-analytics`
- `fix/<short-problem-name>`
- `docs/<short-document-name>`

## Commit rules

Commits should describe the result, not the activity. Examples:

```text
feat: add employee early-return request flow
fix: isolate employee balances by active leave year
test: cover bulk approval wrong-tier response
docs: add member 2 AI feature workflow log
```

Before opening a pull request, the contributor runs the relevant tests, the
client build, and the syntax/undefined-identifier checks. The pull request
description should state what changed, what was tested, and any known limits.

## Merge rules

1. Update the feature branch from `main`.
2. Resolve conflicts on the feature branch, never directly in a deployed build.
3. Run the complete verification suite.
4. Merge only when the checks pass and the contribution is reviewable.
5. Keep the merge commit and pull-request record; do not rewrite shared history.

## What this repository can honestly show

The repository was initialised after much of the team work had already been
completed, so the earlier commits are linear and should not be backdated or
rewritten. The current history preserves those real commits. The later
Member 2 AI-evidence and branching-document changes demonstrate the intended
feature-branch → review → merge workflow with descriptive commits. Future team
work should use the same process from the beginning.

## Useful commands

```powershell
git switch main
git pull --ff-only origin main
git switch -c feature/member-2-employee-leave

# make and test changes
git add <files>
git commit -m "feat: describe the completed change"
git push -u origin feature/member-2-employee-leave

# open a pull request on GitHub, merge it after review, then clean up
git switch main
git pull --ff-only origin main
git branch -d feature/member-2-employee-leave
```
