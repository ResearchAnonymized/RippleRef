# Push RippleREF to GitHub

This folder is ready to become its **own** git repository (separate from `RefactAI`).

## One-time publish

```bash
cd /path/to/RippleREF

# optional: review
find . -iname '*.xlsx'   # must be empty
find . -name '.env'      # must be empty

git init
git add .
git status   # confirm no secrets
git commit -m "Initial RippleREF package: Web UI, API, agents, scripts, and wiki"

git branch -M main

# Option A — GitHub CLI
# Repo already exists:
# https://github.com/ResearchAnonymized/RippleRef
git remote add origin https://github.com/ResearchAnonymized/RippleRef.git
git push -u origin main
```

## Later updates

After editing files in this folder:

```bash
cd /path/to/RippleREF
git add .
git commit -m "Describe change"
git push
```

Do **not** nest-push this tree into another monorepo unless you intentionally want a submodule.
