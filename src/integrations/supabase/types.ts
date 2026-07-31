export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string;
          admin_id: string;
          created_at: string;
          id: string;
          metadata: Json | null;
          target_id: string | null;
          target_type: string;
        };
        Insert: {
          action: string;
          admin_id: string;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          target_id?: string | null;
          target_type: string;
        };
        Update: {
          action?: string;
          admin_id?: string;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          target_id?: string | null;
          target_type?: string;
        };
        Relationships: [];
      };
      admin_settings: {
        Row: {
          description: string | null;
          key: string;
          updated_at: string;
          value: Json;
        };
        Insert: {
          description?: string | null;
          key: string;
          updated_at?: string;
          value: Json;
        };
        Update: {
          description?: string | null;
          key?: string;
          updated_at?: string;
          value?: Json;
        };
        Relationships: [];
      };
      earnings_tracker: {
        Row: {
          gross_cents: number;
          helper_id: string;
          payouts_locked: boolean;
          tx_count: number;
          updated_at: string;
          year: number;
        };
        Insert: {
          gross_cents?: number;
          helper_id: string;
          payouts_locked?: boolean;
          tx_count?: number;
          updated_at?: string;
          year: number;
        };
        Update: {
          gross_cents?: number;
          helper_id?: string;
          payouts_locked?: boolean;
          tx_count?: number;
          updated_at?: string;
          year?: number;
        };
        Relationships: [];
      };
      escrow_transactions: {
        Row: {
          bid_cents: number;
          created_at: string;
          customer_fee_cents: number;
          customer_id: string;
          disputed_at: string | null;
          gig_id: string;
          held_at: string | null;
          helper_fee_cents: number;
          helper_id: string;
          id: string;
          paid_out_at: string | null;
          released_at: string | null;
          state: Database["public"]["Enums"]["escrow_state"];
          updated_at: string;
        };
        Insert: {
          bid_cents: number;
          created_at?: string;
          customer_fee_cents: number;
          customer_id: string;
          disputed_at?: string | null;
          gig_id: string;
          held_at?: string | null;
          helper_fee_cents: number;
          helper_id: string;
          id?: string;
          paid_out_at?: string | null;
          released_at?: string | null;
          state?: Database["public"]["Enums"]["escrow_state"];
          updated_at?: string;
        };
        Update: {
          bid_cents?: number;
          created_at?: string;
          customer_fee_cents?: number;
          customer_id?: string;
          disputed_at?: string | null;
          gig_id?: string;
          held_at?: string | null;
          helper_fee_cents?: number;
          helper_id?: string;
          id?: string;
          paid_out_at?: string | null;
          released_at?: string | null;
          state?: Database["public"]["Enums"]["escrow_state"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "escrow_transactions_gig_id_fkey";
            columns: ["gig_id"];
            isOneToOne: false;
            referencedRelation: "gigs";
            referencedColumns: ["id"];
          },
        ];
      };
      favorites: {
        Row: {
          created_at: string;
          customer_id: string;
          helper_id: string;
        };
        Insert: {
          created_at?: string;
          customer_id: string;
          helper_id: string;
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          helper_id?: string;
        };
        Relationships: [];
      };
      gigs: {
        Row: {
          address: string | null;
          allowed_age_groups: string[];
          assigned_helper_id: string | null;
          budget_cents: number;
          created_at: string;
          customer_id: string;
          description: string | null;
          duration_minutes: number;
          exclusive_until: string | null;
          id: string;
          postal_code: string | null;
          scheduled_at: string | null;
          service_type: string;
          status: Database["public"]["Enums"]["gig_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          allowed_age_groups?: string[];
          assigned_helper_id?: string | null;
          budget_cents: number;
          created_at?: string;
          customer_id: string;
          description?: string | null;
          duration_minutes?: number;
          exclusive_until?: string | null;
          id?: string;
          postal_code?: string | null;
          scheduled_at?: string | null;
          service_type: string;
          status?: Database["public"]["Enums"]["gig_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          allowed_age_groups?: string[];
          assigned_helper_id?: string | null;
          budget_cents?: number;
          created_at?: string;
          customer_id?: string;
          description?: string | null;
          duration_minutes?: number;
          exclusive_until?: string | null;
          id?: string;
          postal_code?: string | null;
          scheduled_at?: string | null;
          service_type?: string;
          status?: Database["public"]["Enums"]["gig_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          customer_id: string;
          escrow_id: string;
          gig_id: string;
          helper_id: string;
          id: string;
          invoice_number: string;
          issued_at: string;
          labor_cents: number;
          material_cents: number;
          para_35a_notice: boolean;
          total_cents: number;
        };
        Insert: {
          customer_id: string;
          escrow_id: string;
          gig_id: string;
          helper_id: string;
          id?: string;
          invoice_number: string;
          issued_at?: string;
          labor_cents: number;
          material_cents?: number;
          para_35a_notice?: boolean;
          total_cents: number;
        };
        Update: {
          customer_id?: string;
          escrow_id?: string;
          gig_id?: string;
          helper_id?: string;
          id?: string;
          invoice_number?: string;
          issued_at?: string;
          labor_cents?: number;
          material_cents?: number;
          para_35a_notice?: boolean;
          total_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_escrow_id_fkey";
            columns: ["escrow_id"];
            isOneToOne: true;
            referencedRelation: "escrow_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_gig_id_fkey";
            columns: ["gig_id"];
            isOneToOne: false;
            referencedRelation: "gigs";
            referencedColumns: ["id"];
          },
        ];
      };
      negotiations: {
        Row: {
          bid_cents: number;
          counter_bid_cents: number | null;
          created_at: string;
          gig_id: string;
          helper_id: string;
          id: string;
          message: string | null;
          status: Database["public"]["Enums"]["negotiation_status"];
          updated_at: string;
        };
        Insert: {
          bid_cents: number;
          counter_bid_cents?: number | null;
          created_at?: string;
          gig_id: string;
          helper_id: string;
          id?: string;
          message?: string | null;
          status?: Database["public"]["Enums"]["negotiation_status"];
          updated_at?: string;
        };
        Update: {
          bid_cents?: number;
          counter_bid_cents?: number | null;
          created_at?: string;
          gig_id?: string;
          helper_id?: string;
          id?: string;
          message?: string | null;
          status?: Database["public"]["Enums"]["negotiation_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "negotiations_gig_id_fkey";
            columns: ["gig_id"];
            isOneToOne: false;
            referencedRelation: "gigs";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          comment: string | null;
          created_at: string;
          customer_id: string;
          gig_id: string;
          helper_id: string;
          id: string;
          rating: number;
        };
        Insert: {
          comment?: string | null;
          created_at?: string;
          customer_id: string;
          gig_id: string;
          helper_id: string;
          id?: string;
          rating: number;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          customer_id?: string;
          gig_id?: string;
          helper_id?: string;
          id?: string;
          rating?: number;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_gig_id_fkey";
            columns: ["gig_id"];
            isOneToOne: true;
            referencedRelation: "gigs";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          available_today: boolean;
          bio: string | null;
          business_name: string | null;
          city: string | null;
          created_at: string;
          display_name: string;
          id: string;
          language: string;
          postal_code: string | null;
          trust_score: number;
          updated_at: string;
          ust_id: string | null;
          verified_at: string | null;
        };
        Insert: {
          available_today?: boolean;
          bio?: string | null;
          business_name?: string | null;
          city?: string | null;
          created_at?: string;
          display_name?: string;
          id: string;
          language?: string;
          postal_code?: string | null;
          trust_score?: number;
          updated_at?: string;
          ust_id?: string | null;
          verified_at?: string | null;
        };
        Update: {
          available_today?: boolean;
          bio?: string | null;
          business_name?: string | null;
          city?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          language?: string;
          postal_code?: string | null;
          trust_score?: number;
          updated_at?: string;
          ust_id?: string | null;
          verified_at?: string | null;
        };
        Relationships: [];
      };
      profile_private: {
        Row: {
          birthdate: string | null;
          guardian_email: string | null;
          id: string;
          tax_id: string | null;
          updated_at: string;
        };
        Insert: {
          birthdate?: string | null;
          guardian_email?: string | null;
          id: string;
          tax_id?: string | null;
          updated_at?: string;
        };
        Update: {
          birthdate?: string | null;
          guardian_email?: string | null;
          id?: string;
          tax_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_helper: { Args: { _user_id: string }; Returns: boolean };
      log_admin_action: {
        Args: {
          _action: string;
          _metadata?: Json | null;
          _target_id?: string | null;
          _target_type: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "customer" | "helper_youth" | "helper_adult" | "helper_pro" | "admin";
      escrow_state: "pending" | "held" | "releasing" | "paid_out" | "disputed";
      gig_status:
        "draft" | "open" | "negotiating" | "assigned" | "in_progress" | "completed" | "cancelled";
      negotiation_status: "pending" | "countered" | "accepted" | "declined" | "withdrawn";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["customer", "helper_youth", "helper_adult", "helper_pro", "admin"],
      escrow_state: ["pending", "held", "releasing", "paid_out", "disputed"],
      gig_status: [
        "draft",
        "open",
        "negotiating",
        "assigned",
        "in_progress",
        "completed",
        "cancelled",
      ],
      negotiation_status: ["pending", "countered", "accepted", "declined", "withdrawn"],
    },
  },
} as const;
