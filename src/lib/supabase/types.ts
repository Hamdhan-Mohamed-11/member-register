export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip: unknown
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip?: unknown
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          book_discount_percent: number
          currency: string
          expiring_soon_days: number
          id: number
          library_addon_fee_lkr: number
          library_addon_term_months: number
          membership_fee_lkr: number
          membership_term_months: number
          readrise_book_cost_lkr: number
          readrise_percent: number
          readrise_target_books: number
          readrise_target_on: string
          renewal_grace_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          book_discount_percent?: number
          currency?: string
          expiring_soon_days?: number
          id?: number
          library_addon_fee_lkr?: number
          library_addon_term_months?: number
          membership_fee_lkr?: number
          membership_term_months?: number
          readrise_book_cost_lkr?: number
          readrise_percent?: number
          readrise_target_books?: number
          readrise_target_on?: string
          renewal_grace_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          book_discount_percent?: number
          currency?: string
          expiring_soon_days?: number
          id?: number
          library_addon_fee_lkr?: number
          library_addon_term_months?: number
          membership_fee_lkr?: number
          membership_term_months?: number
          readrise_book_cost_lkr?: number
          readrise_percent?: number
          readrise_target_books?: number
          readrise_target_on?: string
          renewal_grace_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          code: string
          created_at: string
          description: string
          family: string | null
          icon: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          threshold: number | null
          tier: number
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          family?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          threshold?: number | null
          tier?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          family?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          threshold?: number | null
          tier?: number
        }
        Relationships: []
      }
      book_order_items: {
        Row: {
          agreed_unit_price_lkr: number | null
          asking_unit_price_lkr: number
          author: string
          book_id: number
          id: string
          order_id: string
          quantity: number
          title: string
        }
        Insert: {
          agreed_unit_price_lkr?: number | null
          asking_unit_price_lkr?: number
          author?: string
          book_id: number
          id?: string
          order_id: string
          quantity?: number
          title?: string
        }
        Update: {
          agreed_unit_price_lkr?: number | null
          asking_unit_price_lkr?: number
          author?: string
          book_id?: number
          id?: string
          order_id?: string
          quantity?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "book_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      book_order_messages: {
        Row: {
          body: string
          created_at: string
          from_admin: boolean
          id: string
          order_id: string
          sender_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          from_admin?: boolean
          id?: string
          order_id: string
          sender_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          from_admin?: boolean
          id?: string
          order_id?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_order_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "book_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_order_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_order_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      book_orders: {
        Row: {
          agreed_total_lkr: number | null
          asking_total_lkr: number
          created_at: string
          decided_at: string | null
          fulfilled_at: string | null
          id: string
          member_email: string | null
          member_id: string | null
          member_name: string | null
          note: string | null
          readrise_lkr: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          agreed_total_lkr?: number | null
          asking_total_lkr?: number
          created_at?: string
          decided_at?: string | null
          fulfilled_at?: string | null
          id?: string
          member_email?: string | null
          member_id?: string | null
          member_name?: string | null
          note?: string | null
          readrise_lkr?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          agreed_total_lkr?: number | null
          asking_total_lkr?: number
          created_at?: string
          decided_at?: string | null
          fulfilled_at?: string | null
          id?: string
          member_email?: string | null
          member_id?: string | null
          member_name?: string | null
          note?: string | null
          readrise_lkr?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_orders_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_orders_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_orders_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_orders_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      book_wishlist: {
        Row: {
          author: string
          book_id: number
          created_at: string
          id: string
          kind: string
          member_id: string
          title: string
        }
        Insert: {
          author?: string
          book_id: number
          created_at?: string
          id?: string
          kind: string
          member_id: string
          title?: string
        }
        Update: {
          author?: string
          book_id?: number
          created_at?: string
          id?: string
          kind?: string
          member_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_wishlist_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_wishlist_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      borrow_requests: {
        Row: {
          author: string
          book_id: number
          decided_at: string | null
          decided_by: string | null
          due_on: string | null
          id: string
          member_id: string
          note: string | null
          requested_at: string
          returned_at: string | null
          status: string
          title: string
        }
        Insert: {
          author?: string
          book_id: number
          decided_at?: string | null
          decided_by?: string | null
          due_on?: string | null
          id?: string
          member_id: string
          note?: string | null
          requested_at?: string
          returned_at?: string | null
          status?: string
          title?: string
        }
        Update: {
          author?: string
          book_id?: number
          decided_at?: string | null
          decided_by?: string | null
          due_on?: string | null
          id?: string
          member_id?: string
          note?: string | null
          requested_at?: string
          returned_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "borrow_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borrow_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borrow_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borrow_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          added_at: string
          author: string
          book_id: number
          member_id: string
          quantity: number
          title: string
        }
        Insert: {
          added_at?: string
          author?: string
          book_id: number
          member_id: string
          quantity?: number
          title?: string
        }
        Update: {
          added_at?: string
          author?: string
          book_id?: number
          member_id?: string
          quantity?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_join_requests: {
        Row: {
          club_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          member_id: string
          message: string | null
          status: string
        }
        Insert: {
          club_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          member_id: string
          message?: string | null
          status?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          member_id?: string
          message?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_join_requests_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_join_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_join_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_join_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_join_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_memberships: {
        Row: {
          club_id: string
          created_at: string
          id: string
          is_primary: boolean
          joined_on: string | null
          member_id: string
          renewal_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          joined_on?: string | null
          member_id: string
          renewal_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          joined_on?: string | null
          member_id?: string
          renewal_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_memberships_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_memberships_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_memberships_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          member_visibility: string
          name: string
          requires_guardian: boolean
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          member_visibility?: string
          name: string
          requires_guardian?: boolean
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          member_visibility?: string
          name?: string
          requires_guardian?: boolean
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      clubs: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_open_join: boolean
          kind: string
          membership_fee_lkr: number | null
          name: string
          secretary_id: string | null
          slug: string
          term_months: number | null
          type_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_open_join?: boolean
          kind: string
          membership_fee_lkr?: number | null
          name: string
          secretary_id?: string | null
          slug: string
          term_months?: number | null
          type_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_open_join?: boolean
          kind?: string
          membership_fee_lkr?: number | null
          name?: string
          secretary_id?: string | null
          slug?: string
          term_months?: number | null
          type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clubs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_secretary_id_fkey"
            columns: ["secretary_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_secretary_id_fkey"
            columns: ["secretary_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "club_types"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          accepted_at: string | null
          accepted_profile_id: string | null
          club_id: string | null
          company_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_profile_id?: string | null
          club_id?: string | null
          company_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_profile_id?: string | null
          club_id?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_accepted_profile_id_fkey"
            columns: ["accepted_profile_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_accepted_profile_id_fkey"
            columns: ["accepted_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_activities: {
        Row: {
          activity_code: string
          id: string
          member_id: string
          points_awarded: number
          recorded_at: string
          recorded_by: string | null
          session_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activity_code: string
          id?: string
          member_id: string
          points_awarded: number
          recorded_at?: string
          recorded_by?: string | null
          session_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activity_code?: string
          id?: string
          member_id?: string
          points_awarded?: number
          recorded_at?: string
          recorded_by?: string | null
          session_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_activities_activity_code_fkey"
            columns: ["activity_code"]
            isOneToOne: false
            referencedRelation: "points_rules"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "member_activities_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_activities_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_activities_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_activities_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_activities_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_activities_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_activities_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          member_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          member_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_badges_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_badges_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          href: string | null
          id: string
          kind: string
          member_id: string
          read_at: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          href?: string | null
          id?: string
          kind: string
          member_id: string
          read_at?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          href?: string | null
          id?: string
          kind?: string
          member_id?: string
          read_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          applied: boolean
          id: string
          outcome: string | null
          payload: Json
          payment_id: string | null
          provider_order_ref: string | null
          received_at: string
          signature_ok: boolean
          status_code: number | null
        }
        Insert: {
          applied: boolean
          id?: string
          outcome?: string | null
          payload: Json
          payment_id?: string | null
          provider_order_ref?: string | null
          received_at?: string
          signature_ok: boolean
          status_code?: number | null
        }
        Update: {
          applied?: boolean
          id?: string
          outcome?: string | null
          payload?: Json
          payment_id?: string | null
          provider_order_ref?: string | null
          received_at?: string
          signature_ok?: boolean
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_lkr: number
          booking_id: string | null
          club_id: string | null
          club_name: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          member_email: string | null
          member_id: string | null
          member_name: string | null
          note: string | null
          order_id: string | null
          paid_at: string | null
          provider: string
          provider_order_ref: string
          provider_payment_id: string | null
          purpose: string
          raw_notification: Json | null
          status: string
          status_code: number | null
          term_months: number | null
        }
        Insert: {
          amount_lkr: number
          booking_id?: string | null
          club_id?: string | null
          club_name?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          member_email?: string | null
          member_id?: string | null
          member_name?: string | null
          note?: string | null
          order_id?: string | null
          paid_at?: string | null
          provider?: string
          provider_order_ref: string
          provider_payment_id?: string | null
          purpose: string
          raw_notification?: Json | null
          status?: string
          status_code?: number | null
          term_months?: number | null
        }
        Update: {
          amount_lkr?: number
          booking_id?: string | null
          club_id?: string | null
          club_name?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          member_email?: string | null
          member_id?: string | null
          member_name?: string | null
          note?: string | null
          order_id?: string | null
          paid_at?: string | null
          provider?: string
          provider_order_ref?: string
          provider_payment_id?: string | null
          purpose?: string
          raw_notification?: Json | null
          status?: string
          status_code?: number | null
          term_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "session_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      points_rules: {
        Row: {
          code: string
          is_active: boolean
          is_presenting: boolean
          label: string
          points: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          is_active?: boolean
          is_presenting?: boolean
          label: string
          points: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          is_active?: boolean
          is_presenting?: boolean
          label?: string
          points?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "points_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          joined_on: string
          last_name: string
          learning_tags: string[]
          library_expires_on: string | null
          phone: string | null
          points_balance: number
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          bio?: string | null
          created_at?: string
          email: string
          first_name?: string
          id: string
          joined_on?: string
          last_name?: string
          learning_tags?: string[]
          library_expires_on?: string | null
          phone?: string | null
          points_balance?: number
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          bio?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          joined_on?: string
          last_name?: string
          learning_tags?: string[]
          library_expires_on?: string | null
          phone?: string | null
          points_balance?: number
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      reading_items: {
        Row: {
          author: string
          created_at: string
          date_read: string | null
          id: string
          member_id: string
          notes: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          author?: string
          created_at?: string
          date_read?: string | null
          id?: string
          member_id: string
          notes?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          author?: string
          created_at?: string
          date_read?: string | null
          id?: string
          member_id?: string
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_items_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_items_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_bookings: {
        Row: {
          booked_at: string
          confirmed_at: string | null
          fee_lkr: number
          id: string
          member_id: string
          session_id: string
          status: string
        }
        Insert: {
          booked_at?: string
          confirmed_at?: string | null
          fee_lkr?: number
          id?: string
          member_id: string
          session_id: string
          status?: string
        }
        Update: {
          booked_at?: string
          confirmed_at?: string | null
          fee_lkr?: number
          id?: string
          member_id?: string
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_bookings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_bookings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          book_author: string
          book_title: string
          capacity: number | null
          created_at: string
          created_by: string | null
          flyer_path: string | null
          flyer_template: string | null
          flyer_updated_at: string | null
          guest_fee_lkr: number | null
          held_at: string
          host_club_id: string
          id: string
          location: string | null
          notes: string | null
          presenter_count: number | null
          presenter_member_id: string | null
          pricing_kind: string
          status: string
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          book_author?: string
          book_title?: string
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          flyer_path?: string | null
          flyer_template?: string | null
          flyer_updated_at?: string | null
          guest_fee_lkr?: number | null
          held_at: string
          host_club_id: string
          id?: string
          location?: string | null
          notes?: string | null
          presenter_count?: number | null
          presenter_member_id?: string | null
          pricing_kind?: string
          status?: string
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          book_author?: string
          book_title?: string
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          flyer_path?: string | null
          flyer_template?: string | null
          flyer_updated_at?: string | null
          guest_fee_lkr?: number | null
          held_at?: string
          host_club_id?: string
          id?: string
          location?: string | null
          notes?: string | null
          presenter_count?: number | null
          presenter_member_id?: string | null
          pricing_kind?: string
          status?: string
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_host_club_id_fkey"
            columns: ["host_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_presenter_member_id_fkey"
            columns: ["presenter_member_id"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_presenter_member_id_fkey"
            columns: ["presenter_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          created_at: string
          description: string | null
          external_id: string
          id: string
          provider: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          session_id: string | null
          source_url: string
          status: string
          submitted_by: string | null
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          external_id: string
          id?: string
          provider: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id?: string | null
          source_url: string
          status?: string
          submitted_by?: string | null
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          external_id?: string
          id?: string
          provider?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id?: string | null
          source_url?: string
          status?: string
          submitted_by?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "videos_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "admin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_members: {
        Row: {
          active_clubs: number | null
          email: string | null
          first_name: string | null
          id: string | null
          joined_on: string | null
          last_name: string | null
          next_renewal: string | null
          points_balance: number | null
          role: string | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_add_club_membership: {
        Args: { p_club_id: string; p_member_id: string; p_months?: number }
        Returns: string
      }
      admin_mark_payment_paid: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: string
      }
      admin_set_membership: {
        Args: {
          p_membership_id: string
          p_renewal_date?: string
          p_status?: string
        }
        Returns: undefined
      }
      apply_payhere_notification: {
        Args: {
          p_amount: number
          p_currency: string
          p_order_ref: string
          p_payload: Json
          p_payment_id: string
          p_signature_ok: boolean
          p_status_code: number
        }
        Returns: string
      }
      appoint_club_secretary: {
        Args: { p_club_id: string; p_member_id?: string }
        Returns: undefined
      }
      approve_join_request: { Args: { p_request_id: string }; Returns: string }
      badge_progress: {
        Args: never
        Returns: {
          family: string
          value: number
        }[]
      }
      book_session: { Args: { p_session_id: string }; Returns: string }
      can_admin_club: { Args: { p_club_id: string }; Returns: boolean }
      can_view_member: { Args: { p_member_id: string }; Returns: boolean }
      cancel_book_order: { Args: { p_order_id: string }; Returns: undefined }
      cancel_borrow_request: { Args: { p_id: string }; Returns: undefined }
      cancel_session_booking: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      create_club_type: {
        Args: {
          p_description?: string
          p_member_visibility?: string
          p_name: string
          p_requires_guardian?: boolean
          p_sort_order?: number
        }
        Returns: string
      }
      create_company_with_club: {
        Args: {
          p_club_name?: string
          p_contact_email?: string
          p_contact_phone?: string
          p_fee_lkr?: number
          p_name: string
          p_term_months?: number
        }
        Returns: {
          club_id: string
          company_id: string
        }[]
      }
      create_invite: {
        Args: { p_club_id: string; p_email: string; p_role?: string }
        Returns: string
      }
      create_public_club: {
        Args: {
          p_description?: string
          p_fee_lkr?: number
          p_name: string
          p_open_join?: boolean
          p_term_months?: number
          p_type_id?: string
        }
        Returns: string
      }
      current_club_ids: { Args: never; Returns: string[] }
      current_member_has_active_club: { Args: never; Returns: boolean }
      current_member_has_library: { Args: never; Returns: boolean }
      current_member_is_active: { Args: never; Returns: boolean }
      current_member_role: { Args: never; Returns: string }
      delete_video: { Args: { p_video_id: string }; Returns: undefined }
      has_library_access: { Args: { p_member_id: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_public_club: { Args: { p_club_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      leaderboard: {
        Args: { p_period?: string }
        Returns: {
          avatar_path: string
          club_name: string
          first_name: string
          is_me: boolean
          last_name: string
          member_id: string
          place: number
          points: number
        }[]
      }
      membership_state: {
        Args: { p_expiring_soon_days?: number; p_renewal: string }
        Returns: string
      }
      moderate_video: {
        Args: { p_note?: string; p_status: string; p_video_id: string }
        Returns: undefined
      }
      new_payment_ref: { Args: { p_prefix: string }; Returns: string }
      notify_member: {
        Args: {
          p_body?: string
          p_dedupe_key?: string
          p_href?: string
          p_kind: string
          p_member_id: string
          p_title: string
        }
        Returns: undefined
      }
      place_book_order: {
        Args: { p_items: Json; p_note?: string }
        Returns: string
      }
      post_order_message: {
        Args: { p_body: string; p_order_id: string }
        Returns: string
      }
      readrise_books_funded: { Args: { p_member_id: string }; Returns: number }
      readrise_donated_lkr: { Args: { p_member_id: string }; Returns: number }
      readrise_totals: {
        Args: never
        Returns: {
          books_funded: number
          donated_lkr: number
          my_books: number
          my_donated: number
          target_books: number
          target_on: string
        }[]
      }
      recompute_all_points: { Args: never; Returns: number }
      recompute_member_badges: {
        Args: { p_member_id: string }
        Returns: number
      }
      recompute_member_points: {
        Args: { p_member_id: string }
        Returns: number
      }
      record_session_attendance: {
        Args: { p_entries: Json; p_session_id: string }
        Returns: number
      }
      reject_join_request: {
        Args: { p_reason?: string; p_request_id: string }
        Returns: undefined
      }
      request_borrow: {
        Args: { p_author?: string; p_book_id: number; p_title?: string }
        Returns: string
      }
      request_club_join: {
        Args: { p_club_id: string; p_message?: string }
        Returns: string
      }
      require_club_admin: { Args: { p_club_id: string }; Returns: undefined }
      resolve_club_terms: {
        Args: { p_club_id: string }
        Returns: {
          fee_lkr: number
          term_months: number
        }[]
      }
      respond_to_quote: {
        Args: { p_accept: boolean; p_order_id: string }
        Returns: undefined
      }
      revoke_invite: { Args: { p_invite_id: string }; Returns: undefined }
      secretary_club_id: { Args: never; Returns: string }
      session_fee_for: {
        Args: { p_member_id: string; p_session_id: string }
        Returns: number
      }
      set_book_order_fulfilled: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      set_book_order_price: {
        Args: { p_message?: string; p_order_id: string; p_unit_prices?: Json }
        Returns: string
      }
      set_borrow_status: {
        Args: {
          p_due_on?: string
          p_id: string
          p_note?: string
          p_status: string
        }
        Returns: undefined
      }
      set_member_role: {
        Args: { p_member_id: string; p_role: string }
        Returns: undefined
      }
      set_member_status: {
        Args: { p_member_id: string; p_status: string }
        Returns: undefined
      }
      set_session_flyer: {
        Args: { p_path?: string; p_session_id: string; p_template?: string }
        Returns: undefined
      }
      shares_active_club: { Args: { p_member_id: string }; Returns: boolean }
      slugify: { Args: { p_text: string }; Returns: string }
      start_book_order_payment: {
        Args: { p_order_id: string }
        Returns: {
          amount: number
          order_ref: string
          payment_id: string
        }[]
      }
      start_club_membership_payment: {
        Args: { p_club_id: string }
        Returns: {
          amount: number
          club_name: string
          is_renewal: boolean
          order_ref: string
          payment_id: string
        }[]
      }
      start_library_addon_payment: {
        Args: never
        Returns: {
          amount: number
          is_renewal: boolean
          order_ref: string
          payment_id: string
        }[]
      }
      start_session_booking_payment: {
        Args: { p_booking_id: string }
        Returns: {
          amount: number
          order_ref: string
          payment_id: string
          session_title: string
        }[]
      }
      submit_video: {
        Args: {
          p_description?: string
          p_external_id: string
          p_provider: string
          p_session_id?: string
          p_source_url: string
          p_title: string
        }
        Returns: string
      }
      unique_club_slug: { Args: { p_base: string }; Returns: string }
      update_app_settings: {
        Args: {
          p_book_discount?: number
          p_expiring_soon_days?: number
          p_grace_days?: number
          p_library_fee?: number
          p_library_term_months?: number
          p_membership_fee?: number
          p_readrise_book_cost?: number
          p_readrise_percent?: number
          p_readrise_target?: number
          p_readrise_target_on?: string
          p_term_months?: number
        }
        Returns: undefined
      }
      update_club: {
        Args: {
          p_club_id: string
          p_description?: string
          p_fee_lkr?: number
          p_is_active?: boolean
          p_name?: string
          p_open_join?: boolean
          p_term_months?: number
          p_type_id?: string
        }
        Returns: undefined
      }
      update_club_type: {
        Args: {
          p_description?: string
          p_is_active?: boolean
          p_member_visibility?: string
          p_name?: string
          p_requires_guardian?: boolean
          p_sort_order?: number
          p_type_id: string
        }
        Returns: undefined
      }
      update_points_rule: {
        Args: { p_code: string; p_points: number }
        Returns: undefined
      }
      upsert_session: {
        Args: {
          p_book_author?: string
          p_book_title?: string
          p_capacity?: number
          p_guest_fee?: number
          p_held_at: string
          p_host_club_id: string
          p_location?: string
          p_notes?: string
          p_presenter?: string
          p_presenter_count?: number
          p_pricing_kind?: string
          p_session_id?: string
          p_status?: string
          p_title: string
          p_video_url?: string
        }
        Returns: string
      }
      write_audit: {
        Args: {
          p_action: string
          p_after?: Json
          p_before?: Json
          p_entity_id: string
          p_entity_type: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

