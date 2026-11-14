# Release Reminder — utils monorepo

> Quick checklist to cut a new version of **one package** (e.g. `@yohs/rxjs-utils`) and update docs.

---

## 0) Prereqs (first time only)

* Logged in to npm: `npm login`
* `NPM_TOKEN` set in CI if using GitHub Actions
* Git clean: `git status` (no stray changes)

---

## 1) Commit changes

```bash
git add -A
git commit -m "feat(<pkg>): <short summary>"
```

---

## 2) Lint & test (one package only)

```bash
pnpm --filter <pkg-name> lint
pnpm --filter <pkg-name> test
```

---

## 3) Build (one package only)

```bash
pnpm --filter <pkg-name> build
```

> Optional sanity check:

```bash
pnpm --filter <pkg-name> pack   # inspect generated .tgz contents
```

---

## 4) Create a changeset (from monrepo root)

```bash
pnpm changeset
# select <pkg-name>, choose patch/minor/major, add 1–2 line note
git add .changeset
git commit --amend --no-edit   # or a separate commit
git push
```

The changelog plugin (`@changesets/changelog-github`) looks up the commit that added each changeset on GitHub, so that commit must be pushed before step 5.

---

## 5) Apply version & changelog (from monrepo root)

```bash
export GITHUB_TOKEN="$(gh auth token)"   # required by @changesets/changelog-github
pnpm changeset version
git add -A
git commit -m "chore(release): <pkg-name> vX.Y.Z"
```

---

## 6) Publish to npm (from monrepo root)

```bash
npm login
pnpm changeset publish
git push --follow-tags
```

---

## 7) Update docs (TypeDoc → /docs/<pkg>)

```bash
pnpm docs
git add docs
git commit -m "docs(<pkg>): update API"
git push
```

---

## 8) Upgrade in consuming repos

```bash
pnpm up <pkg-name>@latest
```

---

## Variants

**Repo-wide checks instead of per-package**

```bash
pnpm -w lint
pnpm -w test
pnpm -r build
```

**One-liner release (after running `pnpm changeset`)**

```bash
pnpm release
# where "release" = "changeset version && pnpm -r build && changeset publish"
```

---

## Common gotchas

* **“Failed to resolve entry…”**
  Ensure `package.json` `exports/main/module/types` match files in `dist/`.

* **Publish blocked (scoped pkg)**
  Use public access: `"publishConfig": { "access": "public" }`.

* **Vitest/ESLint not found**
  Run from repo root or add `-w/--filter` appropriately.

* **Nothing publishes**
  You must run `pnpm changeset` to create a changeset before `changeset version/publish`.

* **`changeset version` fails in `@changesets/get-github-info`**
  Either `GITHUB_TOKEN` is unset, or the commit that added the changeset is not on GitHub yet. Export the token from `gh auth token`, push, and rerun. Don't hand-write the version bump and changelog instead.

* **`npm whoami` returns 401**
  The npm token has expired. Run `npm login`, which writes a fresh token to `~/.npmrc`. Don't keep a token in a repository-level `.npmrc`.

Replace `<pkg-name>` with e.g. `@yohs/rxjs-utils`.
