-- Access helpers (they must exist before the policies that call them) and row level security.
-- Service role bypasses RLS. Tables with RLS on and no policy are closed to anon and authenticated.

create function my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where user_id = auth.uid()
$$;

create function my_school() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from profiles where user_id = auth.uid()
$$;

create function teaches_class(cls uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes where id = cls and teacher_id = auth.uid())
$$;

create function teaches_child(child uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrolments e join classes c on c.id = e.class_id
    where e.child_id = child and c.teacher_id = auth.uid()
  )
$$;

create function parent_of(child uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from parent_links
    where child_id = child and parent_id = auth.uid() and status = 'approved'
  )
$$;

create function is_child_user(child uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from children where id = child and user_id = auth.uid())
$$;

create function can_see_child(child uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select teaches_child(child) or parent_of(child) or is_child_user(child)
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function my_role(), my_school(), teaches_class(uuid), teaches_child(uuid),
  parent_of(uuid), is_child_user(uuid), can_see_child(uuid) to authenticated, service_role;

alter table schools enable row level security;
alter table profiles enable row level security;
alter table classes enable row level security;
alter table children enable row level security;
alter table child_logins enable row level security;
alter table child_login_attempts enable row level security;
alter table enrolments enable row level security;
alter table parent_links enable row level security;
alter table curriculum_docs enable row level security;
alter table curriculum_maps enable row level security;
alter table topics enable row level security;
alter table tests enable row level security;
alter table answer_keys enable row level security;
alter table papers enable row level security;
alter table paper_pages enable row level security;
alter table question_results enable row level security;
alter table gaps enable row level security;
alter table lessons enable row level security;
alter table sessions enable row level security;
alter table session_items enable row level security;
alter table format_trials enable row level security;
alter table reteach_plans enable row level security;
alter table guidance_cards enable row level security;
alter table observations enable row level security;
alter table attendance enable row level security;
alter table activities enable row level security;
alter table needs_you_items enable row level security;
alter table events enable row level security;
alter table activity_log enable row level security;
alter table notifications enable row level security;
alter table ai_replays enable row level security;
alter table demo_sandboxes enable row level security;
alter table mcp_tokens enable row level security;

-- Identity and structure.
create policy schools_select on schools for select to authenticated using (id = my_school());
create policy profiles_select on profiles for select to authenticated using (user_id = auth.uid());
create policy classes_select on classes for select to authenticated
  using (
    teacher_id = auth.uid()
    or exists (select 1 from enrolments e where e.class_id = classes.id and can_see_child(e.child_id))
  );
create policy children_select on children for select to authenticated using (can_see_child(id));
create policy enrolments_select on enrolments for select to authenticated
  using (teaches_class(class_id) or can_see_child(child_id));
create policy parent_links_select on parent_links for select to authenticated
  using (parent_id = auth.uid() or teaches_class(class_id));

-- Teacher setup data: the class teacher only (answer keys must never reach a child).
create policy curriculum_docs_select on curriculum_docs for select to authenticated using (teaches_class(class_id));
create policy curriculum_maps_select on curriculum_maps for select to authenticated using (teaches_class(class_id));
create policy topics_select on topics for select to authenticated
  using (exists (select 1 from curriculum_maps m where m.id = topics.map_id and teaches_class(m.class_id)));
create policy tests_select on tests for select to authenticated using (teaches_class(class_id));
create policy answer_keys_select on answer_keys for select to authenticated
  using (exists (select 1 from tests t where t.id = answer_keys.test_id and teaches_class(t.class_id)));
create policy reteach_plans_select on reteach_plans for select to authenticated using (teaches_class(class_id));

-- Papers: the child's circle, or the class teacher for unmatched papers.
create policy papers_select on papers for select to authenticated
  using (
    (child_id is not null and can_see_child(child_id))
    or (test_id is not null and exists (select 1 from tests t where t.id = papers.test_id and teaches_class(t.class_id)))
  );
create policy paper_pages_select on paper_pages for select to authenticated
  using (exists (select 1 from papers p where p.id = paper_pages.paper_id));

-- Child-scoped tables.
create policy question_results_select on question_results for select to authenticated using (can_see_child(child_id));
create policy gaps_select on gaps for select to authenticated using (can_see_child(child_id));
create policy lessons_select on lessons for select to authenticated using (can_see_child(child_id));
create policy sessions_select on sessions for select to authenticated using (can_see_child(child_id));
create policy session_items_select on session_items for select to authenticated
  using (exists (select 1 from sessions s where s.id = session_items.session_id and can_see_child(s.child_id)));
create policy format_trials_select on format_trials for select to authenticated using (can_see_child(child_id));
create policy guidance_cards_select on guidance_cards for select to authenticated using (can_see_child(child_id));
create policy observations_select on observations for select to authenticated using (can_see_child(child_id));
create policy attendance_select on attendance for select to authenticated using (can_see_child(child_id));
create policy activities_select on activities for select to authenticated using (can_see_child(child_id));

-- Writes from the web app. Everything else goes through the agent with the service role.
create policy observations_insert on observations for insert to authenticated
  with check (teaches_child(child_id) and author_id = auth.uid());
create policy attendance_insert on attendance for insert to authenticated with check (teaches_child(child_id));
create policy attendance_update on attendance for update to authenticated
  using (teaches_child(child_id)) with check (teaches_child(child_id));
create policy activities_insert on activities for insert to authenticated
  with check (parent_of(child_id) and created_by = auth.uid());

-- Owner only.
create policy needs_you_items_select on needs_you_items for select to authenticated using (owner_id = auth.uid());
create policy needs_you_items_update on needs_you_items for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy notifications_select on notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Events and the activity log.
create policy events_select on events for select to authenticated using (school_id = my_school());
create policy activity_log_select on activity_log for select to authenticated
  using ((child_id is not null and can_see_child(child_id)) or (child_id is null and school_id = my_school()));

-- No policies (service role only): child_logins, child_login_attempts, ai_replays, demo_sandboxes, mcp_tokens.
