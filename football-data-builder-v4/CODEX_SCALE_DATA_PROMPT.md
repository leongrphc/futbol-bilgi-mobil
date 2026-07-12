Ekli Football Data Builder v4 projesini incele. Amaç, 131 kulüp için 1990–2026 döneminde en az 5.000 gerçek futbolcuya ulaşan sürdürülebilir veri toplama hattını tamamlamaktır.

Öncelikler:

1. Mevcut Wikipedia Action API kategori ve infobox importer'ını uçtan uca test et.
2. Kulüp kategori çözüm sonuçlarını kalıcı ve manuel düzeltilebilir yap.
3. Wikidata importuna source_evidence kayıtları ekle.
4. API-Football kadro ve transfer importlarına source_evidence/confidence ekle.
5. collection_queue tablosu için gerçek worker komutu geliştir.
6. Aynı oyuncunun QID, API ID ve Wikipedia page ID üzerinden güvenli merge edilmesini tamamla.
7. Belirsiz aynı isimli oyuncuları hiçbir zaman otomatik birleştirme.
8. Import işlemlerini idempotent tut.
9. 5000 oyuncu hedefini sahte/demo veriyle doldurma.
10. Transfermarkt, Soccerway veya otomatik erişimi yasaklayan sitelere scraper yazma.
11. README'deki komutları gerçek ortamda çalıştır ve sonuç sayılarını collection_report.json'a yaz.
12. Eksik kulüp kategorilerini raporla; yanlış kategori seçimini otomatik kabul etme.
13. Wikipedia atıf/source manifest exportu ekle.
14. Supabase'e idempotent publish komutu ekle.
15. Tüm testleri çalıştır ve hataları düzelt.

İlk teslimatta:

- Çalışan kategori importer
- En az priority=1 kulüpler için gerçek import sonucu
- Kaynak bazlı oyuncu sayıları
- Duplicate/ambiguous merge raporu
- Oynanabilir takım çifti sayısı
- Supabase publish dry-run
- Güncellenmiş testler ve README

Sadece plan yazma; kodu değiştir, test et ve çalıştırma sonuçlarını açıkça raporla.
