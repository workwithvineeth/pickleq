-- Retain the audit and its provenance when a match or its parent is deleted.
alter table public.club_score_corrections
  drop constraint club_score_corrections_match_id_fkey,
  drop constraint club_score_corrections_club_id_fkey,
  add constraint club_score_corrections_match_id_fkey
    foreign key (match_id) references public.club_matches(id) on delete restrict,
  add constraint club_score_corrections_club_id_fkey
    foreign key (club_id) references public.clubs(id) on delete restrict;
