create function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$ select decode(substr((select string_agg(md5(random()::text||g::text),'') from generate_series(1,(n/16)+1) g),1,n*2),'hex') $$;
create function extensions.digest(t text, a text) returns bytea language sql immutable as $$ select decode(md5(t),'hex') $$;
create function extensions.digest(t bytea, a text) returns bytea language sql immutable as $$ select decode(md5(t),'hex') $$;
create function extensions.gen_salt(a text) returns text language sql volatile as $$ select 'salt'||substr(md5(random()::text),1,8) $$;
create function extensions.gen_salt(a text, n int) returns text language sql volatile as $$ select 'salt'||substr(md5(random()::text),1,8) $$;
create function extensions.crypt(p text, s text) returns text language sql immutable as $$ select substr(s,1,12)||md5(p||substr(s,1,12)) $$;
grant execute on all functions in schema extensions to anon, authenticated, service_role;
