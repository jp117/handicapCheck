create table excluded_dates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time, -- nullable, if null means all day
  end_time time,   -- nullable, if null means all day
  reason text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index excluded_dates_date_idx on excluded_dates(date); 