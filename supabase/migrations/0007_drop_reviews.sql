-- Migration 0007: reviews no longer stored on-site; see docs/superpowers/specs/2026-11-03-google-review-link-design.md
drop table if exists public.reviews;
