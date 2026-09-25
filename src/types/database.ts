export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OrgRole =
  | "owner"
  | "admin"
  | "project_manager"
  | "member"
  | "client";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          timezone: string;
          default_currency: string;
          email: string | null;
          phone: string | null;
          address: string | null;
          website: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          timezone?: string;
          default_currency?: string;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          website?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          timezone?: string;
          default_currency?: string;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          website?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: OrgRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role: OrgRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: OrgRole;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: "admin" | "project_manager" | "member" | "client";
          client_id: string | null;
          token_hash: string;
          invited_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          role: "admin" | "project_manager" | "member" | "client";
          client_id?: string | null;
          token_hash: string;
          invited_by?: string | null;
          expires_at: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          role?: "admin" | "project_manager" | "member";
          token_hash?: string;
          invited_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          company: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          company?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          company?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string;
          name: string;
          description: string | null;
          status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
          start_date: string | null;
          deadline: string | null;
          budget: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_id: string;
          name: string;
          description?: string | null;
          status?: "planning" | "active" | "on_hold" | "completed" | "cancelled";
          start_date?: string | null;
          deadline?: string | null;
          budget?: number | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          name?: string;
          description?: string | null;
          status?: "planning" | "active" | "on_hold" | "completed" | "cancelled";
          start_date?: string | null;
          deadline?: string | null;
          budget?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_members: {
        Row: {
          project_id: string;
          organization_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          project_id: string;
          organization_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          project_id?: string;
          organization_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      milestones: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          title: string;
          description: string | null;
          status: "pending" | "completed";
          due_date: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          title: string;
          description?: string | null;
          status?: "pending" | "completed";
          due_date?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          status?: "pending" | "completed";
          due_date?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          milestone_id: string | null;
          title: string;
          description: string | null;
          status: "todo" | "in_progress" | "done";
          priority: "low" | "medium" | "high" | "urgent";
          assigned_to: string | null;
          due_date: string | null;
          visible_to_client: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          milestone_id?: string | null;
          title: string;
          description?: string | null;
          status?: "todo" | "in_progress" | "done";
          priority?: "low" | "medium" | "high" | "urgent";
          assigned_to?: string | null;
          due_date?: string | null;
          visible_to_client?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          milestone_id?: string | null;
          title?: string;
          description?: string | null;
          status?: "todo" | "in_progress" | "done";
          priority?: "low" | "medium" | "high" | "urgent";
          assigned_to?: string | null;
          due_date?: string | null;
          visible_to_client?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      files: {
        Row: {
          id: string;
          organization_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string | null;
          size_bytes: number | null;
          uploaded_by: string | null;
          visible_to_client: boolean;
          project_id: string | null;
          client_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          storage_path: string;
          file_name: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          uploaded_by?: string | null;
          visible_to_client?: boolean;
          project_id?: string | null;
          client_id?: string | null;
          created_at?: string;
        };
        Update: {
          visible_to_client?: boolean;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          company: string | null;
          email: string | null;
          phone: string | null;
          source: string | null;
          service_interest: string | null;
          estimated_value: number | null;
          status: "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";
          priority: "low" | "medium" | "high";
          assigned_to: string | null;
          next_follow_up_at: string | null;
          notes: string | null;
          lost_reason: string | null;
          converted_client_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          company?: string | null;
          email?: string | null;
          phone?: string | null;
          source?: string | null;
          service_interest?: string | null;
          estimated_value?: number | null;
          status?: "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";
          priority?: "low" | "medium" | "high";
          assigned_to?: string | null;
          next_follow_up_at?: string | null;
          notes?: string | null;
          lost_reason?: string | null;
          converted_client_id?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          company?: string | null;
          email?: string | null;
          phone?: string | null;
          source?: string | null;
          service_interest?: string | null;
          estimated_value?: number | null;
          status?: "new" | "contacted" | "qualified" | "proposal" | "lost";
          priority?: "low" | "medium" | "high";
          assigned_to?: string | null;
          next_follow_up_at?: string | null;
          notes?: string | null;
          lost_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      lead_activities: {
        Row: {
          id: string;
          organization_id: string;
          lead_id: string;
          activity_type:
            | "note"
            | "call"
            | "email"
            | "meeting"
            | "status_change"
            | "follow_up";
          content: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          lead_id: string;
          activity_type:
            | "note"
            | "call"
            | "email"
            | "meeting"
            | "status_change"
            | "follow_up";
          content: string;
          created_by: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      proposals: {
        Row: {
          id: string;
          organization_id: string;
          proposal_number: string;
          title: string;
          lead_id: string | null;
          client_id: string | null;
          status: "draft" | "sent" | "accepted" | "rejected" | "expired";
          issue_date: string;
          valid_until: string | null;
          currency: string;
          recipient_name: string;
          recipient_company: string | null;
          recipient_email: string | null;
          recipient_phone: string | null;
          recipient_address: string | null;
          introduction: string | null;
          scope: string | null;
          terms: string | null;
          client_notes: string | null;
          internal_notes: string | null;
          subtotal: number;
          discount_type: "fixed" | "percentage" | null;
          discount_value: number | null;
          discount_amount: number;
          tax_percent: number | null;
          tax_amount: number;
          total: number;
          accepted_at: string | null;
          rejected_at: string | null;
          client_response_note: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          title: string;
          lead_id?: string | null;
          client_id?: string | null;
          status?: "draft";
          issue_date: string;
          valid_until?: string | null;
          currency: string;
          recipient_name: string;
          recipient_company?: string | null;
          recipient_email?: string | null;
          recipient_phone?: string | null;
          recipient_address?: string | null;
          introduction?: string | null;
          scope?: string | null;
          terms?: string | null;
          client_notes?: string | null;
          internal_notes?: string | null;
          discount_type?: "fixed" | "percentage" | null;
          discount_value?: number | null;
          tax_percent?: number | null;
          created_by: string;
        };
        Update: {
          title?: string;
          lead_id?: string | null;
          client_id?: string | null;
          status?: "draft" | "sent" | "accepted" | "rejected" | "expired";
          issue_date?: string;
          valid_until?: string | null;
          currency?: string;
          recipient_name?: string;
          recipient_company?: string | null;
          recipient_email?: string | null;
          recipient_phone?: string | null;
          recipient_address?: string | null;
          introduction?: string | null;
          scope?: string | null;
          terms?: string | null;
          client_notes?: string | null;
          internal_notes?: string | null;
          discount_type?: "fixed" | "percentage" | null;
          discount_value?: number | null;
          tax_percent?: number | null;
        };
        Relationships: [];
      };
      proposal_items: {
        Row: {
          id: string;
          organization_id: string;
          proposal_id: string;
          sort_order: number;
          name: string;
          description: string | null;
          quantity: number;
          unit_price: number;
          line_total: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          proposal_id: string;
          sort_order?: number;
          name: string;
          description?: string | null;
          quantity: number;
          unit_price: number;
        };
        Update: {
          sort_order?: number;
          name?: string;
          description?: string | null;
          quantity?: number;
          unit_price?: number;
        };
        Relationships: [];
      };
      client_users: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string;
          user_id: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_id: string;
          user_id: string;
          created_by: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string;
          project_id: string | null;
          proposal_id: string | null;
          invoice_number: string;
          title: string;
          status: "draft" | "issued" | "partially_paid" | "paid" | "void";
          issue_date: string;
          due_date: string;
          currency: string;
          recipient_name: string;
          recipient_company: string | null;
          recipient_email: string | null;
          recipient_phone: string | null;
          recipient_address: string | null;
          notes: string | null;
          terms: string | null;
          internal_notes: string | null;
          subtotal: number;
          discount_type: "fixed" | "percentage" | null;
          discount_value: number | null;
          discount_amount: number;
          tax_percent: number | null;
          tax_amount: number;
          total: number;
          amount_paid: number;
          balance_due: number;
          issued_at: string | null;
          paid_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          client_id: string;
          project_id?: string | null;
          proposal_id?: string | null;
          title: string;
          status?: "draft";
          issue_date: string;
          due_date: string;
          currency: string;
          recipient_name: string;
          recipient_company?: string | null;
          recipient_email?: string | null;
          recipient_phone?: string | null;
          recipient_address?: string | null;
          notes?: string | null;
          terms?: string | null;
          internal_notes?: string | null;
          discount_type?: "fixed" | "percentage" | null;
          discount_value?: number | null;
          tax_percent?: number | null;
          created_by: string;
        };
        Update: {
          title?: string;
          client_id?: string;
          project_id?: string | null;
          proposal_id?: string | null;
          status?: "draft" | "issued" | "partially_paid" | "paid" | "void";
          issue_date?: string;
          due_date?: string;
          currency?: string;
          recipient_name?: string;
          recipient_company?: string | null;
          recipient_email?: string | null;
          recipient_phone?: string | null;
          recipient_address?: string | null;
          notes?: string | null;
          terms?: string | null;
          internal_notes?: string | null;
          discount_type?: "fixed" | "percentage" | null;
          discount_value?: number | null;
          tax_percent?: number | null;
        };
        Relationships: [];
      };
      invoice_items: {
        Row: {
          id: string;
          organization_id: string;
          invoice_id: string;
          description: string;
          quantity: number;
          unit_price: number;
          line_total: number;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          invoice_id: string;
          description: string;
          quantity: number;
          unit_price: number;
          sort_order?: number;
        };
        Update: {
          description?: string;
          quantity?: number;
          unit_price?: number;
          sort_order?: number;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          organization_id: string;
          invoice_id: string;
          amount: number;
          payment_date: string;
          payment_method: "bank_transfer" | "cash" | "bkash" | "nagad" | "card" | "cheque" | "other";
          reference: string | null;
          notes: string | null;
          recorded_by: string;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          type:
            | "proposal_sent"
            | "proposal_accepted"
            | "proposal_rejected"
            | "invoice_issued"
            | "payment_recorded"
            | "task_assigned";
          title: string;
          message: string;
          href: string;
          is_read: boolean;
          read_at: string | null;
          event_key: string;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_organization: {
        Args: {
          p_name: string;
          p_timezone?: string;
          p_default_currency?: string;
        };
        Returns: Database["public"]["Tables"]["organizations"]["Row"];
      };
      accept_invitation: {
        Args: { p_token: string };
        Returns: Database["public"]["Tables"]["organization_members"]["Row"];
      };
      portal_projects: {
        Args: { p_organization_id: string };
        Returns: Array<{
          id: string;
          name: string;
          description: string | null;
          status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
          deadline: string | null;
          milestone_total: number;
          milestone_completed: number;
        }>;
      };
      portal_milestones: {
        Args: { p_organization_id: string; p_project_id: string };
        Returns: Array<{
          id: string;
          title: string;
          description: string | null;
          status: "pending" | "completed";
          due_date: string | null;
          sort_order: number;
        }>;
      };
      portal_tasks: {
        Args: { p_organization_id: string; p_project_id: string };
        Returns: Array<{
          id: string;
          title: string;
          description: string | null;
          status: "todo" | "in_progress" | "done";
          due_date: string | null;
        }>;
      };
      portal_files: {
        Args: { p_organization_id: string };
        Returns: Array<{
          id: string;
          file_name: string;
          mime_type: string | null;
          size_bytes: number | null;
          created_at: string;
          context_name: string;
          project_id: string | null;
        }>;
      };
      portal_file_path: {
        Args: { p_organization_id: string; p_file_id: string };
        Returns: string;
      };
      portal_proposals: {
        Args: { p_organization_id: string };
        Returns: Array<{
          id: string;
          proposal_number: string;
          title: string;
          status: "sent" | "accepted" | "rejected" | "expired";
          issue_date: string;
          valid_until: string | null;
          currency: string;
          total: number;
        }>;
      };
      portal_proposal: {
        Args: { p_organization_id: string; p_proposal_id: string };
        Returns: Array<{
          id: string;
          proposal_number: string;
          title: string;
          status: "sent" | "accepted" | "rejected" | "expired";
          issue_date: string;
          valid_until: string | null;
          currency: string;
          recipient_name: string;
          introduction: string | null;
          scope: string | null;
          terms: string | null;
          client_notes: string | null;
          subtotal: number;
          discount_amount: number;
          tax_amount: number;
          total: number;
          client_response_note: string | null;
        }>;
      };
      portal_proposal_items: {
        Args: { p_organization_id: string; p_proposal_id: string };
        Returns: Array<{
          name: string;
          description: string | null;
          quantity: number;
          unit_price: number;
          line_total: number;
          sort_order: number;
        }>;
      };
      portal_identity: {
        Args: { p_organization_id: string };
        Returns: Array<{
          organization_name: string;
          client_name: string;
          client_company: string | null;
        }>;
      };
      client_respond_to_proposal: {
        Args: { p_proposal_id: string; p_decision: string; p_reason: string | null };
        Returns: string;
      };
      revoke_client_portal_access: {
        Args: {
          p_organization_id: string;
          p_client_id: string;
          p_user_id: string;
        };
        Returns: boolean;
      };
      is_org_member: { Args: { p_organization_id: string }; Returns: boolean };
      org_role: {
        Args: { p_organization_id: string };
        Returns: OrgRole;
      };
      is_staff: { Args: { p_organization_id: string }; Returns: boolean };
      has_org_role: {
        Args: { p_organization_id: string; p_roles: OrgRole[] };
        Returns: boolean;
      };
      current_user_id: { Args: Record<string, never>; Returns: string };
      convert_lead_to_client: {
        Args: { p_organization_id: string; p_lead_id: string };
        Returns: string;
      };
      save_draft_proposal: {
        Args: {
          p_organization_id: string;
          p_proposal_id: string | null;
          p_payload: Json;
        };
        Returns: string;
      };
      save_draft_invoice: {
        Args: {
          p_organization_id: string;
          p_invoice_id: string | null;
          p_payload: Json;
        };
        Returns: string;
      };
      issue_invoice: {
        Args: { p_organization_id: string; p_invoice_id: string };
        Returns: string;
      };
      void_invoice: {
        Args: { p_organization_id: string; p_invoice_id: string };
        Returns: string;
      };
      record_invoice_payment: {
        Args: {
          p_organization_id: string;
          p_invoice_id: string;
          p_amount: number;
          p_payment_date: string;
          p_method: string;
          p_reference: string | null;
          p_notes: string | null;
        };
        Returns: string;
      };
      portal_invoices: {
        Args: { p_organization_id: string };
        Returns: Array<{
          id: string;
          invoice_number: string;
          title: string;
          status: "draft" | "issued" | "partially_paid" | "paid" | "void";
          issue_date: string;
          due_date: string;
          currency: string;
          total: number;
          amount_paid: number;
          balance_due: number;
        }>;
      };
      portal_invoice: {
        Args: { p_organization_id: string; p_invoice_id: string };
        Returns: Array<{
          id: string;
          invoice_number: string;
          title: string;
          status: "draft" | "issued" | "partially_paid" | "paid" | "void";
          issue_date: string;
          due_date: string;
          currency: string;
          recipient_name: string;
          recipient_company: string | null;
          notes: string | null;
          terms: string | null;
          subtotal: number;
          discount_amount: number;
          tax_amount: number;
          total: number;
          amount_paid: number;
          balance_due: number;
        }>;
      };
      portal_invoice_items: {
        Args: { p_organization_id: string; p_invoice_id: string };
        Returns: Array<{
          description: string;
          quantity: number;
          unit_price: number;
          line_total: number;
          sort_order: number;
        }>;
      };
      portal_invoice_payments: {
        Args: { p_organization_id: string; p_invoice_id: string };
        Returns: Array<{
          amount: number;
          payment_date: string;
          payment_method: "bank_transfer" | "cash" | "bkash" | "nagad" | "card" | "cheque" | "other";
          reference: string | null;
        }>;
      };
      mark_notification_read: {
        Args: { p_notification_id: string };
        Returns: boolean;
      };
      mark_all_notifications_read: {
        Args: { p_organization_id: string };
        Returns: number;
      };
      claim_pending_emails: {
        Args: { p_organization_id: string; p_template: string; p_entity_id: string };
        Returns: Array<{
          id: string;
          recipient_email: string;
          template: string;
          summary: string;
          action_path: string;
          organization_name: string;
        }>;
      };
      complete_email_delivery: {
        Args: {
          p_delivery_id: string;
          p_status: string;
          p_provider_message_id: string | null;
          p_error_code: string | null;
        };
        Returns: undefined;
      };
      rotate_invitation_token: {
        Args: { p_organization_id: string; p_invitation_id: string; p_token_hash: string };
        Returns: string;
      };
      begin_invitation_email: {
        Args: {
          p_organization_id: string;
          p_invitation_id: string;
          p_event_key: string;
          p_token_hash: string;
        };
        Returns: Array<{ delivery_id: string; recipient_email: string }>;
      };
      own_invitation_id: {
        Args: { p_token_hash: string };
        Returns: string;
      };
      report_overview: {
        Args: { p_organization_id: string; p_start: string | null; p_end: string | null };
        Returns: Json;
      };
      report_crm: {
        Args: { p_organization_id: string; p_start: string | null; p_end: string | null };
        Returns: Json;
      };
      report_projects: {
        Args: { p_organization_id: string };
        Returns: Json;
      };
      report_sales: {
        Args: { p_organization_id: string; p_start: string | null; p_end: string | null };
        Returns: Json;
      };
      report_clients: {
        Args: { p_organization_id: string; p_limit: number; p_offset: number };
        Returns: Json;
      };
      report_client: {
        Args: { p_organization_id: string; p_client_id: string };
        Returns: Json;
      };
    };
    Enums: {
      org_role: OrgRole;
      project_status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
      milestone_status: "pending" | "completed";
      task_status: "todo" | "in_progress" | "done";
      task_priority: "low" | "medium" | "high" | "urgent";
      proposal_status: "draft" | "sent" | "accepted" | "rejected" | "expired";
      invoice_status: "draft" | "issued" | "partially_paid" | "paid" | "void";
      payment_method: "bank_transfer" | "cash" | "bkash" | "nagad" | "card" | "cheque" | "other";
      discount_type: "fixed" | "percentage";
      lead_status: "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";
      lead_priority: "low" | "medium" | "high";
      lead_activity_type:
        | "note"
        | "call"
        | "email"
        | "meeting"
        | "status_change"
        | "follow_up";
    };
    CompositeTypes: Record<string, never>;
  };
};
