-- İzdivaç modülünün görünen adı "Tanışma" olarak değişti.
--
-- Yalnızca kullanıcıya görünen metinler güncellenir. Rota (`/izdivac-center`),
-- tablo (`izdivac_*`, `vv_*` benzeri), depolama kovası (`izdivac-media`),
-- bildirim `event_type` anahtarları ve RPC adları geriye dönük uyumluluk için
-- aynı kalır.

-- 1) Merkez / özellik bayrağı etiketi (Merkezler sekmesi + admin listesi)
update public.app_feature_flags
set label = 'Tanışma'
where feature_id = 'izdivac-center'
  and label <> 'Tanışma';

-- 2) Bildirim türü etiketleri (admin ses ayarları + bildirim tercihleri)
update public.notification_sound_settings
set label = replace(label, 'İzdivaç', 'Tanışma')
where label like '%İzdivaç%';

-- 3) RPC gövdelerindeki kullanıcıya görünen mesajlar
--    (ör. "İzdivaç erişiminiz yok", "İzdivaç daveti").
--    Fonksiyonların tamamı yeniden yazılmaz; yalnızca marka metni değiştirilir.
do $$
declare
  v_oids oid[];
  v_count int;
  v_def text;
  i int;
begin
  select array_agg(p.oid)
  into v_oids
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and pg_get_functiondef(p.oid) like '%İzdivaç%';

  v_count := coalesce(array_length(v_oids, 1), 0);
  if v_count = 0 then
    raise notice 'Tanışma: güncellenecek fonksiyon bulunamadı';
    return;
  end if;

  for i in 1..v_count loop
    v_def := pg_get_functiondef(v_oids[i]);
    execute replace(v_def, 'İzdivaç', 'Tanışma');
  end loop;

  raise notice 'Tanışma: % fonksiyon metni güncellendi', v_count;
end $$;
