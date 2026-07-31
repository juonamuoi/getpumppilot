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
      ad_creative_events: {
        Row: {
          created_at: string
          creative_id: string
          event: string
          experiment: string
          id: string
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          variant: string
          visitor_id: string
        }
        Insert: {
          created_at?: string
          creative_id: string
          event: string
          experiment: string
          id?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          variant: string
          visitor_id: string
        }
        Update: {
          created_at?: string
          creative_id?: string
          event?: string
          experiment?: string
          id?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          variant?: string
          visitor_id?: string
        }
        Relationships: []
      }
      credit_balances: {
        Row: {
          balance: number
          created_at: string
          lifetime_purchased: number
          lifetime_spent: number
          low_balance_notified_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          lifetime_purchased?: number
          lifetime_spent?: number
          low_balance_notified_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          lifetime_purchased?: number
          lifetime_spent?: number
          low_balance_notified_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          balance_after: number
          created_at: string
          delta: number
          description: string | null
          external_ref: string | null
          feature: string | null
          id: string
          kind: string
          metadata: Json
          user_id: string
        }
        Insert: {
          balance_after: number
          created_at?: string
          delta: number
          description?: string | null
          external_ref?: string | null
          feature?: string | null
          id?: string
          kind: string
          metadata?: Json
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          delta?: number
          description?: string | null
          external_ref?: string | null
          feature?: string | null
          id?: string
          kind?: string
          metadata?: Json
          user_id?: string
        }
        Relationships: []
      }
      lead_captures: {
        Row: {
          consent: boolean
          created_at: string
          email: string
          id: string
          page_path: string | null
          placement: string | null
          referrer: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          variant: string | null
          visitor_id: string | null
        }
        Insert: {
          consent?: boolean
          created_at?: string
          email: string
          id?: string
          page_path?: string | null
          placement?: string | null
          referrer?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          variant?: string | null
          visitor_id?: string | null
        }
        Update: {
          consent?: boolean
          created_at?: string
          email?: string
          id?: string
          page_path?: string | null
          placement?: string | null
          referrer?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          variant?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      mcp_agent_rate_limits: {
        Row: {
          call_limit: number
          client_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          call_limit: number
          client_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          call_limit?: number
          client_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mcp_audit_log: {
        Row: {
          client_id: string | null
          correlation_id: string
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          request: Json
          status: string
          tool_name: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          correlation_id: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          request?: Json
          status: string
          tool_name: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          correlation_id?: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          request?: Json
          status?: string
          tool_name?: string
          user_id?: string
        }
        Relationships: []
      }
      mcp_consent_grants: {
        Row: {
          call_count: number
          client_id: string
          first_granted_at: string
          id: string
          last_seen_at: string
          revoked_at: string | null
          tools_used: string[]
          user_id: string
        }
        Insert: {
          call_count?: number
          client_id: string
          first_granted_at?: string
          id?: string
          last_seen_at?: string
          revoked_at?: string | null
          tools_used?: string[]
          user_id: string
        }
        Update: {
          call_count?: number
          client_id?: string
          first_granted_at?: string
          id?: string
          last_seen_at?: string
          revoked_at?: string | null
          tools_used?: string[]
          user_id?: string
        }
        Relationships: []
      }
      mcp_rate_limit_audit: {
        Row: {
          client_id: string | null
          created_at: string
          field: string
          id: string
          new_value: number | null
          old_value: number | null
          plan: string | null
          reason: string | null
          scope: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          field: string
          id?: string
          new_value?: number | null
          old_value?: number | null
          plan?: string | null
          reason?: string | null
          scope: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          field?: string
          id?: string
          new_value?: number | null
          old_value?: number | null
          plan?: string | null
          reason?: string | null
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      mcp_rate_limit_settings: {
        Row: {
          account_limit: number
          client_limit: number
          created_at: string
          updated_at: string
          user_id: string
          window_seconds: number
        }
        Insert: {
          account_limit: number
          client_limit: number
          created_at?: string
          updated_at?: string
          user_id: string
          window_seconds?: number
        }
        Update: {
          account_limit?: number
          client_limit?: number
          created_at?: string
          updated_at?: string
          user_id?: string
          window_seconds?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      pump_balances: {
        Row: {
          balance: number
          created_at: string
          lifetime_earned: number
          lifetime_received: number
          lifetime_sent: number
          payout_address: string | null
          payout_address_updated_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          lifetime_earned?: number
          lifetime_received?: number
          lifetime_sent?: number
          payout_address?: string | null
          payout_address_updated_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          lifetime_earned?: number
          lifetime_received?: number
          lifetime_sent?: number
          payout_address?: string | null
          payout_address_updated_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pump_ledger: {
        Row: {
          balance_after: number
          counterparty_id: string | null
          created_at: string
          delta: number
          external_ref: string | null
          id: string
          kind: string
          memo: string | null
          quest_key: string | null
          user_id: string
        }
        Insert: {
          balance_after: number
          counterparty_id?: string | null
          created_at?: string
          delta: number
          external_ref?: string | null
          id?: string
          kind: string
          memo?: string | null
          quest_key?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number
          counterparty_id?: string | null
          created_at?: string
          delta?: number
          external_ref?: string | null
          id?: string
          kind?: string
          memo?: string | null
          quest_key?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pump_quest_claims: {
        Row: {
          awarded: number
          created_at: string
          quest_key: string
          user_id: string
        }
        Insert: {
          awarded: number
          created_at?: string
          quest_key: string
          user_id: string
        }
        Update: {
          awarded?: number
          created_at?: string
          quest_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pump_quest_claims_quest_key_fkey"
            columns: ["quest_key"]
            isOneToOne: false
            referencedRelation: "pump_quests"
            referencedColumns: ["key"]
          },
        ]
      }
      pump_quests: {
        Row: {
          active: boolean
          created_at: string
          description: string
          key: string
          reward: number
          sort_order: number
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description: string
          key: string
          reward: number
          sort_order?: number
          title: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          key?: string
          reward?: number
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_rewards: {
        Row: {
          created_at: string
          id: string
          months: number
          reason: string
          referral_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          months?: number
          reason?: string
          referral_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          months?: number
          reason?: string
          referral_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_rewards_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          pump_activation_key: string | null
          pump_awarded_at: string | null
          pump_referred_award: number
          pump_referrer_award: number
          qualified_at: string | null
          referred_user_id: string
          referrer_code: string
          referrer_id: string
          reward_granted_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          pump_activation_key?: string | null
          pump_awarded_at?: string | null
          pump_referred_award?: number
          pump_referrer_award?: number
          qualified_at?: string | null
          referred_user_id: string
          referrer_code: string
          referrer_id: string
          reward_granted_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          pump_activation_key?: string | null
          pump_awarded_at?: string | null
          pump_referred_award?: number
          pump_referrer_award?: number
          qualified_at?: string | null
          referred_user_id?: string
          referrer_code?: string
          referrer_id?: string
          reward_granted_at?: string | null
          status?: string
        }
        Relationships: []
      }
      seo_crawl_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          current_value: number | null
          delta: number | null
          id: string
          message: string
          metric: string
          previous_value: number | null
          severity: string
          site_url: string
          snapshot_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          current_value?: number | null
          delta?: number | null
          id?: string
          message: string
          metric: string
          previous_value?: number | null
          severity?: string
          site_url: string
          snapshot_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          current_value?: number | null
          delta?: number | null
          id?: string
          message?: string
          metric?: string
          previous_value?: number | null
          severity?: string
          site_url?: string
          snapshot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_crawl_alerts_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "seo_crawl_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_crawl_snapshots: {
        Row: {
          canonical_mismatches: number
          crawl_errors: number
          created_at: string
          details: Json
          error: string | null
          id: string
          indexed_urls: number
          ok: boolean
          site_url: string
          sitemap_errors: number
          sitemap_warnings: number
          source: string
          submitted_urls: number
          urls_checked: number
        }
        Insert: {
          canonical_mismatches?: number
          crawl_errors?: number
          created_at?: string
          details?: Json
          error?: string | null
          id?: string
          indexed_urls?: number
          ok?: boolean
          site_url: string
          sitemap_errors?: number
          sitemap_warnings?: number
          source?: string
          submitted_urls?: number
          urls_checked?: number
        }
        Update: {
          canonical_mismatches?: number
          crawl_errors?: number
          created_at?: string
          details?: Json
          error?: string | null
          id?: string
          indexed_urls?: number
          ok?: boolean
          site_url?: string
          sitemap_errors?: number
          sitemap_warnings?: number
          source?: string
          submitted_urls?: number
          urls_checked?: number
        }
        Relationships: []
      }
      storage_access_audit: {
        Row: {
          bucket: string
          correlation_id: string | null
          created_at: string
          decision: string
          id: string
          object_path: string
          operation: string
          path_owner_id: string | null
          reason: string | null
          user_id: string | null
        }
        Insert: {
          bucket: string
          correlation_id?: string | null
          created_at?: string
          decision: string
          id?: string
          object_path: string
          operation: string
          path_owner_id?: string | null
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          bucket?: string
          correlation_id?: string | null
          created_at?: string
          decision?: string
          id?: string
          object_path?: string
          operation?: string
          path_owner_id?: string | null
          reason?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      storage_audit_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          bucket: string
          created_at: string
          distinct_users: number
          event_count: number
          id: string
          message: string
          path_pattern: string
          rule: string
          sample: Json
          severity: string
          threshold: number
          window_minutes: number
          window_start: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          bucket: string
          created_at?: string
          distinct_users?: number
          event_count?: number
          id?: string
          message: string
          path_pattern?: string
          rule: string
          sample?: Json
          severity?: string
          threshold: number
          window_minutes: number
          window_start: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          bucket?: string
          created_at?: string
          distinct_users?: number
          event_count?: number
          id?: string
          message?: string
          path_pattern?: string
          rule?: string
          sample?: Json
          severity?: string
          threshold?: number
          window_minutes?: number
          window_start?: string
        }
        Relationships: []
      }
      strategies: {
        Row: {
          author_id: string
          config: Json
          created_at: string
          description: string
          forks_count: number
          id: string
          is_public: boolean
          likes_count: number
          parent_id: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          config?: Json
          created_at?: string
          description?: string
          forks_count?: number
          id?: string
          is_public?: boolean
          likes_count?: number
          parent_id?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          config?: Json
          created_at?: string
          description?: string
          forks_count?: number
          id?: string
          is_public?: boolean
          likes_count?: number
          parent_id?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategies_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_follows: {
        Row: {
          author_id: string
          created_at: string
          follower_id: string
        }
        Insert: {
          author_id: string
          created_at?: string
          follower_id: string
        }
        Update: {
          author_id?: string
          created_at?: string
          follower_id?: string
        }
        Relationships: []
      }
      strategy_likes: {
        Row: {
          created_at: string
          strategy_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          strategy_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          strategy_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_likes_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waitlist_signups: {
        Row: {
          confirmation_sent_at: string | null
          created_at: string
          email: string
          followup_sent_at: string | null
          id: string
          source: string | null
          status: string
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          confirmation_sent_at?: string | null
          created_at?: string
          email: string
          followup_sent_at?: string | null
          id?: string
          source?: string | null
          status?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          confirmation_sent_at?: string | null
          created_at?: string
          email?: string
          followup_sent_at?: string | null
          id?: string
          source?: string | null
          status?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ad_creative_report: {
        Args: { _days?: number; _experiment?: string }
        Returns: {
          clicks: number
          creative_id: string
          impressions: number
          signups: number
          variant: string
          visitors: number
        }[]
      }
      ad_funnel_report: {
        Args: { _days?: number }
        Returns: {
          activations: number
          avg_minutes_to_chart: number
          campaign: string
          cta_clicks: number
          medium: string
          signups: number
          source: string
          variant: string
          visitors: number
        }[]
      }
      consume_credits: {
        Args: {
          _amount: number
          _description?: string
          _feature: string
          _metadata?: Json
        }
        Returns: Json
      }
      ensure_credit_account: {
        Args: { _user_id: string; _welcome?: number }
        Returns: undefined
      }
      evaluate_storage_audit_alerts: {
        Args: {
          _deny_threshold?: number
          _mismatch_threshold?: number
          _window_minutes?: number
        }
        Returns: number
      }
      grant_credits: {
        Args: {
          _amount: number
          _description?: string
          _external_ref?: string
          _kind: string
          _metadata?: Json
          _user_id: string
        }
        Returns: Json
      }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lp_variant_report: {
        Args: { _days?: number }
        Returns: {
          cta_clickers: number
          cta_clicks: number
          impressions: number
          signups: number
          variant: string
          visitors: number
        }[]
      }
      mcp_begin_call: {
        Args: {
          _client_id: string
          _client_limit?: number
          _correlation_id: string
          _limit?: number
          _request?: Json
          _tool_name: string
          _user_id: string
          _window_seconds?: number
        }
        Returns: Json
      }
      mcp_effective_limits: {
        Args: { _client_id?: string; _user_id: string }
        Returns: Json
      }
      mcp_finish_call: {
        Args: {
          _correlation_id: string
          _duration_ms?: number
          _error_message?: string
          _status: string
          _user_id: string
        }
        Returns: undefined
      }
      mcp_my_limits: { Args: { _client_id?: string }; Returns: Json }
      mcp_plan_defaults: { Args: { _user_id: string }; Returns: Json }
      mcp_rate_limit_status: {
        Args: { _client_id?: string; _user_id?: string }
        Returns: Json
      }
      mcp_set_agent_rate_limit: {
        Args: { _call_limit?: number; _client_id: string; _reason?: string }
        Returns: Json
      }
      mcp_set_rate_limits: {
        Args: {
          _account_limit?: number
          _client_limit?: number
          _reason?: string
          _window_seconds?: number
        }
        Returns: Json
      }
      my_referral_reward_months: { Args: never; Returns: number }
      process_referral_rewards: { Args: never; Returns: number }
      pump_claim_quest: { Args: { _quest_key: string }; Returns: Json }
      pump_ensure_account: {
        Args: { _signup_bonus?: number; _user_id: string }
        Returns: undefined
      }
      pump_my_summary: { Args: never; Returns: Json }
      pump_referral_status: { Args: never; Returns: Json }
      pump_set_payout_address: { Args: { _address: string }; Returns: Json }
      pump_settle_referral: {
        Args: { _activation_key: string; _user_id: string }
        Returns: Json
      }
      pump_transfer: {
        Args: { _amount: number; _memo?: string; _to_tag: string }
        Returns: Json
      }
      pump_transfer_history: {
        Args: { _limit?: number; _offset?: number }
        Returns: Json
      }
      resolve_referral_code: { Args: { _code: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
