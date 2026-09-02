---
"changesets-changelog-gitea": minor
---

Resolve pull request links for changes merged with a merge commit. Gitea only
links *merge commits* to their pull request, while Changesets reports the
commit that first added the changeset (the feature-branch commit for a
PR-merged change), so such changelog lines used to lack a PR link. The
generator now scans the repository's merged pull requests for the one whose
commit list contains the changeset commit, and links that pull request.
