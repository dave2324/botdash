-- Get the definition of check_withdrawal_eligibility function
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'check_withdrawal_eligibility';

-- Alternative: Get more detailed information
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_catalog.pg_get_function_arguments(p.oid) as arguments,
    pg_catalog.pg_get_function_result(p.oid) as return_type,
    p.prosrc as source_code,
    l.lanname as language,
    pg_catalog.obj_description(p.oid, 'pg_proc') as description
FROM pg_catalog.pg_proc p
LEFT JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN pg_catalog.pg_language l ON l.oid = p.prolang
WHERE p.proname = 'check_withdrawal_eligibility'
AND n.nspname NOT IN ('pg_catalog', 'information_schema');

-- Check if function exists at all
SELECT EXISTS (
    SELECT 1 
    FROM pg_proc 
    WHERE proname = 'check_withdrawal_eligibility'
) as function_exists;