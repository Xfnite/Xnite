# Sorting String-Based Dates

When sorting records by date fields that are formatted as human-readable strings (e.g., "June 30 - July 15, 2026 Cutoff" or "March 2024"):
- **Do not rely on database alphabetical sorting** (e.g., `ORDER BY column DESC` in SQL or Prisma). Alphabetical sorting will cause incorrect ordering (e.g., "June" is alphabetically greater than "July").
- **Instead**, parse the actual date from the string into a numeric timestamp (e.g., using `new Date(extractedDateString).getTime()`) and sort the array chronologically in memory.
