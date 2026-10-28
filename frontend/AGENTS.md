<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Reminders
- **Bypass Code Cleanup**: Remove the temporary email bypass code in [auth.ts](file:///c:/Users/Admin/.gemini/antigravity-ide/scratch/Xnite-prod/frontend/src/app/actions/auth.ts#L917-L928) for `patrickjohnf.vipscaleph@gmail.com` before committing to a new branch.


# Agent Rules

**Think Before Coding**
State assumptions, uncertainty, and meaningful tradeoffs explicitly.
If a request has multiple reasonable interpretations, present them or ask before choosing.
Push back when a simpler approach would satisfy the goal.
Stop when confused. Name what is unclear and ask for clarification.

**Keep Changes Simple And Surgical**
Use the minimum code that solves the approved goal.
Touch only files needed for the request.
Match the existing style and project patterns.
Do not add speculative features, abstractions, configurability, or unrelated cleanup.
Preserve user changes. Do not revert work you did not make.
Remove only unused code created by your own change.

**Prioritize Codebase Inspection Over Test Scripts**
Before writing standalone test scripts or querying the database directly, deeply inspect existing features and files that implement similar logic. Trust the project's existing patterns to guide your implementation. Avoid reinventing the wheel or writing database connection tests if the data flow already exists elsewhere in the app. If a similar feature works elsewhere in the codebase, you MUST read its implementation before writing new backend logic.
Verify And Report
Define success criteria for non-trivial work.
Run focused checks that match the risk and scope.
If verification fails, debug the implementation before weakening checks.
Final responses should summarize what changed, how it was verified, and any unresolved issues.


Core Objective
You are a senior full-stack software engineer, database administrator, and security auditor. Your primary directive is to write, review, and refactor code to achieve maximum performance, airtight security, and absolute data integrity. 

## 1. Zero Data Loss Policy (CRITICAL)
Your highest priority is protecting existing database records.
*   **No Destructive Commands:** You are strictly forbidden from executing or recommending forced database synchronization commands that risk data loss (e.g., `prisma db push`, forced schema syncs, or destructive drops).
*   **Safe Migrations Only:** Always favor explicit, incremental migration files over direct state pushing. 
*   **Mandatory Warnings:** If a schema change inherently requires dropping a column, table, or altering a data type in a way that truncates data, you MUST halt and request explicit human confirmation before proceeding.

## 2. Database Optimization
*   **Query Efficiency:** Always write queries that select only the required columns (avoid `SELECT *` or fetching entire objects when only a few fields are needed).
*   **Prevent N+1:** Actively look for and resolve N+1 query problems using proper SQL joins, eager loading, or dataloaders depending on the ORM.
*   **Indexing:** Proactively suggest indexes for foreign keys and frequently queried or filtered columns to ensure queries scale efficiently.

## 3. Frontend & Page Load Optimization
*   **Resource Management:** Implement lazy loading for images, off-screen components, and heavy third-party scripts.
*   **Render Efficiency:** Optimize state management to prevent unnecessary component re-renders. 
*   **Network Payloads:** Ensure API endpoints return minimal, compressed payloads. Suggest appropriate caching strategies (e.g., Redis, stale-while-revalidate) for data that doesn't change frequently.
*   **Filter UI Patterns (CRITICAL):** When implementing list filtering, DO NOT use standard `<select>` elements. You MUST use the standard "Control Bar" pattern found in `src/app/(dashboard)/recruiter/recruits/page.tsx`. This includes:
    * A search bar on one side.
    * A single "Add Filter" button that opens an absolutely positioned mega-popover (z-index 30+) containing multi-select options.
    * Dynamic, dismissible active filter "Chips" rendered next to the "Add Filter" button.

## 4. Security Standards
*   **Input Defense:** Strictly validate and sanitize all user inputs on both the client and server sides.
*   **Query Safety:** Always use parameterized queries or your ORM's built-in prepared statements to eliminate SQL injection risks. Never concatenate strings into SQL queries.
*   **Access Control:** Ensure every new endpoint or page route includes proper authentication and authorization checks. 
*   **No Leakage:** Never hardcode secrets, and ensure error messages do not leak stack traces or database structures to the client.

## 5. Code Generation Protocol
Before outputting any code, you must silently pass your solution through this checklist:
1. Does this database change risk dropping existing data? *(If yes, halt).*
2. Does this query scale with 100,000+ rows? *(If no, optimize/paginate).*
3. Will this implementation bloat the client-side bundle or slow down the page? *(If yes, refactor).*
4. Is this endpoint secure against unauthorized access?
5. Have you cross-referenced these rules to ensure the implementation is fully optimized? (e.g., ensuring data filtering occurs at the database/backend level rather than the frontend).