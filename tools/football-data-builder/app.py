from __future__ import annotations

import json
import os
from pathlib import Path

import pandas as pd
import streamlit as st

from src.db import connect, init_db, rebuild_pairs, rebuild_pair_stats
from src.normalize import normalize_name
from src.service import approve_cross_club_candidates, quality_report
from src.current_sync import freshness_report
from src.collector import collection_report
from src.validate import validate_answer

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("FOOTBALL_DB_PATH", ROOT / "data" / "football.db"))
conn = connect(DB_PATH)
init_db(conn)
rebuild_pair_stats(conn)

st.set_page_config(page_title="Football Link Data Builder", page_icon="⚽", layout="wide")
st.title("⚽ Football Link — Veri Builder v4")
st.caption("190 kulüp; Wikidata + Wikipedia API + güncel kadro senkronizasyonu")

page = st.sidebar.radio(
    "Bölüm",
    [
        "Özet",
        "Kulüpler",
        "Aday Onayı",
        "Oyuncular ve Alias",
        "Takım Çiftleri",
        "Cevap Testi",
        "Güncellik",
        "Kaynak Kanıtları",
        "İçe Aktarma Logları",
    ],
)


def rows_df(rows) -> pd.DataFrame:
    return pd.DataFrame([dict(row) for row in rows])


if page == "Özet":
    report = quality_report(conn)
    summary = report["summary"]
    cols = st.columns(7)
    metrics = [
        ("Aktif kulüp", summary["clubs"]),
        ("QID çözülmüş", summary["resolved_clubs"]),
        ("Oyuncu", summary["players"]),
        ("Doğrulanmış oyuncu", summary["verified_players"]),
        ("Oynanabilir çift", summary["playable_pairs"]),
        ("3+ cevaplı çift", summary["good_pairs"]),
        ("Güncel oyuncu", int(conn.execute("SELECT COUNT(DISTINCT player_id) FROM memberships WHERE is_current=1 AND status='VERIFIED'").fetchone()[0])),
    ]
    for col, (label, value) in zip(cols, metrics):
        col.metric(label, value)

    st.subheader("Lig bazında kulüp durumu")
    league_rows = conn.execute(
        """
        SELECT league,
               COUNT(*) club_count,
               SUM(CASE WHEN wikidata_qid IS NOT NULL THEN 1 ELSE 0 END) wikidata_resolved,
               SUM(CASE WHEN api_football_id IS NOT NULL THEN 1 ELSE 0 END) api_resolved,
               SUM(CASE WHEN last_imported_at IS NOT NULL THEN 1 ELSE 0 END) imported_count
        FROM clubs
        WHERE active=1
        GROUP BY league
        ORDER BY league
        """
    ).fetchall()
    st.dataframe(rows_df(league_rows), use_container_width=True, hide_index=True)

    col1, col2 = st.columns(2)
    with col1:
        st.subheader("Çift kapsama durumu")
        coverage = conn.execute(
            """
            SELECT coverage_status, COUNT(*) pair_count
            FROM club_pair_stats
            GROUP BY coverage_status
            ORDER BY pair_count DESC
            """
        ).fetchall()
        st.dataframe(rows_df(coverage), use_container_width=True, hide_index=True)
    with col2:
        st.subheader("En güçlü 20 çift")
        strongest = conn.execute(
            """
            SELECT a.name club_a, b.name club_b, s.verified_player_count players
            FROM club_pair_stats s
            JOIN clubs a ON a.id=s.club_low_id
            JOIN clubs b ON b.id=s.club_high_id
            WHERE s.verified_player_count > 0
            ORDER BY s.verified_player_count DESC, club_a, club_b
            LIMIT 20
            """
        ).fetchall()
        st.dataframe(rows_df(strongest), use_container_width=True, hide_index=True)

    st.info(
        "Hızlı deneme için `python cli.py seed-demo --fresh && python cli.py apply-overrides`; "
        "gerçek veri için Wikidata geçmiş importu ve API-Football güncel kadro senkronizasyonunu çalıştırın."
    )

elif page == "Kulüpler":
    st.subheader("Aktif kulüpler")
    league_filter = st.selectbox(
        "Lig",
        ["Tümü"]
        + [
            row[0]
            for row in conn.execute(
                "SELECT DISTINCT league FROM clubs WHERE active=1 ORDER BY league"
            )
        ],
    )
    query = """
        SELECT id, pool, priority, name, country, league, wikidata_qid,
               qid_status, api_football_id, api_id_status, last_imported_at, active
        FROM clubs WHERE active=1
    """
    params: tuple = ()
    if league_filter != "Tümü":
        query += " AND league=?"
        params = (league_filter,)
    query += " ORDER BY priority, league, name"
    clubs_df = rows_df(conn.execute(query, params).fetchall())
    st.dataframe(clubs_df, use_container_width=True, hide_index=True)

    st.subheader("QID elle düzelt")
    club_options = {
        f"{row['name']} — {row['league']}": int(row["id"])
        for row in conn.execute("SELECT id, name, league FROM clubs ORDER BY name")
    }
    selected_label = st.selectbox("Kulüp", list(club_options))
    club_id = club_options[selected_label]
    club = conn.execute("SELECT * FROM clubs WHERE id=?", (club_id,)).fetchone()
    qid = st.text_input("Wikidata QID", value=club["wikidata_qid"] or "")
    search_term = st.text_input("Wikidata arama adı", value=club["wikidata_search"] or club["name"])
    c1, c2 = st.columns(2)
    if c1.button("Kulüp bilgisini kaydet"):
        cleaned_qid = qid.strip().upper() or None
        conn.execute(
            """
            UPDATE clubs
            SET wikidata_qid=?, wikidata_search=?,
                qid_status=CASE WHEN ? IS NULL THEN 'UNRESOLVED' ELSE 'RESOLVED' END,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=?
            """,
            (cleaned_qid, search_term.strip(), cleaned_qid, club_id),
        )
        conn.commit()
        st.success("Kaydedildi.")
        st.rerun()
    if c2.button("QID'yi temizle"):
        conn.execute(
            "UPDATE clubs SET wikidata_qid=NULL, qid_status='UNRESOLVED' WHERE id=?",
            (club_id,),
        )
        conn.commit()
        st.success("QID temizlendi.")
        st.rerun()

elif page == "Aday Onayı":
    st.subheader("İki veya daha fazla MVP kulübünde görünen adaylar")
    min_clubs = st.number_input("Minimum kulüp sayısı", min_value=2, max_value=10, value=2)
    status = st.selectbox("Üyelik durumu", ["IMPORTED", "VERIFIED", "REJECTED"])
    search = st.text_input("Oyuncu ara")

    query = """
        SELECT p.id player_id, p.game_name,
               COUNT(DISTINCT m.club_id) club_count,
               GROUP_CONCAT(DISTINCT c.name) clubs,
               SUM(CASE WHEN m.status='VERIFIED' THEN 1 ELSE 0 END) verified_memberships,
               SUM(CASE WHEN m.status='IMPORTED' THEN 1 ELSE 0 END) imported_memberships
        FROM players p
        JOIN memberships m ON m.player_id=p.id
        JOIN clubs c ON c.id=m.club_id
        WHERE m.status=?
    """
    params: list = [status]
    if search:
        query += " AND p.normalized_name LIKE ?"
        params.append(f"%{normalize_name(search)}%")
    query += " GROUP BY p.id, p.game_name HAVING COUNT(DISTINCT m.club_id)>=? ORDER BY club_count DESC, p.game_name LIMIT 1000"
    params.append(int(min_clubs))
    df = rows_df(conn.execute(query, params).fetchall())
    if df.empty:
        st.warning("Bu filtrede aday yok.")
    else:
        st.dataframe(df, use_container_width=True, hide_index=True)
        selected = st.multiselect("İşlem yapılacak player_id değerleri", df["player_id"].tolist())
        c1, c2, c3 = st.columns(3)
        if c1.button("Seçilen oyuncuları doğrula", disabled=not selected):
            marks = ",".join("?" for _ in selected)
            conn.execute(
                f"UPDATE players SET status='VERIFIED', updated_at=CURRENT_TIMESTAMP WHERE id IN ({marks})",
                selected,
            )
            conn.execute(
                f"UPDATE memberships SET status='VERIFIED', updated_at=CURRENT_TIMESTAMP WHERE player_id IN ({marks})",
                selected,
            )
            conn.commit()
            rebuild_pairs(conn)
            st.success("Seçilen oyuncular ve tüm üyelikleri doğrulandı.")
            st.rerun()
        if c2.button("Seçilen oyuncuları reddet", disabled=not selected):
            marks = ",".join("?" for _ in selected)
            conn.execute(
                f"UPDATE memberships SET status='REJECTED', updated_at=CURRENT_TIMESTAMP WHERE player_id IN ({marks})",
                selected,
            )
            conn.execute(
                f"UPDATE players SET status='REJECTED', updated_at=CURRENT_TIMESTAMP WHERE id IN ({marks})",
                selected,
            )
            conn.commit()
            rebuild_pairs(conn)
            st.success("Reddedildi.")
            st.rerun()
        if c3.button("Tüm çapraz kulüp adaylarını otomatik doğrula"):
            result = approve_cross_club_candidates(conn, min_clubs=int(min_clubs))
            rebuild_pairs(conn)
            st.success(f"{result['players']} oyuncu, {result['memberships']} üyelik doğrulandı.")
            st.rerun()

    st.divider()
    st.subheader("Tek üyelik bazında inceleme")
    club_filter_options = {"Tümü": None}
    club_filter_options.update(
        {
            row["name"]: int(row["id"])
            for row in conn.execute("SELECT id, name FROM clubs WHERE active=1 ORDER BY name")
        }
    )
    club_label = st.selectbox("Kulüp filtresi", list(club_filter_options), key="membership_club")
    membership_query = """
        SELECT m.id membership_id, p.id player_id, p.game_name, c.name club,
               m.start_date, m.end_date, m.membership_type, m.squad_level, m.status, m.source
        FROM memberships m
        JOIN players p ON p.id=m.player_id
        JOIN clubs c ON c.id=m.club_id
        WHERE m.status=?
    """
    membership_params: list = [status]
    if club_filter_options[club_label] is not None:
        membership_query += " AND c.id=?"
        membership_params.append(club_filter_options[club_label])
    membership_query += " ORDER BY c.name, p.game_name LIMIT 1000"
    membership_df = rows_df(conn.execute(membership_query, membership_params).fetchall())
    st.dataframe(membership_df, use_container_width=True, hide_index=True)

elif page == "Oyuncular ve Alias":
    search = st.text_input("Oyuncu ara")
    query = "SELECT id, game_name, normalized_name, status FROM players"
    params: tuple = ()
    if search:
        query += " WHERE normalized_name LIKE ?"
        params = (f"%{normalize_name(search)}%",)
    query += " ORDER BY game_name LIMIT 500"
    players = conn.execute(query, params).fetchall()
    if not players:
        st.warning("Oyuncu bulunamadı.")
    else:
        labels = {f"{row['game_name']} (#{row['id']})": int(row["id"]) for row in players}
        chosen = st.selectbox("Oyuncu", list(labels))
        player_id = labels[chosen]
        player = conn.execute("SELECT * FROM players WHERE id=?", (player_id,)).fetchone()
        name = st.text_input("Ana oyun adı", value=player["game_name"])
        c1, c2 = st.columns(2)
        if c1.button("Ana adı kaydet"):
            conn.execute(
                "UPDATE players SET game_name=?, normalized_name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (name.strip(), normalize_name(name), player_id),
            )
            conn.commit()
            st.success("Kaydedildi.")
            st.rerun()
        if c2.button("Oyuncuyu doğrula"):
            conn.execute(
                "UPDATE players SET status='VERIFIED', updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (player_id,),
            )
            conn.execute(
                "UPDATE memberships SET status='VERIFIED', updated_at=CURRENT_TIMESTAMP WHERE player_id=?",
                (player_id,),
            )
            conn.commit()
            rebuild_pairs(conn)
            st.success("Oyuncu ve üyelikleri doğrulandı.")
            st.rerun()

        aliases = conn.execute(
            "SELECT id, alias, normalized_alias, accepted, source FROM player_aliases WHERE player_id=? ORDER BY alias",
            (player_id,),
        ).fetchall()
        alias_df = rows_df(aliases)
        st.dataframe(alias_df, use_container_width=True, hide_index=True)
        alias_ids = st.multiselect(
            "Kabul durumu değiştirilecek alias ID'leri",
            alias_df["id"].tolist() if not alias_df.empty else [],
        )
        a1, a2 = st.columns(2)
        if a1.button("Seçilen alias'ları kabul et", disabled=not alias_ids):
            marks = ",".join("?" for _ in alias_ids)
            conn.execute(f"UPDATE player_aliases SET accepted=1 WHERE id IN ({marks})", alias_ids)
            conn.commit()
            st.success("Alias'lar kabul edildi.")
            st.rerun()
        if a2.button("Seçilen alias'ları kapat", disabled=not alias_ids):
            marks = ",".join("?" for _ in alias_ids)
            conn.execute(f"UPDATE player_aliases SET accepted=0 WHERE id IN ({marks})", alias_ids)
            conn.commit()
            st.success("Alias'lar kapatıldı.")
            st.rerun()

        new_alias = st.text_input("Yeni kabul edilen alias")
        if st.button("Alias ekle", disabled=not new_alias.strip()):
            conn.execute(
                """
                INSERT INTO player_aliases
                (player_id, alias, normalized_alias, accepted, source)
                VALUES (?, ?, ?, 1, 'MANUAL')
                ON CONFLICT(player_id, normalized_alias) DO UPDATE SET
                    alias=excluded.alias, accepted=1, source='MANUAL'
                """,
                (player_id, new_alias.strip(), normalize_name(new_alias)),
            )
            conn.commit()
            st.success("Alias eklendi.")
            st.rerun()

elif page == "Takım Çiftleri":
    c1, c2 = st.columns(2)
    if c1.button("Ortak oyuncu matrisini yenile"):
        count = rebuild_pairs(conn)
        st.success(f"{count} kayıt üretildi.")
    if c2.button("Kapsama tablosunu yenile"):
        count = rebuild_pair_stats(conn)
        st.success(f"{count} takım çifti analiz edildi.")

    st.subheader("Çift kapsama listesi")
    status_filter = st.selectbox(
        "Kapsama durumu", ["Tümü", "GOOD", "PLAYABLE", "NEEDS_REVIEW", "EMPTY"]
    )
    pair_query = """
        SELECT a.name club_a, b.name club_b,
               s.verified_player_count, s.candidate_player_count, s.coverage_status
        FROM club_pair_stats s
        JOIN clubs a ON a.id=s.club_low_id
        JOIN clubs b ON b.id=s.club_high_id
    """
    pair_params: tuple = ()
    if status_filter != "Tümü":
        pair_query += " WHERE s.coverage_status=?"
        pair_params = (status_filter,)
    pair_query += " ORDER BY s.verified_player_count DESC, s.candidate_player_count DESC, club_a, club_b"
    st.dataframe(rows_df(conn.execute(pair_query, pair_params).fetchall()), use_container_width=True, hide_index=True)

    st.subheader("Bir takım çiftini incele")
    clubs = conn.execute("SELECT id, name FROM clubs WHERE active=1 ORDER BY name").fetchall()
    options = {row["name"]: int(row["id"]) for row in clubs}
    col1, col2 = st.columns(2)
    names = list(options)
    a_name = col1.selectbox("Takım A", names, index=0)
    b_name = col2.selectbox("Takım B", names, index=min(1, len(names) - 1))
    if a_name == b_name:
        st.warning("İki farklı takım seçin.")
    else:
        a, b = sorted((options[a_name], options[b_name]))
        rows = conn.execute(
            """
            SELECT p.game_name, p.normalized_name,
                   GROUP_CONCAT(CASE WHEN pa.accepted=1 THEN pa.alias END) accepted_aliases
            FROM club_pair_players cpp
            JOIN players p ON p.id=cpp.player_id
            LEFT JOIN player_aliases pa ON pa.player_id=p.id
            WHERE cpp.club_low_id=? AND cpp.club_high_id=?
            GROUP BY p.id, p.game_name, p.normalized_name
            ORDER BY p.game_name
            """,
            (a, b),
        ).fetchall()
        st.markdown(f"### {a_name} × {b_name}")
        if rows:
            st.dataframe(rows_df(rows), use_container_width=True, hide_index=True)
        else:
            st.warning("Doğrulanmış ortak oyuncu yok.")

elif page == "Cevap Testi":
    st.subheader("Oyundaki exact-match doğrulamasını dene")
    clubs = conn.execute("SELECT id, name FROM clubs WHERE active=1 ORDER BY name").fetchall()
    options = {row["name"]: int(row["id"]) for row in clubs}
    names = list(options)
    col1, col2 = st.columns(2)
    a_name = col1.selectbox("Takım A", names, index=0, key="test_a")
    b_name = col2.selectbox("Takım B", names, index=min(1, len(names) - 1), key="test_b")
    answer = st.text_input("Oyuncu cevabı", placeholder="Örn. Mesut Ozıl")
    if st.button("Cevabı doğrula", disabled=not answer.strip() or a_name == b_name):
        result = validate_answer(conn, options[a_name], options[b_name], answer)
        if result.is_correct:
            st.success(f"Doğru: {result.player_name} — {result.matched_by}")
        else:
            st.error(f"Yanlış: {result.reason}")
        st.json(result.__dict__)

elif page == "Güncellik":
    st.subheader("Veri kapsamı ve güncel kadrolar")
    report = freshness_report(conn)
    cols = st.columns(6)
    items = [
        ("Kulüp", report["summary"]["clubs"]),
        ("Oyuncu", report["summary"]["players"]),
        ("Doğrulanmış", report["summary"]["verified_players"]),
        ("Güncel kadro oyuncusu", report["summary"]["current_players"]),
        ("Üyelik", report["summary"]["memberships"]),
        ("Oynanabilir çift", report["summary"]["playable_pairs"]),
    ]
    for col, (label, value) in zip(cols, items):
        col.metric(label, value)
    st.dataframe(pd.DataFrame(report["clubs"]), use_container_width=True, hide_index=True)
    st.info(
        "Güncel kadrolar için terminalde `resolve-api-teams` ve ardından "
        "`sync-current-squads` komutlarını çalıştırın. Ücretsiz API kotası nedeniyle "
        "işlemler istek bütçesi dolunca sonraki çalıştırmada devam eder."
    )

elif page == "Kaynak Kanıtları":
    report = collection_report(conn)
    summary = report["summary"]
    cols = st.columns(6)
    for col, (label, value) in zip(
        cols,
        [
            ("Oyuncu", summary["players"]),
            ("Doğrulanmış", summary["verified_players"]),
            ("Üyelik", summary["memberships"]),
            ("Kanıt", summary["evidence"]),
            ("Oynanabilir çift", summary["playable_pairs"]),
            ("3+ cevaplı çift", summary["strong_pairs"]),
        ],
    ):
        col.metric(label, value)

    st.subheader("Kaynak bazında kapsam")
    st.dataframe(pd.DataFrame(report["sources"]), use_container_width=True, hide_index=True)

    st.subheader("Son kaynak kanıtları")
    evidence = conn.execute(
        """
        SELECT se.collected_at, p.game_name, c.name club, se.source,
               se.evidence_type, se.confidence, se.source_revision, se.source_url
        FROM source_evidence se
        JOIN players p ON p.id=se.player_id
        LEFT JOIN clubs c ON c.id=se.club_id
        ORDER BY se.collected_at DESC
        LIMIT 1000
        """
    ).fetchall()
    st.dataframe(rows_df(evidence), use_container_width=True, hide_index=True)

    missing = report["clubs_without_wikipedia_category"]
    if missing:
        st.subheader("Wikipedia kategorisi çözülemeyen kulüpler")
        st.dataframe(pd.DataFrame(missing), use_container_width=True, hide_index=True)

elif page == "İçe Aktarma Logları":
    st.subheader("Son Wikidata içe aktarmaları")
    runs = conn.execute(
        """
        SELECT r.id, c.name club, r.source, r.started_at, r.finished_at,
               r.status, r.imported_count, r.skipped_count, r.error_message
        FROM import_runs r
        LEFT JOIN clubs c ON c.id=r.club_id
        ORDER BY r.id DESC
        LIMIT 200
        """
    ).fetchall()
    st.dataframe(rows_df(runs), use_container_width=True, hide_index=True)

    st.subheader("İçe aktarma hataları")
    errors = conn.execute(
        """
        SELECT e.id, e.import_run_id, c.name club, e.error_type, e.message, e.created_at
        FROM import_errors e
        LEFT JOIN clubs c ON c.id=e.club_id
        ORDER BY e.id DESC
        LIMIT 200
        """
    ).fetchall()
    st.dataframe(rows_df(errors), use_container_width=True, hide_index=True)

    st.subheader("Kalite raporunu görüntüle")
    st.json(quality_report(conn))
