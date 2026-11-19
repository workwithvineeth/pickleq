-- Every foreign key in the public schema has an index that starts with its column (club_mode_20). Expected: no row says FAIL.
select case when count(*) = 0 then 'every foreign key has an index'
  else 'FAIL foreign keys without an index: ' || string_agg(format('%s(%s)', c.conrelid::regclass, a.attname), ', ') end
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
where c.contype = 'f' and c.connamespace = 'public'::regnamespace and cardinality(c.conkey) = 1
  and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]);
