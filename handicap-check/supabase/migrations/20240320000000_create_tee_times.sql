-- Create an enum for posting status
create type posting_status as enum ('posted', 'unexcused_no_post', 'excused_no_post');

-- Create an enum for gender
create type gender as enum ('M', 'F');

-- Create golfers table
create table golfers (
  id uuid default gen_random_uuid() primary key,
  ghin_number text unique,
  first_name text not null,
  last_name text not null,
  email text,
  gender gender,
  member_number text unique,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create tee_times table with reference to golfers
create table tee_times (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  golfer_id uuid references golfers(id) not null,
  tee_time time not null,
  posting_status posting_status not null default 'unexcused_no_post',
  excuse_reason text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(date, golfer_id, tee_time)
);

-- Create indexes
create index tee_times_date_idx on tee_times(date);
create index tee_times_posting_status_idx on tee_times(posting_status);
create index golfers_ghin_number_idx on golfers(ghin_number);
create index golfers_member_number_idx on golfers(member_number);

-- Create a function to update the updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create triggers to automatically update the updated_at column
create trigger update_golfers_updated_at
  before update on golfers
  for each row
  execute function update_updated_at_column();

create trigger update_tee_times_updated_at
  before update on tee_times
  for each row
  execute function update_updated_at_column(); 