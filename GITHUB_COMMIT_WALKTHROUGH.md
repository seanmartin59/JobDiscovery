# How to commit JobDiscovery to GitHub

Do this in order. Run commands in a terminal (e.g. Cursor’s terminal or Git Bash) from the project folder: `c:\Users\Sean\Coding\JobDiscovery`.

---

## Step 1: Initialize Git (if not already)

```bash
cd "c:\Users\Sean\Coding\JobDiscovery"
git init
```

You only need this if the folder is not already a Git repo (no `.git` folder).

---

## Step 2: Create a .gitignore (recommended)

So you don’t commit secrets or local junk. Create a file named `.gitignore` in the project root with something like:

```
# Secrets / env (if you add them later)
.env
.env.local
*.pem

# OS / editor
.DS_Store
Thumbs.db
*.log

# Node / deps (if you add a Node project later)
node_modules/
```

You can edit `.gitignore` in Cursor and add more lines as needed.

---

## Step 3: Stage and commit

```bash
git add .
git status
```

Review what’s staged. Then:

```bash
git commit -m "Fix Brave pagination and restore discovery pipeline (Lever, Ashby, Greenhouse)"
```

Use any message you like; that one describes the recent fixes.

---

## Step 4: Create a repo on GitHub

1. Go to [github.com](https://github.com) and sign in.
2. Click **+** (top right) → **New repository**.
3. **Repository name:** e.g. `JobDiscovery`.
4. **Description:** optional (e.g. “Job discovery pipeline for Strategy & Ops roles”).
5. Choose **Public** (or Private if you prefer).
6. **Do not** check “Add a README” or “Add .gitignore” if you already have files and a .gitignore.
7. Click **Create repository**.

---

## Step 5: Connect your local repo and push

GitHub will show commands; use these (replace `YOUR_USERNAME` and `JobDiscovery` if your repo name or username differ):

```bash
git remote add origin https://github.com/YOUR_USERNAME/JobDiscovery.git
git branch -M main
git push -u origin main
```

If you use SSH instead of HTTPS:

```bash
git remote add origin git@github.com:YOUR_USERNAME/JobDiscovery.git
git branch -M main
git push -u origin main
```

- **First time:** You may be prompted to sign in (browser or token for HTTPS) or to add your SSH key for SSH.
- **If the repo already had a README etc.:** Use `git pull origin main --rebase` (or `git pull origin main`) before `git push`.

---

## Step 6: Verify

On GitHub, open your repo. You should see `JobDiscovery.ts`, `context.md`, and any other files you committed.

---

## Later: more commits and pushes

After you change files:

```bash
git add .
git commit -m "Short description of what you did"
git push
```

If you want, we can add a proper `.gitignore` for this project in the repo next.
