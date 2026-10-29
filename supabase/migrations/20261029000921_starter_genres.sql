insert into public.catalog_items(type,external_id,display_value,source_url)
select 'genre',external_id::uuid,name,'https://musicbrainz.org/genre/'||external_id
from (values
  ('36917620-240a-4fed-abcb-7be611ac3834','indie folk'),
  ('f390be72-360b-41bb-a310-6a2e638779d2','indie pop'),
  ('ccd19ebf-052c-4afe-8ad9-fbb0a73f94a7','indie rock'),
  ('060beed7-e597-4c42-8e25-5bf8bd5dd3cb','industrial'),
  ('eba7715e-ee26-4989-8d49-9db382955419','j-pop'),
  ('d181e978-c908-4f33-b2a2-f7454d0cb2c1','j-rock'),
  ('a715278f-1580-409f-8078-4ffbc800e08b','jazz')
) as source(external_id,name)
on conflict(type,external_id) do nothing;
