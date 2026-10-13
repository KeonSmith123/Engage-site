-- Run just before launch to clear test submissions.
-- Check what will go first:
select id, created_at, type, email from public.leads order by created_at desc;

-- Then delete. Narrow the WHERE clause if real leads already exist.
-- delete from public.leads where email ilike '%@workinflow.co.za' or email ilike '%test%';
