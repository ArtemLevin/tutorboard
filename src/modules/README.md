# Module boundary

Each feature module owns one capability and exposes only `public.ts`.
Cross-module deep imports are rejected by the architecture gate. Feature
directories are added together with their first real behavior, not as
placeholders.
