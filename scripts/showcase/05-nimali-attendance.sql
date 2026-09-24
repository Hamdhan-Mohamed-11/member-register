-- Nimali attended two of the club's past evenings.
--
-- Feedback is only open to people the club recorded as attending, so without
-- this there is no way to see the feedback forms as a member.

insert into member_activities (session_id, member_id, activity_code, points_awarded, recorded_by, recorded_at)
select
  s.id,
  m.id,
  'attend',
  coalesce((select points from points_rules where code = 'attend'), 10),
  (select id from profiles where role = 'super_admin' limit 1),
  s.held_at + interval '2 hours'
from sessions s
cross join (select id from profiles where email = 'member@test.pickabook.lk') m
where s.title in ('Game Night', 'September Book Swap')
  and s.held_at < now()
on conflict (session_id, member_id, activity_code) do nothing;

select s.title, s.held_at, p.first_name
from member_activities a
join sessions s on s.id = a.session_id
join profiles p on p.id = a.member_id
where p.email = 'member@test.pickabook.lk' and a.activity_code = 'attend';
