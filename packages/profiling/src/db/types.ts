export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activities: {
        Row: {
          child_id: string
          created_at: string
          created_by: string
          days: string[]
          id: string
          kind: Database["public"]["Enums"]["activity_kind"]
          name: string
          place: string | null
          since: string
        }
        ComputedFields: never
        Insert: {
          child_id: string
          created_at?: string
          created_by: string
          days?: string[]
          id?: string
          kind: Database["public"]["Enums"]["activity_kind"]
          name: string
          place?: string | null
          since: string
        }
        Update: {
          child_id?: string
          created_at?: string
          created_by?: string
          days?: string[]
          id?: string
          kind?: Database["public"]["Enums"]["activity_kind"]
          name?: string
          place?: string | null
          since?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          at: string
          child_id: string | null
          class_id: string | null
          created_at: string
          event_id: string | null
          id: string
          school_id: string
          text: string
          tool: string
        }
        ComputedFields: never
        Insert: {
          at?: string
          child_id?: string | null
          class_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          school_id: string
          text: string
          tool: string
        }
        Update: {
          at?: string
          child_id?: string | null
          class_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          school_id?: string
          text?: string
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_replays: {
        Row: {
          created_at: string
          key: string
          model: string
          response: NonNullable<Json>
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          key: string
          model: string
          response: NonNullable<Json>
        }
        Update: {
          created_at?: string
          key?: string
          model?: string
          response?: NonNullable<Json>
        }
        Relationships: []
      }
      answer_keys: {
        Row: {
          approved_at: string | null
          created_at: string
          items: NonNullable<Json>
          memo_path: string | null
          status: Database["public"]["Enums"]["map_status"]
          test_id: string
        }
        ComputedFields: never
        Insert: {
          approved_at?: string | null
          created_at?: string
          items?: NonNullable<Json>
          memo_path?: string | null
          status?: Database["public"]["Enums"]["map_status"]
          test_id: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          items?: NonNullable<Json>
          memo_path?: string | null
          status?: Database["public"]["Enums"]["map_status"]
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "answer_keys_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: true
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          child_id: string
          created_at: string
          day: string
          status: Database["public"]["Enums"]["attendance_status"]
        }
        ComputedFields: never
        Insert: {
          child_id: string
          created_at?: string
          day: string
          status: Database["public"]["Enums"]["attendance_status"]
        }
        Update: {
          child_id?: string
          created_at?: string
          day?: string
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Relationships: [
          {
            foreignKeyName: "attendance_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      child_login_attempts: {
        Row: {
          at: string
          code: string
          created_at: string
          id: string
        }
        ComputedFields: never
        Insert: {
          at?: string
          code: string
          created_at?: string
          id?: string
        }
        Update: {
          at?: string
          code?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      child_logins: {
        Row: {
          child_id: string
          code: string
          created_at: string
          pin_set_by: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          child_id: string
          code: string
          created_at?: string
          pin_set_by?: string | null
          user_id: string
        }
        Update: {
          child_id?: string
          code?: string
          created_at?: string
          pin_set_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_logins_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          created_at: string
          first_name: string
          grade: number
          id: string
          last_name: string | null
          parent_first_name: string | null
          parent_relation: string | null
          school_id: string
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          first_name: string
          grade: number
          id?: string
          last_name?: string | null
          parent_first_name?: string | null
          parent_relation?: string | null
          school_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          first_name?: string
          grade?: number
          id?: string
          last_name?: string | null
          parent_first_name?: string | null
          parent_relation?: string | null
          school_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "children_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          grade: number
          id: string
          join_code: string
          name: string
          school_id: string
          subject: string
          teacher_id: string
          year: number
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          grade: number
          id?: string
          join_code: string
          name: string
          school_id: string
          subject: string
          teacher_id: string
          year: number
        }
        Update: {
          created_at?: string
          grade?: number
          id?: string
          join_code?: string
          name?: string
          school_id?: string
          subject?: string
          teacher_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_docs: {
        Row: {
          class_id: string
          created_at: string
          id: string
          pages: number
          storage_path: string
          title: string
        }
        ComputedFields: never
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          pages?: number
          storage_path: string
          title: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          pages?: number
          storage_path?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_docs_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_maps: {
        Row: {
          approved_at: string | null
          class_id: string
          created_at: string
          draft: NonNullable<Json>
          id: string
          status: Database["public"]["Enums"]["map_status"]
        }
        ComputedFields: never
        Insert: {
          approved_at?: string | null
          class_id: string
          created_at?: string
          draft?: NonNullable<Json>
          id?: string
          status?: Database["public"]["Enums"]["map_status"]
        }
        Update: {
          approved_at?: string | null
          class_id?: string
          created_at?: string
          draft?: NonNullable<Json>
          id?: string
          status?: Database["public"]["Enums"]["map_status"]
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_maps_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_sandboxes: {
        Row: {
          created_at: string
          id: string
          logins: NonNullable<Json>
          school_id: string
          stage: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          logins?: NonNullable<Json>
          school_id: string
          stage?: string
        }
        Update: {
          created_at?: string
          id?: string
          logins?: NonNullable<Json>
          school_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_sandboxes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      enrolments: {
        Row: {
          child_id: string
          class_id: string
          created_at: string
        }
        ComputedFields: never
        Insert: {
          child_id: string
          class_id: string
          created_at?: string
        }
        Update: {
          child_id?: string
          class_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrolments_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          attempts: number
          claimed_by: string | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          payload: NonNullable<Json>
          runner: Database["public"]["Enums"]["runner"]
          school_id: string
          status: Database["public"]["Enums"]["event_status"]
          type: string
        }
        ComputedFields: never
        Insert: {
          attempts?: number
          claimed_by?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          payload?: NonNullable<Json>
          runner?: Database["public"]["Enums"]["runner"]
          school_id: string
          status?: Database["public"]["Enums"]["event_status"]
          type: string
        }
        Update: {
          attempts?: number
          claimed_by?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          payload?: NonNullable<Json>
          runner?: Database["public"]["Enums"]["runner"]
          school_id?: string
          status?: Database["public"]["Enums"]["event_status"]
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      format_trials: {
        Row: {
          child_id: string
          created_at: string
          format: Database["public"]["Enums"]["lesson_format"]
          id: string
          score: number
          session_id: string | null
          topic_family: string
        }
        ComputedFields: never
        Insert: {
          child_id: string
          created_at?: string
          format: Database["public"]["Enums"]["lesson_format"]
          id?: string
          score: number
          session_id?: string | null
          topic_family: string
        }
        Update: {
          child_id?: string
          created_at?: string
          format?: Database["public"]["Enums"]["lesson_format"]
          id?: string
          score?: number
          session_id?: string | null
          topic_family?: string
        }
        Relationships: [
          {
            foreignKeyName: "format_trials_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "format_trials_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      gaps: {
        Row: {
          child_id: string
          created_at: string
          evidence: string[]
          first_practised_at: string | null
          fixed_at: string | null
          id: string
          stage: Database["public"]["Enums"]["gap_stage"]
          topic_id: string | null
          topic_name: string
        }
        ComputedFields: never
        Insert: {
          child_id: string
          created_at?: string
          evidence?: string[]
          first_practised_at?: string | null
          fixed_at?: string | null
          id?: string
          stage?: Database["public"]["Enums"]["gap_stage"]
          topic_id?: string | null
          topic_name: string
        }
        Update: {
          child_id?: string
          created_at?: string
          evidence?: string[]
          first_practised_at?: string | null
          fixed_at?: string | null
          id?: string
          stage?: Database["public"]["Enums"]["gap_stage"]
          topic_id?: string | null
          topic_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "gaps_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gaps_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      guidance_cards: {
        Row: {
          child_id: string
          content: NonNullable<Json>
          created_at: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          child_id: string
          content: NonNullable<Json>
          created_at?: string
          updated_at?: string
        }
        Update: {
          child_id?: string
          content?: NonNullable<Json>
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guidance_cards_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          audio_path: string | null
          child_id: string
          content: NonNullable<Json>
          created_at: string
          format: Database["public"]["Enums"]["lesson_format"]
          id: string
          topic_id: string | null
          topic_name: string
        }
        ComputedFields: never
        Insert: {
          audio_path?: string | null
          child_id: string
          content: NonNullable<Json>
          created_at?: string
          format: Database["public"]["Enums"]["lesson_format"]
          id?: string
          topic_id?: string | null
          topic_name: string
        }
        Update: {
          audio_path?: string | null
          child_id?: string
          content?: NonNullable<Json>
          created_at?: string
          format?: Database["public"]["Enums"]["lesson_format"]
          id?: string
          topic_id?: string | null
          topic_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_tokens: {
        Row: {
          created_at: string
          label: string
          school_id: string | null
          token_hash: string
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          label: string
          school_id?: string | null
          token_hash: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          label?: string
          school_id?: string | null
          token_hash?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mcp_tokens_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      needs_you_items: {
        Row: {
          child_id: string | null
          created_at: string
          detail: string
          id: string
          kind: Database["public"]["Enums"]["need_kind"]
          owner_id: string
          ref_id: string
          school_id: string
          status: Database["public"]["Enums"]["need_status"]
          title: string
        }
        ComputedFields: never
        Insert: {
          child_id?: string | null
          created_at?: string
          detail?: string
          id?: string
          kind: Database["public"]["Enums"]["need_kind"]
          owner_id: string
          ref_id: string
          school_id: string
          status?: Database["public"]["Enums"]["need_status"]
          title: string
        }
        Update: {
          child_id?: string | null
          created_at?: string
          detail?: string
          id?: string
          kind?: Database["public"]["Enums"]["need_kind"]
          owner_id?: string
          ref_id?: string
          school_id?: string
          status?: Database["public"]["Enums"]["need_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "needs_you_items_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "needs_you_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          href: string
          id: string
          read_at: string | null
          title: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          body: string
          created_at?: string
          href: string
          id?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          href?: string
          id?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      observations: {
        Row: {
          author_id: string
          child_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["obs_kind"]
          text: string
        }
        ComputedFields: never
        Insert: {
          author_id: string
          child_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["obs_kind"]
          text: string
        }
        Update: {
          author_id?: string
          child_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["obs_kind"]
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "observations_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_pages: {
        Row: {
          created_at: string
          id: string
          page_no: number
          paper_id: string
          storage_path: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          page_no: number
          paper_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          page_no?: number
          paper_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_pages_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "papers"
            referencedColumns: ["id"]
          },
        ]
      }
      papers: {
        Row: {
          child_id: string | null
          created_at: string
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["paper_kind"]
          name_read: string | null
          owner: Database["public"]["Enums"]["paper_owner"]
          status: Database["public"]["Enums"]["paper_status"]
          test_id: string | null
          total: number | null
        }
        ComputedFields: never
        Insert: {
          child_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind: Database["public"]["Enums"]["paper_kind"]
          name_read?: string | null
          owner: Database["public"]["Enums"]["paper_owner"]
          status?: Database["public"]["Enums"]["paper_status"]
          test_id?: string | null
          total?: number | null
        }
        Update: {
          child_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["paper_kind"]
          name_read?: string | null
          owner?: Database["public"]["Enums"]["paper_owner"]
          status?: Database["public"]["Enums"]["paper_status"]
          test_id?: string | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "papers_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papers_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_links: {
        Row: {
          child_id: string
          class_id: string
          consent: NonNullable<Json>
          created_at: string
          decided_at: string | null
          id: string
          parent_id: string
          status: Database["public"]["Enums"]["link_status"]
        }
        ComputedFields: never
        Insert: {
          child_id: string
          class_id: string
          consent?: NonNullable<Json>
          created_at?: string
          decided_at?: string | null
          id?: string
          parent_id: string
          status?: Database["public"]["Enums"]["link_status"]
        }
        Update: {
          child_id?: string
          class_id?: string
          consent?: NonNullable<Json>
          created_at?: string
          decided_at?: string | null
          id?: string
          parent_id?: string
          status?: Database["public"]["Enums"]["link_status"]
        }
        Relationships: [
          {
            foreignKeyName: "parent_links_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_links_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          role: Database["public"]["Enums"]["user_role"]
          school_id: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          display_name: string
          role: Database["public"]["Enums"]["user_role"]
          school_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          role?: Database["public"]["Enums"]["user_role"]
          school_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      question_results: {
        Row: {
          answer_read: string
          changed_by: string | null
          child_id: string
          correct: boolean
          created_at: string
          crop: Json | null
          gap_topic_id: string | null
          id: string
          mark: number
          misconception: string | null
          n: number
          paper_id: string
          previous_answer: string | null
          prompt: string
          read_confidence: number
          topic_id: string | null
          topic_name: string
        }
        ComputedFields: never
        Insert: {
          answer_read: string
          changed_by?: string | null
          child_id: string
          correct: boolean
          created_at?: string
          crop?: Json | null
          gap_topic_id?: string | null
          id?: string
          mark: number
          misconception?: string | null
          n: number
          paper_id: string
          previous_answer?: string | null
          prompt: string
          read_confidence: number
          topic_id?: string | null
          topic_name: string
        }
        Update: {
          answer_read?: string
          changed_by?: string | null
          child_id?: string
          correct?: boolean
          created_at?: string
          crop?: Json | null
          gap_topic_id?: string | null
          id?: string
          mark?: number
          misconception?: string | null
          n?: number
          paper_id?: string
          previous_answer?: string | null
          prompt?: string
          read_confidence?: number
          topic_id?: string | null
          topic_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_results_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_results_gap_topic_id_fkey"
            columns: ["gap_topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_results_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_results_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      reteach_plans: {
        Row: {
          class_id: string
          content: NonNullable<Json>
          created_at: string
          done_at: string | null
          explanation: string | null
          id: string
          missing_basic: string | null
          topic_id: string | null
          test_id: string | null
          topic_name: string
          why: string | null
        }
        ComputedFields: never
        Insert: {
          class_id: string
          content: NonNullable<Json>
          created_at?: string
          done_at?: string | null
          id?: string
          topic_id?: string | null
          topic_name: string
          explanation?: string | null
          missing_basic?: string | null
          test_id?: string | null
          why?: string | null
        }
        Update: {
          class_id?: string
          content?: NonNullable<Json>
          created_at?: string
          done_at?: string | null
          id?: string
          topic_id?: string | null
          topic_name?: string
          explanation?: string | null
          missing_basic?: string | null
          test_id?: string | null
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reteach_plans_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reteach_plans_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      runner_presence: {
        Row: {
          agents: NonNullable<Json>
          chosen: string | null
          created_at: string
          last_seen: string
          runner_id: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          agents?: NonNullable<Json>
          chosen?: string | null
          created_at?: string
          last_seen?: string
          runner_id: string
          user_id: string
        }
        Update: {
          agents?: NonNullable<Json>
          chosen?: string | null
          created_at?: string
          last_seen?: string
          runner_id?: string
          user_id?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          ai_runner: Database["public"]["Enums"]["runner"]
          country: string
          created_at: string
          id: string
          name: string
          sandbox_id: string | null
        }
        ComputedFields: never
        Insert: {
          ai_runner?: Database["public"]["Enums"]["runner"]
          country: string
          created_at?: string
          id?: string
          name: string
          sandbox_id?: string | null
        }
        Update: {
          ai_runner?: Database["public"]["Enums"]["runner"]
          country?: string
          created_at?: string
          id?: string
          name?: string
          sandbox_id?: string | null
        }
        Relationships: []
      }
      session_items: {
        Row: {
          adapted: Database["public"]["Enums"]["item_adapt"] | null
          answer: string
          correct: boolean
          created_at: string
          difficulty: number
          id: string
          phase: Database["public"]["Enums"]["item_phase"]
          position: number
          question: NonNullable<Json>
          seconds: number
          session_id: string
        }
        ComputedFields: never
        Insert: {
          adapted?: Database["public"]["Enums"]["item_adapt"] | null
          answer: string
          correct: boolean
          created_at?: string
          difficulty: number
          id?: string
          phase: Database["public"]["Enums"]["item_phase"]
          position: number
          question: NonNullable<Json>
          seconds: number
          session_id: string
        }
        Update: {
          adapted?: Database["public"]["Enums"]["item_adapt"] | null
          answer?: string
          correct?: boolean
          created_at?: string
          difficulty?: number
          id?: string
          phase?: Database["public"]["Enums"]["item_phase"]
          position?: number
          question?: NonNullable<Json>
          seconds?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          child_id: string
          created_at: string
          finished_at: string | null
          id: string
          lesson_id: string | null
          minutes: number | null
          planned_for: string
          right: number | null
          status: Database["public"]["Enums"]["session_status"]
          warmup: NonNullable<Json>
          format: Database["public"]["Enums"]["lesson_format"] | null
          planned_minutes: number | null
          question_count: number | null
          topic_id: string | null
          topic_name: string | null
        }
        ComputedFields: never
        Insert: {
          child_id: string
          created_at?: string
          finished_at?: string | null
          id?: string
          lesson_id?: string | null
          minutes?: number | null
          planned_for: string
          right?: number | null
          status?: Database["public"]["Enums"]["session_status"]
          warmup?: NonNullable<Json>
          format?: Database["public"]["Enums"]["lesson_format"] | null
          planned_minutes?: number | null
          question_count?: number | null
          topic_id?: string | null
          topic_name?: string | null
        }
        Update: {
          child_id?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          lesson_id?: string | null
          minutes?: number | null
          planned_for?: string
          right?: number | null
          status?: Database["public"]["Enums"]["session_status"]
          warmup?: NonNullable<Json>
          format?: Database["public"]["Enums"]["lesson_format"] | null
          planned_minutes?: number | null
          question_count?: number | null
          topic_id?: string | null
          topic_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      tests: {
        Row: {
          class_id: string
          created_at: string
          id: string
          out_of: number
          title: string
          topic_ids: string[]
          written_on: string | null
        }
        ComputedFields: never
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          out_of: number
          title: string
          topic_ids?: string[]
          written_on?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          out_of?: number
          title?: string
          topic_ids?: string[]
          written_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tests_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          created_at: string
          family: string
          id: string
          map_id: string
          misconceptions: string[]
          name: string
          position: number
          prerequisite_ids: string[]
          term: number
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          family: string
          id?: string
          map_id: string
          misconceptions?: string[]
          name: string
          position: number
          prerequisite_ids?: string[]
          term: number
        }
        Update: {
          created_at?: string
          family?: string
          id?: string
          map_id?: string
          misconceptions?: string[]
          name?: string
          position?: number
          prerequisite_ids?: string[]
          term?: number
        }
        Relationships: [
          {
            foreignKeyName: "topics_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "curriculum_maps"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_see_child: { Args: { child: string }; Returns: boolean }
      claim_event: {
        Args: { runner: string }
        Returns: {
          attempts: number
          claimed_by: string | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          payload: NonNullable<Json>
          runner: Database["public"]["Enums"]["runner"]
          school_id: string
          status: Database["public"]["Enums"]["event_status"]
          type: string
        }[]
      }
      finish_event: {
        Args: {
          error_in: string
          event: string
          status_in: Database["public"]["Enums"]["event_status"]
        }
        Returns: undefined
      }
      heartbeat: {
        Args: { agents_in: Json; chosen_in: string; runner: string }
        Returns: undefined
      }
      is_child_user: { Args: { child: string }; Returns: boolean }
      my_role: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["user_role"]
      }
      my_school: { Args: Record<PropertyKey, never>; Returns: string }
      parent_of: { Args: { child: string }; Returns: boolean }
      retag_results: { Args: { map: string }; Returns: undefined }
      teaches_child: { Args: { child: string }; Returns: boolean }
      teaches_class: { Args: { cls: string }; Returns: boolean }
    }
    Enums: {
      activity_kind: "sport" | "club" | "music" | "art" | "other"
      attendance_status: "here" | "late" | "away"
      event_status: "queued" | "running" | "done" | "failed" | "cancelled"
      gap_stage: "new" | "practising" | "fixed"
      item_adapt: "easier" | "harder"
      item_phase: "warmup" | "try"
      lesson_format: "reading" | "diagram" | "audio"
      link_status: "pending" | "approved" | "declined"
      map_status: "draft" | "approved"
      need_kind:
        | "check_answer"
        | "unreadable_name"
        | "approve_map"
        | "approve_key"
        | "approve_link"
        | "confirm_scan"
      need_status: "open" | "done"
      obs_kind: "participation" | "confidence" | "effort" | "behaviour"
      paper_kind: "test" | "homework" | "textbook" | "report"
      paper_owner: "teacher" | "parent"
      paper_status: "queued" | "reading" | "needs_you" | "marked" | "failed"
      runner: "cloud" | "desktop"
      session_status: "planned" | "in_progress" | "done"
      user_role: "teacher" | "parent" | "learner"
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
      activity_kind: ["sport", "club", "music", "art", "other"],
      attendance_status: ["here", "late", "away"],
      event_status: ["queued", "running", "done", "failed", "cancelled"],
      gap_stage: ["new", "practising", "fixed"],
      item_adapt: ["easier", "harder"],
      item_phase: ["warmup", "try"],
      lesson_format: ["reading", "diagram", "audio"],
      link_status: ["pending", "approved", "declined"],
      map_status: ["draft", "approved"],
      need_kind: [
        "check_answer",
        "unreadable_name",
        "approve_map",
        "approve_key",
        "approve_link",
        "confirm_scan",
      ],
      need_status: ["open", "done"],
      obs_kind: ["participation", "confidence", "effort", "behaviour"],
      paper_kind: ["test", "homework", "textbook", "report"],
      paper_owner: ["teacher", "parent"],
      paper_status: ["queued", "reading", "needs_you", "marked", "failed"],
      runner: ["cloud", "desktop"],
      session_status: ["planned", "in_progress", "done"],
      user_role: ["teacher", "parent", "learner"],
    },
  },
} as const
