export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      Chat: {
        Row: {
          id: string
          createdAt: string
          title: string
          userId: string
          visibility: 'public' | 'private'
        }
        Insert: {
          id?: string
          createdAt: string
          title: string
          userId: string
          visibility?: 'public' | 'private'
        }
        Update: {
          id?: string
          createdAt?: string
          title?: string
          userId?: string
          visibility?: 'public' | 'private'
        }
      }
      Message: {
        Row: {
          id: string
          chatId: string
          role: string
          content: Json
          createdAt: string
        }
        Insert: {
          id?: string
          chatId: string
          role: string
          content: Json
          createdAt: string
        }
        Update: {
          id?: string
          chatId?: string
          role?: string
          content?: Json
          createdAt?: string
        }
      }
      Document: {
        Row: {
          id: string
          createdAt: string
          title: string
          content: string | null
          kind: 'text' | 'code' | 'image' | 'sheet'
          userId: string
          chatId: string | null
        }
        Insert: {
          id?: string
          createdAt: string
          title: string
          content?: string | null
          kind?: 'text' | 'code' | 'image' | 'sheet'
          userId: string
          chatId?: string | null
        }
        Update: {
          id?: string
          createdAt?: string
          title?: string
          content?: string | null
          kind?: 'text' | 'code' | 'image' | 'sheet'
          userId?: string
          chatId?: string | null
        }
      }
      Suggestion: {
        Row: {
          id: string
          documentId: string
          documentCreatedAt: string
          originalText: string
          suggestedText: string
          description: string | null
          isResolved: boolean
          userId: string
          createdAt: string
        }
        Insert: {
          id?: string
          documentId: string
          documentCreatedAt: string
          originalText: string
          suggestedText: string
          description?: string | null
          isResolved?: boolean
          userId: string
          createdAt: string
        }
        Update: {
          id?: string
          documentId?: string
          documentCreatedAt?: string
          originalText?: string
          suggestedText?: string
          description?: string | null
          isResolved?: boolean
          userId?: string
          createdAt?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
} 