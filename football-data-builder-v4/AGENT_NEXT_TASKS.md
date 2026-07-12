# Football Data Builder v4 — Sonraki Görevler

1. Gerçek internet bağlantılı ortamda `resolve-wikipedia-categories --priority 1` çalıştır.
2. Yanlış kategori adaylarını manuel düzelt ve `clubs.json` içine kalıcı yaz.
3. `import-wikipedia --priority 1 --max-pages-per-club 100` ile pilot import yap.
4. `collection-report` üzerinden duplicate, kategori ve eşleşme sonuçlarını incele.
5. Pilot başarılıysa limitsiz Wikipedia importunu bütün 131 kulüpte çalıştır.
6. Wikidata importer'a `source_evidence` ekle.
7. API-Football kadro ve transfer importer'larına kanıt/güven puanı ekle.
8. `collection_queue` için resumable worker geliştir.
9. Wikipedia kaynak/atıf manifesti export et.
10. Supabase'e idempotent `publish-supabase` komutu ekle.
11. Aynı isimli oyuncular için ambiguity raporu üret.
12. Gerçek import sonrasında 5.000+ hedefini ve oynanabilir çift sayısını raporla.
