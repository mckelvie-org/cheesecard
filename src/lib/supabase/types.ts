export type Role = "pending" | "member" | "admin";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: Role;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: Role;
          created_at?: string;
        };
        Update: {
          full_name?: string | null;
          avatar_url?: string | null;
          role?: Role;
        };
        Relationships: [];
      };
      tastings: {
        Row: {
          id: string;
          date: string;
          notes: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          notes?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          date?: string;
          notes?: string | null;
        };
        Relationships: [];
      };
      cheeses: {
        Row: {
          id: string;
          tasting_id: string;
          name: string;
          country: string | null;
          region: string | null;
          milk_type: string | null;
          description: string | null;
          food_pairings: string[];
          wine_pairings: string[];
          front_image_url: string | null;
          back_image_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tasting_id: string;
          name: string;
          country?: string | null;
          region?: string | null;
          milk_type?: string | null;
          description?: string | null;
          food_pairings?: string[];
          wine_pairings?: string[];
          front_image_url?: string | null;
          back_image_url?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          country?: string | null;
          region?: string | null;
          milk_type?: string | null;
          description?: string | null;
          food_pairings?: string[];
          wine_pairings?: string[];
          front_image_url?: string | null;
          back_image_url?: string | null;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          cheese_id: string;
          user_id: string;
          rating: number | null;
          is_favorite: boolean;
          body: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cheese_id: string;
          user_id: string;
          rating?: number | null;
          is_favorite?: boolean;
          body?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          rating?: number | null;
          is_favorite?: boolean;
          body?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          cheese_id: string;
          user_id: string;
          body: string;
          parent_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          cheese_id: string;
          user_id: string;
          body: string;
          parent_id?: string | null;
          created_at?: string;
        };
        Update: {
          body?: string;
        };
        Relationships: [];
      };
      tasting_photos: {
        Row: {
          id: string;
          tasting_id: string;
          user_id: string;
          photo_url: string;
          caption: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tasting_id: string;
          user_id: string;
          photo_url: string;
          caption?: string | null;
          created_at?: string;
        };
        Update: {
          caption?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      role: Role;
    };
    CompositeTypes: Record<string, never>;
  };
}

// Convenience row types
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Tasting = Database["public"]["Tables"]["tastings"]["Row"];
export type Cheese = Database["public"]["Tables"]["cheeses"]["Row"];
export type Review = Database["public"]["Tables"]["reviews"]["Row"];
export type Comment = Database["public"]["Tables"]["comments"]["Row"];
export type TastingPhoto = Database["public"]["Tables"]["tasting_photos"]["Row"];
