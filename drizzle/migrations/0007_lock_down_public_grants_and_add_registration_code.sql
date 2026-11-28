-- Revoke direct table privileges from PUBLIC, anon, and authenticated on all server-only tables
REVOKE ALL ON TABLE
  public.class_quizzes,
  public.exam_attempts,
  public.exam_events,
  public.exam_rounds,
  public.exam_settings,
  public.question_banks,
  public.quiz_attempts,
  public.quiz_entry_permissions,
  public.registered_students,
  public.round_results,
  public.school_roster,
  public.staff_credentials,
  public.telegram_broadcasts,
  public.telegram_messages,
  public.telegram_settings,
  public.telegram_users
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.class_quizzes,
  public.exam_attempts,
  public.exam_events,
  public.exam_rounds,
  public.exam_settings,
  public.question_banks,
  public.quiz_attempts,
  public.quiz_entry_permissions,
  public.registered_students,
  public.round_results,
  public.school_roster,
  public.staff_credentials,
  public.telegram_broadcasts,
  public.telegram_messages,
  public.telegram_settings,
  public.telegram_users
TO service_role;

-- Prevent future public-schema tables from automatically granting privileges to anon or authenticated
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

-- Add IT Admin-managed registration access code to exam_settings
ALTER TABLE public.exam_settings
  ADD COLUMN IF NOT EXISTS registration_code text;

-- Seed a strong initial registration code if registration is currently open
UPDATE public.exam_settings
SET registration_code = upper(substr(md5(gen_random_uuid()::text), 1, 4) || '-' || substr(md5(gen_random_uuid()::text), 5, 4))
WHERE id = 1 AND registration_open = true AND registration_code IS NULL;