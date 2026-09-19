/**
 * Database row DTO types.
 *
 * These are the serializable shapes passed to Client Components. Keep them in
 * sync with `prisma/schema.prisma` and the mappers in `lib/timesheets/queries`.
 */

import type {
  AppRole,
  AssignmentRole,
  TimesheetStatus,
  ApprovalAction,
  PtoStatus,
  AuditEntityType,
  ContractStatus,
  EquipmentStatus,
  HardwareRequestStatus,
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
          password_hash: string | null;
          role: AppRole;
          is_active: boolean;
        } & Timestamps;
        Insert: {
          id: string;
          email: string;
          password_hash?: string | null;
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
          nickname: string | null;
          pronouns: string | null;
          location: string | null;
          linkedin_url: string | null;
          avatar_updated_at: string | null;
          organization_id: string | null;
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
          nickname?: string | null;
          pronouns?: string | null;
          location?: string | null;
          linkedin_url?: string | null;
          avatar_updated_at?: string | null;
          organization_id?: string | null;
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
      employee_contracts: {
        Row: {
          id: string;
          employee_profile_id: string;
          title: string;
          contract_type: string | null;
          start_date: string;
          end_date: string | null;
          status: ContractStatus;
          notes: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          employee_profile_id: string;
          title: string;
          contract_type?: string | null;
          start_date: string;
          end_date?: string | null;
          status?: ContractStatus;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_contracts"]["Insert"]>;
        Relationships: [];
      };
      contract_attachments: {
        // NOTE: `file_bytes` (bytea) is intentionally omitted — attachment
        // bytes are never serialized to Client Components. Downloads go through
        // the authenticated route handler only.
        Row: {
          id: string;
          contract_id: string;
          original_filename: string;
          mime_type: string;
          size_bytes: number;
          uploaded_at: string;
          uploaded_by_user_id: string | null;
        };
        Insert: {
          id?: string;
          contract_id: string;
          original_filename: string;
          mime_type: string;
          size_bytes: number;
          uploaded_at?: string;
          uploaded_by_user_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["contract_attachments"]["Insert"]>;
        Relationships: [];
      };
      equipment_assignments: {
        Row: {
          id: string;
          employee_profile_id: string;
          name: string;
          asset_tag: string | null;
          status: EquipmentStatus;
          issued_on: string | null;
          returned_on: string | null;
          notes: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          employee_profile_id: string;
          name: string;
          asset_tag?: string | null;
          status?: EquipmentStatus;
          issued_on?: string | null;
          returned_on?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["equipment_assignments"]["Insert"]>;
        Relationships: [];
      };
      hardware_requests: {
        Row: {
          id: string;
          employee_profile_id: string;
          details: string;
          category: string | null;
          status: HardwareRequestStatus;
          review_note: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_by: string;
        } & Timestamps;
        Insert: {
          id?: string;
          employee_profile_id: string;
          details: string;
          category?: string | null;
          status?: HardwareRequestStatus;
          review_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["hardware_requests"]["Insert"]>;
        Relationships: [];
      };
      leave_entitlements: {
        Row: {
          id: string;
          employee_profile_id: string;
          activity_type_id: string;
          hours: number;
          note: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          employee_profile_id: string;
          activity_type_id: string;
          hours?: number;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leave_entitlements"]["Insert"]>;
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
      contract_status: ContractStatus;
      equipment_status: EquipmentStatus;
      hardware_request_status: HardwareRequestStatus;
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
