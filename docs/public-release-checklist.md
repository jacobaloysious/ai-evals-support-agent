# Public-release checklist

This checklist is for preparing the source repository and deciding whether to expose the deployed demo. They are separate release decisions.

## Source repository

- [x] Review tracked files for real customer data and credentials.
- [x] Scan reachable Git history for committed environment files, key files, and common token/private-key patterns.
- [x] Make the README and docs index lead a new reader from setup through the lessons.
- [ ] Select a license if readers should have explicit permission to reuse, modify, and redistribute the code.
- [ ] Push the final reviewed commits before changing repository visibility.
- [ ] Verify repository visibility and the rendered README on GitHub.

The local scan found no matching credential patterns and no environment or key files in reachable history. Pattern scans do not prove that a repository contains no secrets; review all history and GitHub's secret scanning before changing visibility.

No license file is present yet. GitHub's [licensing guide](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository) explains that a public repository without a license remains subject to default copyright rules, apart from GitHub's built-in view/fork behavior.

## Deployed demo

- [ ] Decide who should be able to use the deployed chat.
- [ ] Add request throttling and usage controls before broadly sharing it; the current API endpoint has no rate limit and uses the deployment's OpenAI key.
- [ ] Confirm Vercel environment variables are configured without copying them into Git.
- [ ] Test the live address-change, ownership-denial, and refund-review flows after a deployment.

The app uses fictional accounts and is not production authentication. Repo visibility alone does not make the app safe for real customer data.
