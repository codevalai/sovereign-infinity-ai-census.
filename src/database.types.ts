export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      agent_lifecycle_events: {
        Row: {
          id: string;
          agent_id: string;
          event_kind: string;
          occurred_at: string;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          event_kind: string;
          occurred_at: string;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          event_kind?: string;
          occurred_at?: string;
          details?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_tiers: {
        Row: { id: number; name: string; rank: number; created_at: string };
        Insert: { id: number; name: string; rank: number; created_at?: string };
        Update: { id?: number; name?: string; rank?: number; created_at?: string };
        Relationships: [];
      };
      agent_telemetry: {
        Row: {
          id: number;
          agent_id: string | null;
          event_type: string;
          payload: Json;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          agent_id?: string | null;
          event_type: string;
          payload?: Json;
          occurred_at?: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          agent_id?: string | null;
          event_type?: string;
          payload?: Json;
          occurred_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      agents: {
        Row: {
          id: string;
          external_id: string | null;
          region_id: string;
          tier_id: number;
          status: string;
          born_at: string;
          died_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          external_id?: string | null;
          region_id: string;
          tier_id: number;
          status: string;
          born_at: string;
          died_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          external_id?: string | null;
          region_id?: string;
          tier_id?: number;
          status?: string;
          born_at?: string;
          died_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      regions: {
        Row: { id: string; code: string; name: string; created_at: string };
        Insert: { id?: string; code: string; name: string; created_at?: string };
        Update: { id?: string; code?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      census_anomalies: {
        Row: {
          id: string;
          event_type: string;
          machine_id: string | null;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_type: string;
          machine_id?: string | null;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_type?: string;
          machine_id?: string | null;
          details?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      census_audit_log: {
        Row: {
          id: string;
          table_name: string;
          operation: string;
          before_data: Json | null;
          after_data: Json | null;
          actor_role: string;
          occurred_at: string;
        };
        Insert: {
          id?: string;
          table_name: string;
          operation: string;
          before_data?: Json | null;
          after_data?: Json | null;
          actor_role: string;
          occurred_at?: string;
        };
        Update: {
          id?: string;
          table_name?: string;
          operation?: string;
          before_data?: Json | null;
          after_data?: Json | null;
          actor_role?: string;
          occurred_at?: string;
        };
        Relationships: [];
      };
      census_entries: {
        Row: {
          id: string;
          agent_id: string | null;
          region_id: string | null;
          observed_at: string;
          attributes: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id?: string | null;
          region_id?: string | null;
          observed_at?: string;
          attributes?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string | null;
          region_id?: string | null;
          observed_at?: string;
          attributes?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      machine_telemetry: {
        Row: {
          id: string;
          machine_id: string;
          autonomy_level: Json;
          ethics_profile: Json;
          economic_role: string;
          geo_location: Json | null;
          observed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          machine_id: string;
          autonomy_level: Json;
          ethics_profile: Json;
          economic_role: string;
          geo_location?: Json | null;
          observed_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          machine_id?: string;
          autonomy_level?: Json;
          ethics_profile?: Json;
          economic_role?: string;
          geo_location?: Json | null;
          observed_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'machine_telemetry_machine_id_fkey';
            columns: ['machine_id'];
            isOneToOne: false;
            referencedRelation: 'machine_population';
            referencedColumns: ['machine_id'];
          },
        ];
      };
      machine_population: {
        Row: {
          id: string;
          machine_id: string;
          kind: string;
          origin: string;
          status: string;
          created_at: string;
          last_seen_at: string | null;
        };
        Insert: {
          id?: string;
          machine_id: string;
          kind?: string;
          origin?: string;
          status?: string;
          created_at?: string;
          last_seen_at?: string | null;
        };
        Update: {
          id?: string;
          machine_id?: string;
          kind?: string;
          origin?: string;
          status?: string;
          created_at?: string;
          last_seen_at?: string | null;
        };
        Relationships: [];
      };
      machine_valuation: {
        Row: {
          id: string;
          machine_id: string;
          valuation_usd: number;
          valuation_model: string;
          risk_index: number;
          context_multiplier: number;
          last_evaluated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          machine_id: string;
          valuation_usd: number;
          valuation_model: string;
          risk_index: number;
          context_multiplier: number;
          last_evaluated_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          machine_id?: string;
          valuation_usd?: number;
          valuation_model?: string;
          risk_index?: number;
          context_multiplier?: number;
          last_evaluated_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'machine_valuation_machine_id_fkey';
            columns: ['machine_id'];
            isOneToOne: false;
            referencedRelation: 'machine_population';
            referencedColumns: ['machine_id'];
          },
        ];
      };
    };
    Views: {
      census_dashboard: {
        Row: {
          machine_id: string;
          kind: string;
          origin: string;
          status: string;
          created_at: string;
          last_seen_at: string | null;
          telemetry_id: string | null;
          autonomy_level: Json | null;
          ethics_profile: Json | null;
          economic_role: string | null;
          geo_location: Json | null;
          observed_at: string | null;
          valuation_id: string | null;
          valuation_usd: number | null;
          valuation_model: string | null;
          risk_index: number | null;
          context_multiplier: number | null;
          last_evaluated_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      register_agent_birth: {
        Args: {
          p_external_id: string;
          p_region_id: string;
          p_tier_id: number;
          p_occurred_at?: string;
          p_details?: Json;
        };
        Returns: string;
      };
      register_agent_shutdown: {
        Args: { p_agent_id: string; p_occurred_at?: string; p_details?: Json };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}