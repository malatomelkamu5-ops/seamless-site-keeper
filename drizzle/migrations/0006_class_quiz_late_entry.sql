ALTER TABLE public.class_quizzes ADD COLUMN entry_window_sec integer;
CREATE TABLE public.quiz_entry_permissions (
 quiz_id uuid NOT NULL REFERENCES public.class_quizzes(id) ON DELETE CASCADE,
 student_code text NOT NULL REFERENCES public.registered_students(student_code) ON DELETE CASCADE,
 granted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (quiz_id, student_code)
);
GRANT ALL ON public.quiz_entry_permissions TO service_role;
ALTER TABLE public.quiz_entry_permissions ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.check_quiz_entry() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE q public.class_quizzes;
BEGIN
 SELECT * INTO q FROM public.class_quizzes WHERE id = NEW.quiz_id FOR SHARE;
 IF q.status <> 'live' THEN RAISE EXCEPTION 'This test is closed.'; END IF;
 IF q.entry_window_sec IS NOT NULL AND clock_timestamp() >= q.created_at + q.entry_window_sec * interval '1 second' AND NOT EXISTS (SELECT 1 FROM public.quiz_entry_permissions WHERE quiz_id = q.id AND student_code = NEW.student_code) THEN
 RAISE EXCEPTION 'Late entry locked. Ask your teacher to permit entry.';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.check_quiz_entry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_quiz_entry() TO service_role;
CREATE TRIGGER quiz_entry_check BEFORE INSERT ON public.quiz_attempts FOR EACH ROW EXECUTE FUNCTION public.check_quiz_entry();