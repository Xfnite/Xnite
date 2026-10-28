# Database Optimization & Global State

When tasked with implementing a global state change or syncing a shared value (e.g., a "global last updated timestamp") across many rows in a SQL database (like Supabase/PostgreSQL):

- **DO NOT** use mass `UPDATE` queries to modify every row. This causes severe database bloat and performance degradation due to PostgreSQL's MVCC architecture.
- **INSTEAD**, prefer one of the following optimized approaches:
  1. **Frontend Calculation / Lightweight Query**: Modify the API endpoint or frontend to fetch a single aggregate value (e.g., `ORDER BY updatedAt DESC LIMIT 1`).
  2. **Dedicated Settings Table**: Store the global state in a dedicated 1-row table (e.g., `SystemSettings`).

When determining the scope of "global latest events", ensure you do not inadvertently filter out the exact event triggers you want to track (e.g., filtering out "Sent" statuses from the query, which would prevent a transition to "Sent" from registering as the latest event).
