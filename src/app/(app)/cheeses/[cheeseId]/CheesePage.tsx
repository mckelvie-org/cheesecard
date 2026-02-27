"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import ReviewSection from "./ReviewSection";
import type { Cheese, Review, Comment } from "@/lib/supabase/types";

interface ProfileMini {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export default function CheesePage() {
  const { cheeseId } = useParams<{ cheeseId: string }>();
  const { user } = useAuth();
  const [cheese, setCheese] = useState<Cheese | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileMini>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cheeseId) return;
    const supabase = createClient();
    Promise.all([
      supabase.from("cheeses").select("*").eq("id", cheeseId).single(),
      supabase.from("reviews").select("*").eq("cheese_id", cheeseId).order("created_at"),
      supabase.from("comments").select("*").eq("cheese_id", cheeseId).order("created_at"),
      supabase.from("profiles").select("id, full_name, avatar_url").in("role", ["member", "admin"]),
    ]).then(([{ data: c }, { data: r }, { data: co }, { data: p }]) => {
      setCheese(c as Cheese | null);
      setReviews((r ?? []) as Review[]);
      setComments((co ?? []) as Comment[]);
      setProfileMap(
        Object.fromEntries(((p ?? []) as ProfileMini[]).map((x) => [x.id, x]))
      );
      setLoading(false);
    });
  }, [cheeseId]);

  if (loading) return <p className="text-center py-12 text-gray-400">Loading...</p>;
  if (!cheese) return <p className="text-center py-12 text-gray-400">Cheese not found.</p>;

  const myReview = reviews.find((r) => r.user_id === user?.id) ?? null;
  const otherReviews = reviews.filter((r) => r.user_id !== user?.id);

  return (
    <div className="space-y-5">
      <Link href={`/tastings/${cheese.tasting_id}`} className="text-sm text-amber-700 hover:underline">
        ← Back to tasting
      </Link>

      {(cheese.front_image_url || cheese.back_image_url) && (
        <div className="flex gap-3">
          {cheese.front_image_url && (
            <div className="flex-1 rounded-xl overflow-hidden bg-amber-100 aspect-square">
              <Image
                src={cheese.front_image_url}
                alt={`${cheese.name} front`}
                width={400}
                height={400}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          {cheese.back_image_url && (
            <div className="flex-1 rounded-xl overflow-hidden bg-amber-100 aspect-square">
              <Image
                src={cheese.back_image_url}
                alt={`${cheese.name} back`}
                width={400}
                height={400}
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-amber-900">{cheese.name}</h1>
        <p className="text-gray-500 mt-0.5">
          {[cheese.region, cheese.country].filter(Boolean).join(", ")}
        </p>
        {cheese.milk_type && (
          <Badge variant="outline" className="mt-2">{cheese.milk_type} milk</Badge>
        )}
      </div>

      {cheese.description && (
        <p className="text-gray-700 text-sm leading-relaxed">{cheese.description}</p>
      )}

      {(cheese.food_pairings.length > 0 || cheese.wine_pairings.length > 0) && (
        <div className="space-y-2">
          {cheese.food_pairings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Food Pairings
              </p>
              <div className="flex flex-wrap gap-1">
                {cheese.food_pairings.map((p) => (
                  <Badge key={p} variant="secondary" className="bg-amber-100 text-amber-800">{p}</Badge>
                ))}
              </div>
            </div>
          )}
          {cheese.wine_pairings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Wine Pairings
              </p>
              <div className="flex flex-wrap gap-1">
                {cheese.wine_pairings.map((p) => (
                  <Badge key={p} variant="secondary" className="bg-purple-100 text-purple-800">
                    🍷 {p}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Separator />

      <ReviewSection
        cheeseId={cheeseId}
        userId={user?.id ?? ""}
        myReview={myReview}
        otherReviews={otherReviews}
        profileMap={profileMap}
        reviewCount={reviews.length}
        commentCount={comments.length}
        comments={comments}
      />
    </div>
  );
}
