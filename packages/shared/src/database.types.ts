export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievement_definitions: {
        Row: { accent: string; active: boolean; code: string; description_en: string; description_tr: string; glyph: string; reward_title_en: string; reward_title_tr: string; sort_order: number; target: number; title_en: string; title_tr: string }
        Insert: { accent: string; active?: boolean; code: string; description_en: string; description_tr: string; glyph: string; reward_title_en: string; reward_title_tr: string; sort_order: number; target: number; title_en: string; title_tr: string }
        Update: { accent?: string; active?: boolean; code?: string; description_en?: string; description_tr?: string; glyph?: string; reward_title_en?: string; reward_title_tr?: string; sort_order?: number; target?: number; title_en?: string; title_tr?: string }
        Relationships: []
      }
      achievement_derby_pairs: {
        Row: { club_a_external: string; club_b_external: string; label: string }
        Insert: { club_a_external: string; club_b_external: string; label: string }
        Update: { club_a_external?: string; club_b_external?: string; label?: string }
        Relationships: []
      }
      club_pair_players: {
        Row: {
          club_high_id: string
          club_low_id: string
          football_data_version_id: string
          is_active: boolean
          player_id: string
        }
        Insert: {
          club_high_id: string
          club_low_id: string
          football_data_version_id: string
          is_active?: boolean
          player_id: string
        }
        Update: {
          club_high_id?: string
          club_low_id?: string
          football_data_version_id?: string
          is_active?: boolean
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_pair_players_club_high_id_fkey"
            columns: ["club_high_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_pair_players_club_low_id_fkey"
            columns: ["club_low_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_pair_players_football_data_version_id_fkey"
            columns: ["football_data_version_id"]
            isOneToOne: false
            referencedRelation: "football_data_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_pair_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      club_pair_stats: {
        Row: {
          club_high_id: string
          club_low_id: string
          football_data_version_id: string
          valid_player_count: number
        }
        Insert: {
          club_high_id: string
          club_low_id: string
          football_data_version_id: string
          valid_player_count: number
        }
        Update: {
          club_high_id?: string
          club_low_id?: string
          football_data_version_id?: string
          valid_player_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_pair_stats_club_high_id_fkey"
            columns: ["club_high_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_pair_stats_club_low_id_fkey"
            columns: ["club_low_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_pair_stats_football_data_version_id_fkey"
            columns: ["football_data_version_id"]
            isOneToOne: false
            referencedRelation: "football_data_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          active: boolean
          country: string | null
          created_at: string
          external_id: string
          id: string
          league: string | null
          name: string
        }
        Insert: {
          active?: boolean
          country?: string | null
          created_at?: string
          external_id: string
          id?: string
          league?: string | null
          name: string
        }
        Update: {
          active?: boolean
          country?: string | null
          created_at?: string
          external_id?: string
          id?: string
          league?: string | null
          name?: string
        }
        Relationships: []
      }
      football_data_import_runs: {
        Row: {
          aliases_inserted: number
          clubs_inserted: number
          errors: Json | null
          export_hash: string
          finished_at: string | null
          id: string
          memberships_inserted: number
          pairs_generated: number
          players_inserted: number
          source: string
          started_at: string
          status: string
        }
        Insert: {
          aliases_inserted?: number
          clubs_inserted?: number
          errors?: Json | null
          export_hash: string
          finished_at?: string | null
          id?: string
          memberships_inserted?: number
          pairs_generated?: number
          players_inserted?: number
          source: string
          started_at?: string
          status: string
        }
        Update: {
          aliases_inserted?: number
          clubs_inserted?: number
          errors?: Json | null
          export_hash?: string
          finished_at?: string | null
          id?: string
          memberships_inserted?: number
          pairs_generated?: number
          players_inserted?: number
          source?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      football_data_versions: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          published_at: string | null
          published_by: string | null
          source_export_hash: string
          status: Database["public"]["Enums"]["data_version_status"]
          version_number: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          source_export_hash: string
          status?: Database["public"]["Enums"]["data_version_status"]
          version_number: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          source_export_hash?: string
          status?: Database["public"]["Enums"]["data_version_status"]
          version_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "football_data_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          requester_id: string
          status: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          requester_id: string
          status: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          requester_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          finished_at: string | null
          football_data_version_id: string
          id: string
          mode: string
          player_one_id: string
          player_two_id: string | null
          room_key: string | null
          score_one: number
          score_two: number
          status: Database["public"]["Enums"]["match_status"]
          winner_id: string | null
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          football_data_version_id: string
          id?: string
          mode: string
          player_one_id: string
          player_two_id?: string | null
          room_key?: string | null
          score_one?: number
          score_two?: number
          status?: Database["public"]["Enums"]["match_status"]
          winner_id?: string | null
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          football_data_version_id?: string
          id?: string
          mode?: string
          player_one_id?: string
          player_two_id?: string | null
          room_key?: string | null
          score_one?: number
          score_two?: number
          status?: Database["public"]["Enums"]["match_status"]
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_football_data_version_id_fkey"
            columns: ["football_data_version_id"]
            isOneToOne: false
            referencedRelation: "football_data_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_player_one_id_fkey"
            columns: ["player_one_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_player_two_id_fkey"
            columns: ["player_two_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_aliases: {
        Row: {
          alias: string
          id: string
          is_accepted_answer: boolean
          normalized_alias: string
          player_id: string
          source: string
        }
        Insert: {
          alias: string
          id?: string
          is_accepted_answer?: boolean
          normalized_alias: string
          player_id: string
          source?: string
        }
        Update: {
          alias?: string
          id?: string
          is_accepted_answer?: boolean
          normalized_alias?: string
          player_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_aliases_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_club_contracts: {
        Row: {
          club_id: string
          contract_type: string
          ends_on: string | null
          id: string
          player_id: string
          source: string
          squad_level: string
          starts_on: string | null
        }
        Insert: {
          club_id: string
          contract_type?: string
          ends_on?: string | null
          id?: string
          player_id: string
          source?: string
          squad_level?: string
          starts_on?: string | null
        }
        Update: {
          club_id?: string
          contract_type?: string
          ends_on?: string | null
          id?: string
          player_id?: string
          source?: string
          squad_level?: string
          starts_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_club_contracts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_club_contracts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          external_id: string
          game_name: string
          id: string
          normalized_game_name: string
        }
        Insert: {
          created_at?: string
          external_id: string
          game_name: string
          id?: string
          normalized_game_name: string
        }
        Update: {
          created_at?: string
          external_id?: string
          game_name?: string
          id?: string
          normalized_game_name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          blitz_trophies: number
          coins: number
          dollars: number
          created_at: string
          display_name: string
          id: string
          player_code: string
          preferred_locale: string | null
          ranked_trophies: number
          tutorial_completed_at: string | null
          trophies: number
        }
        Insert: {
          avatar_url?: string | null
          blitz_trophies?: number
          coins?: number
          dollars?: number
          created_at?: string
          display_name?: string
          id: string
          player_code: string
          preferred_locale?: string | null
          ranked_trophies?: number
          tutorial_completed_at?: string | null
          trophies?: number
        }
        Update: {
          avatar_url?: string | null
          blitz_trophies?: number
          coins?: number
          dollars?: number
          created_at?: string
          display_name?: string
          id?: string
          player_code?: string
          preferred_locale?: string | null
          ranked_trophies?: number
          tutorial_completed_at?: string | null
          trophies?: number
        }
        Relationships: []
      }
      player_achievements: {
        Row: { achievement_code: string; player_id: string; progress: number; unlocked_at: string | null; updated_at: string }
        Insert: { achievement_code: string; player_id: string; progress?: number; unlocked_at?: string | null; updated_at?: string }
        Update: { achievement_code?: string; player_id?: string; progress?: number; unlocked_at?: string | null; updated_at?: string }
        Relationships: [
          { foreignKeyName: "player_achievements_achievement_code_fkey"; columns: ["achievement_code"]; isOneToOne: false; referencedRelation: "achievement_definitions"; referencedColumns: ["code"] },
          { foreignKeyName: "player_achievements_player_id_fkey"; columns: ["player_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      player_achievement_showcase: {
        Row: { achievement_code: string; player_id: string; slot: number; updated_at: string }
        Insert: { achievement_code: string; player_id: string; slot: number; updated_at?: string }
        Update: { achievement_code?: string; player_id?: string; slot?: number; updated_at?: string }
        Relationships: [
          { foreignKeyName: "player_achievement_showcase_player_id_achievement_code_fkey"; columns: ["player_id", "achievement_code"]; isOneToOne: false; referencedRelation: "player_achievements"; referencedColumns: ["player_id", "achievement_code"] },
        ]
      }
      result_reports: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          match_id: string
          reason_code: string
          reporter_id: string
          round_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          match_id: string
          reason_code: string
          reporter_id: string
          round_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          match_id?: string
          reason_code?: string
          reporter_id?: string
          round_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "result_reports_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_reports_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      rematch_offers: {
        Row: { id: string; room_key: string; requester_id: string; recipient_id: string; next_match_key: string; status: string; created_at: string; expires_at: string }
        Insert: { id?: string; room_key: string; requester_id: string; recipient_id: string; next_match_key: string; status?: string; created_at?: string; expires_at?: string }
        Update: { status?: string }
        Relationships: []
      }
      rounds: {
        Row: {
          club_high_id: string
          club_low_id: string
          finished_at: string | null
          id: string
          match_id: string
          round_number: number
          started_at: string
          sudden_death: boolean
          winner_id: string | null
        }
        Insert: {
          club_high_id: string
          club_low_id: string
          finished_at?: string | null
          id?: string
          match_id: string
          round_number: number
          started_at?: string
          sudden_death?: boolean
          winner_id?: string | null
        }
        Update: {
          club_high_id?: string
          club_low_id?: string
          finished_at?: string | null
          id?: string
          match_id?: string
          round_number?: number
          started_at?: string
          sudden_death?: boolean
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rounds_club_high_id_fkey"
            columns: ["club_high_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_club_low_id_fkey"
            columns: ["club_low_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          client_command_id: string
          id: string
          is_correct: boolean
          last_second: boolean
          normalized_answer: string
          player_id: string
          raw_answer: string
          received_at: string
          round_id: string
          submission_sequence: number
        }
        Insert: {
          client_command_id: string
          id?: string
          is_correct: boolean
          last_second?: boolean
          normalized_answer: string
          player_id: string
          raw_answer: string
          received_at?: string
          round_id: string
          submission_sequence: number
        }
        Update: {
          client_command_id?: string
          id?: string
          is_correct?: boolean
          last_second?: boolean
          normalized_answer?: string
          player_id?: string
          raw_answer?: string
          received_at?: string
          round_id?: string
          submission_sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "submissions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      monetization_status: {
        Args: Record<PropertyKey, never>
        Returns: {
          ads_removed: boolean
          expires_at: string | null
          source: string | null
        }[]
      }
      album_mine: {
        Args: Record<PropertyKey, never>
        Returns: {
          external_id: string
          first_unlocked_at: string
          football_player_id: string
          game_name: string
          last_unlocked_at: string
          unlock_count: number
        }[]
      }
      mastery_mine: {
        Args: { p_limit?: number }
        Returns: {
          attempt_count: number
          club_external_id: string
          club_name: string
          correct_count: number
          hit_rate: number
        }[]
      }
      player_public_card: {
        Args: { p_player_id: string }
        Returns: Json
      }
      player_profile_stats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      weekly_theme: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      cosmetics_equip: { Args: { p_item_id: string }; Returns: undefined }
      cosmetics_purchase: { Args: { p_item_id: string }; Returns: number }
      cosmetics_mine: {
        Args: Record<PropertyKey, never>
        Returns: {
          accent: string
          equipped: boolean
          glyph: string | null
          is_premium: boolean
          item_id: string
          kind: string
          name: string
          owned: boolean
          price_coins: number
          price_dollars: number
        }[]
      }
      emotes_mine: {
        Args: Record<PropertyKey, never>
        Returns: { glyph: string; is_premium: boolean; item_id: string; name: string }[]
      }
      player_owns_emote: { Args: { p_emote_id: string; p_player_id: string }; Returns: boolean }
      event_current: { Args: Record<PropertyKey, never>; Returns: Json }
      event_leagues: {
        Args: Record<PropertyKey, never>
        Returns: { active_club_count: number; club_count: number; league: string }[]
      }
      event_live_scope: { Args: Record<PropertyKey, never>; Returns: Json }
      admin_event_list: {
        Args: Record<PropertyKey, never>
        Returns: {
          accent: string
          club_count: number
          ends_at: string | null
          id: string
          league: string
          starts_at: string | null
          status: string
          title_en: string
          title_tr: string
          updated_at: string
        }[]
      }
      admin_event_upsert: {
        Args: {
          p_accent?: string
          p_id?: string
          p_league?: string
          p_title_en?: string
          p_title_tr?: string
        }
        Returns: string
      }
      admin_event_go_live: { Args: { p_id: string }; Returns: string }
      admin_event_end: { Args: { p_id: string }; Returns: string }
      achievements_mine: { Args: Record<PropertyKey, never>; Returns: Json }
      achievements_set_showcase: { Args: { p_codes: string[] }; Returns: Json }
      quests_claim: { Args: { p_quest_id: string }; Returns: number }
      quests_mine: {
        Args: Record<PropertyKey, never>
        Returns: {
          claimed: boolean
          completed: boolean
          metric: string
          progress: number
          quest_day: string
          quest_id: string
          reward_coins: number
          target_count: number
        }[]
      }
      get_player_chat_style: { Args: { p_player_id: string }; Returns: string }
      match_persist_finish: {
        Args: {
          p_final_scores: Json
          p_match_winner: string
          p_room_key: string
        }
        Returns: string
      }
      match_persist_round: {
        Args: {
          p_club_a_external: string
          p_club_b_external: string
          p_is_sudden_death: boolean
          p_room_key: string
          p_round_ordinal: number
          p_round_submissions: Json
          p_round_winner: string | null
          p_scores: Json
        }
        Returns: string
      }
      match_persist_start: {
        Args: {
          p_match_mode?: string
          p_player_one: string
          p_player_two: string
          p_room_key: string
          p_version_id: string
        }
        Returns: string
      }
      publish_football_data: {
        Args: { data_version: string; export_hash: string; payload: Json }
        Returns: string
      }
      social_list_friends: {
        Args: Record<PropertyKey, never>
        Returns: {
          created_at: string
          direction: string
          display_name: string
          friend_id: string
          player_code: string
          status: string
          trophies: number
        }[]
      }
      social_request_friend: {
        Args: { p_player_code: string }
        Returns: string
      }
      social_respond_friend: {
        Args: { p_accept: boolean; p_requester_id: string }
        Returns: string
      }
      social_set_presence: { Args: { p_state: string }; Returns: undefined }
      social_invite_friend: { Args: { p_friend_id: string; p_room_key: string }; Returns: string }
      social_respond_invite: { Args: { p_accept: boolean; p_invite_id: string }; Returns: string }
      social_remove_friend: { Args: { p_friend_id: string }; Returns: undefined }
      social_block_player: { Args: { p_player_id: string }; Returns: undefined }
      social_recent_opponents: { Args: Record<PropertyKey, never>; Returns: { display_name: string; last_played_at: string; player_code: string; player_id: string }[] }
      social_friend_presence: { Args: Record<PropertyKey, never>; Returns: { last_seen_at: string; player_id: string; state: string }[] }
      social_pending_invites: { Args: Record<PropertyKey, never>; Returns: { expires_at: string; invite_id: string; room_key: string; sender_id: string; sender_name: string; status: string }[] }
      competition_my_history: {
        Args: Record<PropertyKey, never>
        Returns: { finished_at: string; match_id: string; mode: string; opponent_name: string; outcome: string; score_against: number; score_for: number }[]
      }
      competition_leaderboard: {
        Args: Record<PropertyKey, never>
        Returns: { display_name: string; losses: number; player_code: string; rank: number; trophies: number; wins: number }[]
      }
      competition_nearby: { Args: Record<PropertyKey, never>; Returns: { display_name: string; is_me: boolean; player_code: string; rank: number; tier: string; trophies: number }[] }
      competition_blitz_nearby: { Args: Record<PropertyKey, never>; Returns: { blitz_trophies: number; display_name: string; is_me: boolean; player_code: string; rank: number }[] }
      competition_quick_nearby: { Args: Record<PropertyKey, never>; Returns: { display_name: string; is_me: boolean; player_code: string; rank: number; trophies: number }[] }
      competition_ranked_nearby: { Args: Record<PropertyKey, never>; Returns: { display_name: string; is_me: boolean; player_code: string; rank: number; ranked_trophies: number }[] }
      ranked_progress: { Args: Record<PropertyKey, never>; Returns: { completed_quick_matches: number; required_quick_matches: number; unlocked: boolean } }
      competition_claim_season_reward: { Args: { p_season_id: string }; Returns: string }
      submit_result_report: {
        Args: {
          p_detail?: string | null
          p_reason_code?: string
          p_room_key: string
          p_round_ordinal?: number | null
        }
        Returns: string
      }
    }
    Enums: {
      data_version_status:
        | "DRAFT"
        | "STAGING"
        | "ACTIVE"
        | "ROLLED_BACK"
        | "ARCHIVED"
      match_status: "WAITING" | "ACTIVE" | "FINISHED" | "CANCELLED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      data_version_status: [
        "DRAFT",
        "STAGING",
        "ACTIVE",
        "ROLLED_BACK",
        "ARCHIVED",
      ],
      match_status: ["WAITING", "ACTIVE", "FINISHED", "CANCELLED"],
    },
  },
} as const
