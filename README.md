# EdgeComet for Claude

SEO and AI search workflows that run on your own EdgeComet data inside Claude. The plugin pairs ten skills with the EdgeComet connector: Claude reads what every search and AI bot received from your site, your crawl audit, Search Console, page changes and alerts, and drafts Edge SEO fixes for a person to review and deploy.

EdgeComet serves search engines and AI bots from its cache or a JavaScript render, records every bot request with the page the bot received, and turns that record and Search Console into reports, a site audit, alerts and Edge SEO fixes.

## Skills

| Skill | Use it for |
|---|---|
| `get-started` | Add your website from Claude and connect the EdgeComet integration |
| `site-audit` | A technical SEO audit from the crawl, ranked by the Search Console clicks at stake |
| `ai-visibility` | Which pages AI crawlers and AI assistants fetch, the errors they get, the pages they skip |
| `rendering-check` | What Googlebot and AI bots received: renders, cache, JavaScript errors, raw against rendered HTML |
| `traffic-drop` | Why Google clicks fell, matched against releases, page changes and alerts |
| `release-check` | Whether a deploy or migration broke SEO, and redirect drafts for dead URLs |
| `fix-drafts` | Edge SEO drafts for titles, meta tags, canonicals, robots, headings, markup and redirects |
| `keyword-opportunities` | Striking-distance queries and cannibalization from Search Console, plus optional paid keyword data |
| `structured-data` | JSON-LD validation from the crawl and JSON-LD drafts for missing markup |
| `site-report` | A plain-language status report for a client or manager |

## Prerequisites

- An EdgeComet account. Signing up starts a trial; you can sign up inside the Connect window.
- The EdgeComet integration live on your site for most data. The crawl is ready 3 days after the first verified bot visit. Search Console is connected in the EdgeComet dashboard.
- In claude.ai, skills need "Code execution and file creation" turned on in your settings.

## Install and connect

- **Claude directory:** find EdgeComet, install the plugin, then click Connect on the EdgeComet connector and sign in. Installing the plugin does not connect the connector by itself.
- **Claude Code:**

  ```
  /plugin marketplace add EdgeComet/edgecomet-skills
  /plugin install edgecomet@edgecomet
  ```

  Then run `/mcp` and authenticate the `edgecomet` server.

Claude Code also loads the connectors you added in claude.ai. If you already connected EdgeComet there, `/mcp` can list it twice: once from the plugin and once from claude.ai. Keep one of them enabled.

## What the plugin sends where

- Every tool call goes to the EdgeComet server at `https://cloud.edgecomet.com/mcp` over your own OAuth connection, and reads or writes only the websites your account can access.
- Keyword, SERP and backlink tools are priced: EdgeComet proxies them to DataForSEO. Claude tells you the price and waits for your yes before each one.
- Nothing goes live from Claude. Edge SEO drafts, tasks and redirect maps wait in the dashboard until a person deploys them.
- The skills themselves are instructions for Claude. They send nothing on their own.

## Roles

The read-only role runs the reports, queries, page maps and previews. Edge SEO drafts, redirect maps, `read_page` and the paid tools need the manager role on the website. The shared sample site that every account sees is read-only, and it does not run live renders.

## Development

- `node scripts/stamp-ground-rules.mjs` writes `shared/ground-rules.md` into every skill.
- `node scripts/check.mjs` runs the repository checks: frontmatter keys, tool names against `tools.json`, the ground rules, writing rules and `references.json`.
- `node scripts/check.mjs --references` prints the report keys and issue ids the skills cite.
- `claude plugin validate --profile directory --strict .` validates the plugin.

## Support

Write to support@edgecomet.com. Documentation: https://edgecomet.com/docs/mcp/claude-connector.html. Privacy: https://edgecomet.com/privacy-policy/

## License

MIT. See [LICENSE](LICENSE).
