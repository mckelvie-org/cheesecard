


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."role" AS ENUM (
    'pending',
    'member',
    'admin'
);


ALTER TYPE "public"."role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_member"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('member', 'admin')
  );
$$;


ALTER FUNCTION "public"."is_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_admins_new_member"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."notify_admins_new_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_members"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_actor_id   uuid;
  v_actor_name text;
  v_type       text;
  v_ref_id     uuid;
  v_subject    text;
BEGIN
  IF TG_TABLE_NAME = 'tastings' THEN
    v_actor_id := NEW.created_by;
    v_type     := 'new_tasting';
    v_ref_id   := NEW.id;
    v_subject  := to_char(NEW.date::date, 'FMMonth FMDD, YYYY');
  ELSIF TG_TABLE_NAME = 'cheeses' THEN
    v_actor_id := NEW.created_by;
    v_type     := 'new_cheese';
    v_ref_id   := NEW.id;
    v_subject  := NEW.name;
  ELSIF TG_TABLE_NAME = 'reviews' THEN
    v_actor_id := NEW.user_id;
    v_type     := 'new_review';
    v_ref_id   := NEW.cheese_id;
    v_subject  := (SELECT name FROM cheeses WHERE id = NEW.cheese_id);
  ELSIF TG_TABLE_NAME = 'comments' THEN
    v_actor_id := NEW.user_id;
    v_type     := 'new_comment';
    v_ref_id   := NEW.cheese_id;
    v_subject  := (SELECT name FROM cheeses WHERE id = NEW.cheese_id);
  END IF;

  -- Guard: if actor unknown (e.g. created_by not yet set), skip
  IF v_actor_id IS NULL THEN RETURN NEW; END IF;

  v_actor_name := (SELECT full_name FROM profiles WHERE id = v_actor_id);

  -- Fan-out: one row per other member/admin
  INSERT INTO notifications (user_id, type, actor_id, actor_name, ref_id, subject)
  SELECT p.id, v_type, v_actor_id, v_actor_name, v_ref_id, v_subject
  FROM profiles p
  WHERE p.role IN ('member', 'admin')
    AND p.id != v_actor_id;

  -- LRU cap: drop oldest beyond 50 for each user who just received a notification
  DELETE FROM notifications
  WHERE id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY user_id ORDER BY created_at DESC
             ) AS rn
      FROM notifications
      WHERE user_id IN (
        SELECT id FROM profiles
        WHERE role IN ('member', 'admin')
          AND id != v_actor_id
      )
    ) ranked
    WHERE rn > 50
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_members"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."cheeses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "country" "text",
    "region" "text",
    "milk_type" "text",
    "description" "text",
    "food_pairings" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "wine_pairings" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "front_image_url" "text",
    "back_image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);

ALTER TABLE ONLY "public"."cheeses" REPLICA IDENTITY FULL;


ALTER TABLE "public"."cheeses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cheese_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "parent_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."comments" REPLICA IDENTITY FULL;


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "actor_id" "uuid",
    "actor_name" "text",
    "ref_id" "uuid" NOT NULL,
    "subject" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."notifications" REPLICA IDENTITY FULL;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "role" "public"."role" DEFAULT 'pending'::"public"."role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."profiles" REPLICA IDENTITY FULL;


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cheese_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rating" smallint,
    "is_favorite" boolean DEFAULT false NOT NULL,
    "body" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);

ALTER TABLE ONLY "public"."reviews" REPLICA IDENTITY FULL;


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasting_cheeses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tasting_id" "uuid" NOT NULL,
    "cheese_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."tasting_cheeses" REPLICA IDENTITY FULL;


ALTER TABLE "public"."tasting_cheeses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasting_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tasting_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "photo_url" "text" NOT NULL,
    "caption" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tasting_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tastings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."tastings" REPLICA IDENTITY FULL;


ALTER TABLE "public"."tastings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."cheeses"
    ADD CONSTRAINT "cheeses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_cheese_id_user_id_key" UNIQUE ("cheese_id", "user_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasting_cheeses"
    ADD CONSTRAINT "tasting_cheeses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasting_cheeses"
    ADD CONSTRAINT "tasting_cheeses_tasting_id_cheese_id_key" UNIQUE ("tasting_id", "cheese_id");



ALTER TABLE ONLY "public"."tasting_photos"
    ADD CONSTRAINT "tasting_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tastings"
    ADD CONSTRAINT "tastings_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "cheeses_name_unique_ci" ON "public"."cheeses" USING "btree" ("lower"("name"));



CREATE OR REPLACE TRIGGER "notify_on_cheese_insert" AFTER INSERT ON "public"."cheeses" FOR EACH ROW EXECUTE FUNCTION "public"."notify_members"();



CREATE OR REPLACE TRIGGER "notify_on_comment_insert" AFTER INSERT ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."notify_members"();



CREATE OR REPLACE TRIGGER "notify_on_profile_insert" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."notify_admins_new_member"();



CREATE OR REPLACE TRIGGER "notify_on_review_insert" AFTER INSERT ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."notify_members"();



CREATE OR REPLACE TRIGGER "notify_on_tasting_insert" AFTER INSERT ON "public"."tastings" FOR EACH ROW EXECUTE FUNCTION "public"."notify_members"();



CREATE OR REPLACE TRIGGER "reviews_updated_at" BEFORE UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."cheeses"
    ADD CONSTRAINT "cheeses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_cheese_id_fkey" FOREIGN KEY ("cheese_id") REFERENCES "public"."cheeses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_cheese_id_fkey" FOREIGN KEY ("cheese_id") REFERENCES "public"."cheeses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasting_cheeses"
    ADD CONSTRAINT "tasting_cheeses_cheese_id_fkey" FOREIGN KEY ("cheese_id") REFERENCES "public"."cheeses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasting_cheeses"
    ADD CONSTRAINT "tasting_cheeses_tasting_id_fkey" FOREIGN KEY ("tasting_id") REFERENCES "public"."tastings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasting_photos"
    ADD CONSTRAINT "tasting_photos_tasting_id_fkey" FOREIGN KEY ("tasting_id") REFERENCES "public"."tastings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasting_photos"
    ADD CONSTRAINT "tasting_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tastings"
    ADD CONSTRAINT "tastings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



CREATE POLICY "admins can manage cheeses" ON "public"."cheeses" USING ("public"."is_admin"());



CREATE POLICY "admins can manage tastings" ON "public"."tastings" USING ("public"."is_admin"());



CREATE POLICY "admins can update any profile" ON "public"."profiles" FOR UPDATE USING ("public"."is_admin"());



ALTER TABLE "public"."cheeses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members can insert comments" ON "public"."comments" FOR INSERT WITH CHECK (("public"."is_member"() AND ("auth"."uid"() = "user_id")));



CREATE POLICY "members can insert own review" ON "public"."reviews" FOR INSERT WITH CHECK (("public"."is_member"() AND ("auth"."uid"() = "user_id")));



CREATE POLICY "members can insert tasting photos" ON "public"."tasting_photos" FOR INSERT WITH CHECK (("public"."is_member"() AND ("auth"."uid"() = "user_id")));



CREATE POLICY "members can read all comments" ON "public"."comments" FOR SELECT USING ("public"."is_member"());



CREATE POLICY "members can read all profiles" ON "public"."profiles" FOR SELECT USING ("public"."is_member"());



CREATE POLICY "members can read all reviews" ON "public"."reviews" FOR SELECT USING ("public"."is_member"());



CREATE POLICY "members can read cheeses" ON "public"."cheeses" FOR SELECT USING ("public"."is_member"());



CREATE POLICY "members can read tasting photos" ON "public"."tasting_photos" FOR SELECT USING ("public"."is_member"());



CREATE POLICY "members can read tastings" ON "public"."tastings" FOR SELECT USING ("public"."is_member"());



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service role can insert profiles" ON "public"."profiles" FOR INSERT WITH CHECK (true);



ALTER TABLE "public"."tasting_cheeses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasting_cheeses: admin delete" ON "public"."tasting_cheeses" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"public"."role")))));



CREATE POLICY "tasting_cheeses: authenticated insert" ON "public"."tasting_cheeses" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "tasting_cheeses: authenticated select" ON "public"."tasting_cheeses" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."tasting_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tastings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can delete own notifications" ON "public"."notifications" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users can read own notifications" ON "public"."notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users can update own comments" ON "public"."comments" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "users can update own review" ON "public"."reviews" FOR UPDATE USING (("auth"."uid"() = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cheeses";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."comments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."reviews";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tasting_cheeses";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tastings";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_member"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_admins_new_member"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_admins_new_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_admins_new_member"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_members"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_members"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_members"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."cheeses" TO "anon";
GRANT ALL ON TABLE "public"."cheeses" TO "authenticated";
GRANT ALL ON TABLE "public"."cheeses" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."tasting_cheeses" TO "anon";
GRANT ALL ON TABLE "public"."tasting_cheeses" TO "authenticated";
GRANT ALL ON TABLE "public"."tasting_cheeses" TO "service_role";



GRANT ALL ON TABLE "public"."tasting_photos" TO "anon";
GRANT ALL ON TABLE "public"."tasting_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."tasting_photos" TO "service_role";



GRANT ALL ON TABLE "public"."tastings" TO "anon";
GRANT ALL ON TABLE "public"."tastings" TO "authenticated";
GRANT ALL ON TABLE "public"."tastings" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































