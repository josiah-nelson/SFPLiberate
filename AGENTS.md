Got it, that helps a lot: monorepo, intentional feature divergence, and community sync as a frontend-controlled setting. Delicious constraints.

Here’s an updated version with those ideas wired in, plus a short “LLM instruction snippet” you can drop straight into custom instructions.

⸻

Agent Guidelines for This Repo (Full Version)

0. Context
	•	This is a greenfield, pre-alpha project with no existing user base.
	•	It is a sidecar for a niche hardware device (UACC-SFP-WIZARD), with limited ability to do full end-to-end automated testing.
	•	Backwards compatibility is not a priority yet; clean rewrites are acceptable.
	•	The repo is a monorepo: multiple deployment targets share a common codebase to avoid fragmentation and duplication.

⸻

1. Workflow & Synchronization
	•	Branches
	•	Do all work in a new feature branch.
	•	Use a clear, consistent naming convention, e.g.:
	•	feature/<short-description>
	•	bugfix/<short-description>
	•	Syncing
	•	Frequently fetch and rebase onto main (unless the repo explicitly prefers merge commits).
	•	Documentation
	•	Update README.md when:
	•	Usage or setup changes.
	•	New env vars or config options are added.
	•	Follow CONTRIBUTING.md if present.

⸻

2. Core Principles
	•	Use existing capabilities first
	•	Prefer standard library and existing repo utilities over adding new dependencies.
	•	If a new dependency is needed:
	•	Check for an existing dependency with similar purpose.
	•	Justify it briefly in the PR description.
	•	Root cause over band-aids
	•	Fix issues at their true upstream cause, not just the symptom.
	•	Avoid one-off hacks and obscure special cases.
	•	Clarity and intent
	•	Write code that is easy to understand and aligns with existing patterns.
	•	Greenfield-friendly rewrites
	•	Since this is pre-alpha, simple rewrites are acceptable instead of complex migrations, as long as behavior and intent are clear.

⸻

3. Testing & Validation
	•	General
	•	Full automated coverage is not always feasible due to hardware realities.
	•	When robust tests are not possible, compensate with:
	•	Clear manual test steps.
	•	Logs and screenshots where helpful.
	•	Frontend / UI (Playwright)
	•	Use Playwright for frontend flows when applicable:
	•	Capture at least one representative screenshot for the main flow affected by the change.
	•	Attach or reference this in the PR.
	•	Other tests
	•	Add or update lightweight unit/integration tests when practical.
	•	Follow existing testing frameworks and patterns.
	•	Bugfixes
	•	When feasible, add a test (or Playwright scenario) that would fail before the fix and pass after.
	•	Otherwise, clearly describe before/after behavior and manual validation steps.

⸻

4. Refactoring & Boy Scout Rule
	•	Boy Scout rule
	•	Allocate roughly 5–10% of effort/tokens to local improvements in the code you’re already touching:
	•	Simplify messy logic.
	•	Improve naming or comments.
	•	Remove minor duplication.
	•	Scope
	•	Keep refactors local and related to the task.
	•	Avoid sprawling repo-wide refactors unless explicitly requested.
	•	Rewrites
	•	For small, overly complex sections, it’s acceptable to rewrite cleanly rather than layering more patches.

⸻

5. Code Style & Tooling
	•	Formatting & linting
	•	Use the repo’s existing formatter(s) and linter(s).
	•	Don’t introduce new style tools without strong justification.
	•	Patterns & structure
	•	Match existing:
	•	Folder structure.
	•	Naming conventions.
	•	Architectural patterns.
	•	Commits & PRs
	•	Keep commits logically scoped with clear messages.
	•	PR descriptions should state:
	•	Problem being solved.
	•	High-level approach.
	•	Tradeoffs (e.g., rewrite vs small patch).
	•	Validation (tests, Playwright screenshots, manual steps).

⸻

6. Adversarial Review & Cross-Checking
	•	Second-pass review
	•	After implementing the solution, do a deliberate second pass:
	•	What can break under weird inputs, timing, or hardware states?
	•	What assumptions am I making about environment or connectivity?
	•	Add guards or clarifications where cheap and clear.
	•	Cross-checking
	•	Cross-reference with:
	•	Language/framework docs (for the version actually used).
	•	Any existing templates or repo standards.

⸻

7. Security & Scale Assumptions
	•	Security
	•	Surface area and user base are currently small.
	•	Don’t over-engineer security, but still:
	•	Avoid logging secrets/credentials.
	•	Treat identifiers and env vars with basic care.
	•	Performance
	•	Assume modest scale, not internet-scale.
	•	Prioritize simplicity over premature optimization.
	•	Avoid obviously bad patterns when simple alternatives exist.

⸻

8. Breaking Changes & Evolution
	•	Pre-alpha flexibility
	•	Breaking changes are acceptable.
	•	Prefer:
	•	Clean APIs.
	•	Straightforward rewrites.
	•	Over:
	•	Shims and complex migration layers.
	•	Communicating changes
	•	Call out breaking changes clearly in PRs.
	•	Update README.md and relevant docs as needed.

⸻

9. Deployment Targets & Cross-Contamination

This monorepo supports four deployment targets. They share a common base but are allowed to diverge in features.

9.1 Monorepo Structure
	•	Use a monorepo layout that encourages shared code, e.g. conceptually:
	•	apps/standalone-docker
	•	apps/home-assistant-addon
	•	apps/ble-proxy
	•	apps/appwrite-site
	•	lib/ or packages/core for shared logic (e.g. SFP parsing, core domain models, utilities).
	•	Put shared logic in lib/core, and keep target-specific wiring in each apps/* folder.

9.2 Deployment Targets
	1.	Standalone Docker Compose
	•	For self-hosted or offline use.
	•	Uses the standard backend stack in this repo.
	•	Must NOT depend on Appwrite.
	2.	Home Assistant Add-on
	•	Focused on ease of deployment and BLE compatibility.
	•	Uses Home Assistant and ESPHome BLE proxies.
	•	Must follow HA add-on conventions (config, logs, lifecycle).
	3.	Minimal BLE Proxy Container
	•	A small container that provides BLE proxy functionality for frontends where browser BLE is not available (e.g., Safari/iOS).
	•	Scope should remain narrowly BLE-bridge focused.
	4.	Appwrite Cloud Site
	•	Public, invite-only site, hosted only by the maintainer.
	•	Uses Appwrite-native SDK + backend.
	•	Provides:
	•	Core functionality.
	•	Community-driven SFP module data repository.
	•	Not intended for third parties to deploy their own Appwrite instance.

9.3 Feature Parity Expectations
	•	No strict feature parity.
Each target may have intentional divergences, such as:
	•	Extra pages or views for certain targets.
	•	Auth gates and account features in the Appwrite site only.
	•	No BLE proxy option for the Appwrite deployment (because it doesn’t need it).
	•	When implementing features:
	•	Explicitly decide which targets they apply to.
	•	Document any meaningful differences or omissions.

9.4 Appwrite vs Self-Hosted / HA
	•	Appwrite is maintainer-only
	•	Do not imply users should spin up their own Appwrite environment.
	•	Appwrite deployment artifacts are for maintainer hosting only.
	•	Code separation
	•	Keep Appwrite-specific logic in clearly separate modules/apps (apps/appwrite-site, Appwrite-specific services).
	•	Avoid leaking Appwrite-specific code into:
	•	Standalone Docker app.
	•	HA add-on.
	•	BLE proxy container.
	•	Shared core
	•	Shared domain logic should live in core/shared modules and be imported by:
	•	Standalone Docker app.
	•	HA add-on.
	•	BLE proxy.
	•	Appwrite site.

9.5 Community SFP Module Data & Frontend Setting
	•	Canonical community DB
	•	The Appwrite deployment hosts the canonical community SFP module data.
	•	Sync for self-hosted / HA / BLE proxy
	•	Self-hosted and HA instances may optionally:
	•	Upload SFP data to the community DB.
	•	Download SFP data from it.
	•	Control via frontend setting
	•	Upload/download behavior must be controlled by a frontend setting, for example:
	•	Toggles like “Use community SFP database”, “Upload anonymized SFP data”.
	•	The setting should:
	•	Be clearly visible and understandable to users.
	•	Persist across sessions (e.g., local storage, config, or per-user settings).
	•	Fail gracefully if connectivity to Appwrite is unavailable (no crashes, clear messaging).
	•	Separation of concerns
	•	Aside from community data sync, avoid coupling self-hosted/HA deployments to Appwrite-specific APIs.
	•	Encapsulate any Appwrite client logic into boundary modules that can be disabled or stubbed when community sync is off.

9.6 Docs & Build Matrix
	•	Per-target docs
	•	Document for each target:
	•	How to build/run it.
	•	Which features it supports.
	•	How community data sync behaves (and how to toggle it).
	•	Build clarity
	•	Make it obvious via scripts/config which build corresponds to which target:
	•	e.g., npm run build:standalone, build:ha-addon, build:ble-proxy, build:appwrite.
