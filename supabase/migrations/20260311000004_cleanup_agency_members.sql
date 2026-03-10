-- Remove client users from agency_members (they shouldn't be there)
DELETE FROM public.agency_members WHERE role = 'cliente';
-- Also remove any with null user_id (ghost entries)
DELETE FROM public.agency_members WHERE user_id IS NULL;
