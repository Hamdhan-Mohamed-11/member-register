-- Baseline rows the app assumes exist. Idempotent so re-running is harmless.

insert into app_settings (id)
values (1)
on conflict (id) do nothing;

-- A first public club so /join has something to offer and the approval flow is
-- testable before any admin work has been done.
insert into clubs (name, slug, kind, description)
values (
  'Pick a Book Public Club',
  'public-club',
  'public',
  'The main open club. Anyone can apply to join; a club admin approves.'
)
on conflict (slug) do nothing;
