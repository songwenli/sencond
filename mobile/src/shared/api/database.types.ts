// 自动生成，请勿手改。数据库结构变化后运行：npm run gen:types
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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      blocks: {
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
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          muted: boolean
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          muted?: boolean
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          muted?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          last_message_at: string | null
          match_id: string | null
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          last_message_at?: string | null
          match_id?: string | null
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["conversation_kind"]
          last_message_at?: string | null
          match_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          allow_user_ids: string[]
          description: string | null
          enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          allow_user_ids?: string[]
          description?: string | null
          enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          allow_user_ids?: string[]
          description?: string | null
          enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          intent_id: string | null
          joined_at: string
          left_at: string | null
          role: Database["public"]["Enums"]["group_role"]
          user_id: string
        }
        Insert: {
          group_id: string
          intent_id?: string | null
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["group_role"]
          user_id: string
        }
        Update: {
          group_id?: string
          intent_id?: string | null
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["group_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          capacity: number
          city: string | null
          country_code: string | null
          created_at: string
          expires_at: string
          id: string
          location_text: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["group_status"]
          title: string
          title_i18n: Json
          updated_at: string
        }
        Insert: {
          capacity?: number
          city?: string | null
          country_code?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          location_text?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["group_status"]
          title: string
          title_i18n?: Json
          updated_at?: string
        }
        Update: {
          capacity?: number
          city?: string | null
          country_code?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          location_text?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["group_status"]
          title?: string
          title_i18n?: Json
          updated_at?: string
        }
        Relationships: []
      }
      intent_embeddings: {
        Row: {
          created_at: string
          embedding: string
          facet: Database["public"]["Enums"]["embedding_facet"]
          intent_id: string
          model: string
        }
        Insert: {
          created_at?: string
          embedding: string
          facet: Database["public"]["Enums"]["embedding_facet"]
          intent_id: string
          model: string
        }
        Update: {
          created_at?: string
          embedding?: string
          facet?: Database["public"]["Enums"]["embedding_facet"]
          intent_id?: string
          model?: string
        }
        Relationships: [
          {
            foreignKeyName: "intent_embeddings_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "intents"
            referencedColumns: ["id"]
          },
        ]
      }
      intent_translations: {
        Row: {
          body: string
          created_at: string
          intent_id: string
          lang: string
        }
        Insert: {
          body: string
          created_at?: string
          intent_id: string
          lang: string
        }
        Update: {
          body?: string
          created_at?: string
          intent_id?: string
          lang?: string
        }
        Relationships: [
          {
            foreignKeyName: "intent_translations_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "intents"
            referencedColumns: ["id"]
          },
        ]
      }
      intents: {
        Row: {
          allow_group: boolean
          body: string
          city: string | null
          country_code: string | null
          created_at: string
          derived_text: string | null
          expires_at: string
          id: string
          intent_type: string | null
          is_remote: boolean | null
          kind: Database["public"]["Enums"]["intent_kind"]
          lang: string | null
          last_matched_at: string | null
          moderation: Database["public"]["Enums"]["moderation_status"]
          owner_id: string
          quality_hint: Json | null
          quality_score: number | null
          slots: Json
          status: Database["public"]["Enums"]["intent_status"]
          updated_at: string
        }
        Insert: {
          allow_group?: boolean
          body: string
          city?: string | null
          country_code?: string | null
          created_at?: string
          derived_text?: string | null
          expires_at?: string
          id?: string
          intent_type?: string | null
          is_remote?: boolean | null
          kind: Database["public"]["Enums"]["intent_kind"]
          lang?: string | null
          last_matched_at?: string | null
          moderation?: Database["public"]["Enums"]["moderation_status"]
          owner_id: string
          quality_hint?: Json | null
          quality_score?: number | null
          slots?: Json
          status?: Database["public"]["Enums"]["intent_status"]
          updated_at?: string
        }
        Update: {
          allow_group?: boolean
          body?: string
          city?: string | null
          country_code?: string | null
          created_at?: string
          derived_text?: string | null
          expires_at?: string
          id?: string
          intent_type?: string | null
          is_remote?: boolean | null
          kind?: Database["public"]["Enums"]["intent_kind"]
          lang?: string | null
          last_matched_at?: string | null
          moderation?: Database["public"]["Enums"]["moderation_status"]
          owner_id?: string
          quality_hint?: Json | null
          quality_score?: number | null
          slots?: Json
          status?: Database["public"]["Enums"]["intent_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intents_legacy: {
        Row: {
          created_at: string | null
          derived_text: string | null
          embedding_version: string | null
          id: number
          intent_type: string | null
          kind: string
          need_vec: string | null
          owner_id: string
          quality: string | null
          self_vec: string | null
          slots: Json | null
          text: string
        }
        Insert: {
          created_at?: string | null
          derived_text?: string | null
          embedding_version?: string | null
          id?: number
          intent_type?: string | null
          kind: string
          need_vec?: string | null
          owner_id: string
          quality?: string | null
          self_vec?: string | null
          slots?: Json | null
          text: string
        }
        Update: {
          created_at?: string | null
          derived_text?: string | null
          embedding_version?: string | null
          id?: number
          intent_type?: string | null
          kind?: string
          need_vec?: string | null
          owner_id?: string
          quality?: string | null
          self_vec?: string | null
          slots?: Json | null
          text?: string
        }
        Relationships: []
      }
      match_participants: {
        Row: {
          acted_at: string | null
          created_at: string
          intent_id: string
          match_id: string
          seen_at: string | null
          status: Database["public"]["Enums"]["participant_status"]
          user_id: string
        }
        Insert: {
          acted_at?: string | null
          created_at?: string
          intent_id: string
          match_id: string
          seen_at?: string | null
          status?: Database["public"]["Enums"]["participant_status"]
          user_id: string
        }
        Update: {
          acted_at?: string | null
          created_at?: string
          intent_id?: string
          match_id?: string
          seen_at?: string | null
          status?: Database["public"]["Enums"]["participant_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_participants_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          algo_version: string | null
          created_at: string
          group_id: string | null
          id: string
          kind: Database["public"]["Enums"]["match_kind"]
          pair_key: string | null
          reason_i18n: Json
          score: number | null
          strength: Database["public"]["Enums"]["match_strength"]
        }
        Insert: {
          algo_version?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["match_kind"]
          pair_key?: string | null
          reason_i18n?: Json
          score?: number | null
          strength?: Database["public"]["Enums"]["match_strength"]
        }
        Update: {
          algo_version?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["match_kind"]
          pair_key?: string | null
          reason_i18n?: Json
          score?: number | null
          strength?: Database["public"]["Enums"]["match_strength"]
        }
        Relationships: [
          {
            foreignKeyName: "matches_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      matching_jobs: {
        Row: {
          attempts: number
          created_at: string
          finished_at: string | null
          id: number
          intent_id: string
          last_error: string | null
          reason: string
          run_after: string
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: never
          intent_id: string
          last_error?: string | null
          reason: string
          run_after?: string
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: never
          intent_id?: string
          last_error?: string | null
          reason?: string
          run_after?: string
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "matching_jobs_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "intents"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          lang: string | null
          moderation: Database["public"]["Enums"]["moderation_status"]
          sender_id: string | null
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          lang?: string | null
          moderation?: Database["public"]["Enums"]["moderation_status"]
          sender_id?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          lang?: string | null
          moderation?: Database["public"]["Enums"]["moderation_status"]
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          background: string | null
          city: string | null
          country_code: string | null
          created_at: string
          display_name: string
          headline: string | null
          id: string
          last_active_at: string
          links: string[]
          locale: string
          notify_message: boolean
          notify_new_match: boolean
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          background?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          display_name: string
          headline?: string | null
          id: string
          last_active_at?: string
          links?: string[]
          locale?: string
          notify_message?: boolean
          notify_new_match?: boolean
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          background?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          display_name?: string
          headline?: string | null
          id?: string
          last_active_at?: string
          links?: string[]
          locale?: string
          notify_message?: boolean
          notify_new_match?: boolean
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          last_seen_at: string
          platform: Database["public"]["Enums"]["push_platform"]
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_seen_at?: string
          platform: Database["public"]["Enums"]["push_platform"]
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_seen_at?: string
          platform?: Database["public"]["Enums"]["push_platform"]
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          reason: string
          reporter_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target"]
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          reason: string
          reporter_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target"]
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          reason?: string
          reporter_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_type?: Database["public"]["Enums"]["report_target"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
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
      can_view_group: { Args: { p_group_id: string }; Returns: boolean }
      can_view_intent: { Args: { p_intent_id: string }; Returns: boolean }
      claim_matching_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          finished_at: string | null
          id: number
          intent_id: string
          last_error: string | null
          reason: string
          run_after: string
          status: Database["public"]["Enums"]["job_status"]
        }[]
        SetofOptions: {
          from: "*"
          to: "matching_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_pair_match: {
        Args: {
          p_algo_version: string
          p_intent_a: string
          p_intent_b: string
          p_reason_i18n: Json
          p_score: number
          p_strength: Database["public"]["Enums"]["match_strength"]
        }
        Returns: string
      }
      feature_enabled: { Args: { p_key: string }; Returns: boolean }
      is_blocked_between: { Args: { a: string; b: string }; Returns: boolean }
      is_conversation_member: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_match_participant: { Args: { p_match_id: string }; Returns: boolean }
      join_group: { Args: { p_match_id: string }; Returns: string }
      leave_group: { Args: { p_group_id: string }; Returns: undefined }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      mark_match_seen: { Args: { p_match_id: string }; Returns: undefined }
      match_candidate_intents: {
        Args: {
          p_intent_id: string
          p_limit?: number
          p_min_similarity?: number
          p_model: string
        }
        Returns: {
          backward_similarity: number
          forward_similarity: number
          intent_id: string
          kind: Database["public"]["Enums"]["intent_kind"]
          owner_id: string
        }[]
      }
      skip_match: { Args: { p_match_id: string }; Returns: undefined }
      start_conversation: { Args: { p_match_id: string }; Returns: string }
    }
    Enums: {
      conversation_kind: "direct" | "group"
      embedding_facet: "self" | "need"
      group_role: "initiator" | "member"
      group_status: "forming" | "active" | "ended"
      intent_kind: "seek" | "offer"
      intent_status: "active" | "paused" | "expired" | "archived"
      job_status: "queued" | "running" | "done" | "failed"
      match_kind: "pair" | "group"
      match_strength: "strong" | "weak"
      moderation_status: "pending" | "approved" | "flagged" | "rejected"
      participant_status:
        | "pending"
        | "skipped"
        | "contacted"
        | "joined"
        | "left"
      push_platform: "ios" | "android"
      report_status: "open" | "reviewing" | "resolved" | "dismissed"
      report_target: "user" | "intent" | "message" | "group"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      conversation_kind: ["direct", "group"],
      embedding_facet: ["self", "need"],
      group_role: ["initiator", "member"],
      group_status: ["forming", "active", "ended"],
      intent_kind: ["seek", "offer"],
      intent_status: ["active", "paused", "expired", "archived"],
      job_status: ["queued", "running", "done", "failed"],
      match_kind: ["pair", "group"],
      match_strength: ["strong", "weak"],
      moderation_status: ["pending", "approved", "flagged", "rejected"],
      participant_status: ["pending", "skipped", "contacted", "joined", "left"],
      push_platform: ["ios", "android"],
      report_status: ["open", "reviewing", "resolved", "dismissed"],
      report_target: ["user", "intent", "message", "group"],
    },
  },
} as const
