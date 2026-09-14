-- Every review Vidiyal has read for a connected account, and the one rule that keeps a
-- trader from collecting the same account twice.

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references connections (id) on delete cascade,
  range_from timestamptz not null,
  range_to timestamptz not null,
  -- The whole review as the engine produced it: graded trips, patterns, checklist and the
  -- equity curve. It is stored whole rather than split into tables because the desk reads
  -- it whole, and because a bundle is a record of what was true when it was read.
  bundle jsonb not null,
  verification jsonb not null,
  generated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists reviews_connection_id_generated_at_idx on reviews (connection_id, generated_at desc);

-- One row per trader per Bitget account. Connecting the same account again updates the row
-- that is there instead of leaving a second copy of the same sealed key behind. Two rows
-- whose uid is null are left alone by this: Postgres reads two nulls as two different
-- values, and an account Bitget never named cannot be proved to be the same account.
create unique index if not exists connections_user_id_uid_idx on connections (user_id, uid);
