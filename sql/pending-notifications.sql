CREATE OR REPLACE FUNCTION notify_admins_new_member()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role != 'pending' THEN RETURN NEW; END IF;

  INSERT INTO notifications (user_id, type, actor_id, actor_name, ref_id, subject)
  SELECT p.id,
         'new_member',
         NEW.id,
         COALESCE(NEW.full_name, NEW.email),
         NEW.id,
         COALESCE(NEW.full_name, NEW.email)
  FROM profiles p
  WHERE p.role = 'admin';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER notify_on_profile_insert
  AFTER INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION notify_admins_new_member();
