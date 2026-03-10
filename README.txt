This patch replaces ONE file:

- app/attendance/page.tsx

It fixes repeated 'Nešlo načíst uživatele' by:
- trying multiple /me endpoints and extracting user from different JSON shapes
- showing a DEBUG dump on the page when load fails

How to apply:
1) Overwrite app/attendance/page.tsx
2) Commit + push (Vercel redeploys)

No DB changes.
