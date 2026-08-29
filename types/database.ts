/**
 * Supabase database types.
 *
 * This file is hand-authored to match `supabase/migrations/0001_init.sql`
 * so the app is type-safe before a live database exists. Once the Supabase
 * project is provisioned, regenerate it from the source of truth:
 *
 *   supabase gen types typescript --project-id <ref> --schema public > types/database.ts
 *
 * Keep it in sync with the migrations until then.
 */

import type {
  AppRole,
  AssignmentRole,
  TimesheetStatus,
  ApprovalAction,
  PtoStatus,
  AuditEntityType,
} from "./domain";

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          role: AppRole;
          is_active: boolean;
        } & Timestamps;
        Insert: {
          id: string;
          email: string;
          role?: AppRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
      employee_profiles: {
        Row: {
          id: string;
          user_id: string;
          employee_code: string | null;
          full_name: string;
          manager_user_id: string | null;
          default_daily_hours: number;
          department: string | null;
          timezone: string;
          start_date: string | null;
          end_date: string | null;
          can_approve: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id: string;
          employee_code?: string | null;
          full_name: string;
          manager_user_id?: string | null;
          default_daily_hours?: number;
          department?: string | null;
          timezone?: string;
          start_date?: string | null;
          end_date?: string | null;
          can_approve?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_profiles"]["Insert"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          code: string | null;
          name: string;
          client_name: string | null;
          is_active: boolean;
          requires_platform: boolean;
          color_token: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          code?: string | null;
          name: string;
          client_name?: string | null;
          is_active?: boolean;
          requires_platform?: boolean;
          color_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
        Relationships: [];
      };
      platforms: {
        Row: {
          id: string;
          name: string;
          is_active: boolean;
          sort_order: number;
        } & Timestamps;
        Insert: {
          id?: string;
          name: string;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["platforms"]["Insert"]>;
        Relationships: [];
      };
      activity_types: {
        Row: {
          id: string;
          name: string;
          category: string | null;
          is_billable: boolean;
          is_pto: boolean;
          is_active: boolean;
          sort_order: number;
        } & Timestamps;
        Insert: {
          id?: string;
          name: string;
          category?: string | null;
          is_billable?: boolean;
          is_pto?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["activity_types"]["Insert"]>;
        Relationships: [];
      };
      project_assignments: {
        Row: {
          id: string;
          employee_profile_id: string;
          project_id: string;
          assignment_role: AssignmentRole;
          starts_on: string | null;
          ends_on: string | null;
          is_active: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          employee_profile_id: string;
          project_id: string;
          assignment_role?: AssignmentRole;
          starts_on?: string | null;
          ends_on?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["project_assignments"]["Insert"]>;
        Relationships: [];
      };
      entry_templates: {
        Row: {
          id: string;
          employee_profile_id: string;
          project_id: string | null;
          platform_id: string | null;
          activity_type_id: string;
          description: string | null;
          label: string;
          sort_order: number;
          is_active: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          employee_profile_id: string;
          project_id?: string | null;
          platform_id?: string | null;
          activity_type_id: string;
          description?: string | null;
          label: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["entry_templates"]["Insert"]>;
        Relationships: [];
      };
      timesheet_periods: {
        Row: {
          id: string;
          employee_profile_id: string;
          week_start_date: string;
          week_end_date: string;
          expected_hours: number;
          total_hours: number;
          status: TimesheetStatus;
          submitted_at: string | null;
          submitted_by: string | null;
          locked_at: string | null;
          locked_by: string | null;
          rejection_reason: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          employee_profile_id: string;
          week_start_date: string;
          week_end_date: string;
          expected_hours: number;
          total_hours?: number;
          status?: TimesheetStatus;
          submitted_at?: string | null;
          submitted_by?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["timesheet_periods"]["Insert"]>;
        Relationships: [];
      };
      time_entries: {
        Row: {
          id: string;
          employee_profile_id: string;
          timesheet_period_id: string;
          entry_date: string;
          project_id: string | null;
          platform_id: string | null;
          activity_type_id: string;
          hours: number;
          description: string;
          source: string;
          created_by: string;
          updated_by: string;
        } & Timestamps;
        Insert: {
          id?: string;
          employee_profile_id: string;
          timesheet_period_id: string;
          entry_date: string;
          project_id?: string | null;
          platform_id?: string | null;
          activity_type_id: string;
          hours: number;
          description?: string;
          source?: string;
          created_by: string;
          updated_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["time_entries"]["Insert"]>;
        Relationships: [];
      };
      approvals: {
        Row: {
          id: string;
          timesheet_period_id: string;
          actor_user_id: string;
          action: ApprovalAction;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          timesheet_period_id: string;
          actor_user_id: string;
          action: ApprovalAction;
          comment?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["approvals"]["Insert"]>;
        Relationships: [];
      };
      audit_history: {
        Row: {
          id: string;
          entity_type: AuditEntityType;
          entity_id: string;
          action: string;
          actor_user_id: string | null;
          occurred_at: string;
          before_state: Record<string, unknown> | null;
          after_state: Record<string, unknown> | null;
          metadata: Record<string, unknown>;
        };
        Insert: {
          id?: string;
          entity_type: AuditEntityType;
          entity_id: string;
          action: string;
          actor_user_id?: string | null;
          occurred_at?: string;
          before_state?: Record<string, unknown> | null;
          after_state?: Record<string, unknown> | null;
          metadata?: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["audit_history"]["Insert"]>;
        Relationships: [];
      };
      pto_requests: {
        Row: {
          id: string;
          employee_profile_id: string;
          activity_type_id: string;
          start_date: string;
          end_date: string;
          hours_per_day: number;
          total_hours: number;
          status: PtoStatus;
          notes: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_by: string;
        } & Timestamps;
        Insert: {
          id?: string;
          employee_profile_id: string;
          activity_type_id: string;
          start_date: string;
          end_date: string;
          hours_per_day?: number;
          total_hours: number;
          status?: PtoStatus;
          notes?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pto_requests"]["Insert"]>;
        Relationships: [];
      };
      pto_balances: {
        Row: {
          id: string;
          employee_profile_id: string;
          pto_type: string;
          balance_hours: number;
          effective_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          employee_profile_id: string;
          pto_type: string;
          balance_hours?: number;
          effective_date: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pto_balances"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      app_role: AppRole;
      assignment_role: AssignmentRole;
      timesheet_status: TimesheetStatus;
      approval_action: ApprovalAction;
      pto_status: PtoStatus;
      audit_entity_type: AuditEntityType;
    };
    CompositeTypes: Record<string, never>;
  };
};

/** Convenience row-type helper: `Row<"projects">`. */
export type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Insert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type Update<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
