update public.clubs as club
set name = corrected.name
from (values
  ('besiktas', 'Beşiktaş'),
  ('istanbul-basaksehir', 'İstanbul Başakşehir'),
  ('genclerbirligi', 'Gençlerbirliği'),
  ('kasimpasa', 'Kasımpaşa'),
  ('deportivo-la-coruna', 'Deportivo La Coruña'),
  ('vitoria-guimaraes', 'Vitória Guimarães'),
  ('standard-liege', 'Standard Liège'),
  ('brondby', 'Brøndby')
) as corrected(external_id, name)
where club.external_id = corrected.external_id;
