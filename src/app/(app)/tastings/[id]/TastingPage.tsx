"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { Tasting, Cheese } from "@/lib/supabase/types";

type CheeseWithReviews = Cheese & {
  reviews: { rating: number | null; is_favorite: boolean; user_id: string }[];
};

export default function TastingPage() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const [tasting, setTasting] = useState<Tasting | null>(null);
  const [cheeses, setCheeses] = useState<CheeseWithReviews[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    Promise.all([
      supabase.from("tastings").select("*").eq("id", id).single(),
      supabase
        .from("cheeses")
        .select("*, reviews(rating, is_favorite, user_id)")
        .eq("tasting_id", id)
        .order("created_at"),
    ]).then(([{ data: t }, { data: c }]) => {
      setTasting(t as Tasting | null);
      setCheeses((c ?? []) as CheeseWithReviews[]);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <p className="text-center py-12 text-gray-400">Loading...</p>;
  if (!tasting) return <p className="text-center py-12 text-gray-400">Tasting not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-amber-700 hover:underline">
          ← All tastings
        </Link>
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-2xl font-bold text-amber-900">
            {formatDate(tasting.date)}
          </h1>
          {profile?.role === "admin" && (
            <Button asChild size="sm">
              <Link href={`/tastings/${id}/cheeses/new`}>+ Add Cheese</Link>
            </Button>
          )}
        </div>
        {tasting.notes && (
          <p className="text-gray-600 mt-1">{tasting.notes}</p>
        )}
      </div>

      <div className="space-y-3">
        {cheeses.map((cheese) => {
          const myReview = cheese.reviews?.find((r) => r.user_id === user?.id);
          const ratedReviews = cheese.reviews?.filter((r) => r.rating) ?? [];
          const avgRating = ratedReviews.length
            ? (
                ratedReviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) /
                ratedReviews.length
              ).toFixed(1)
            : null;

          return (
            <Link key={cheese.id} href={`/cheeses/${cheese.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer border-amber-100">
                <CardContent className="flex gap-3 py-4">
                  {cheese.front_image_url && (
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-amber-100">
                      <Image
                        src={cheese.front_image_url}
                        alt={cheese.name}
                        width={64}
                        height={64}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-amber-900">{cheese.name}</p>
                      {myReview?.is_favorite && (
                        <span className="text-amber-400 text-lg">★</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {[cheese.region, cheese.country].filter(Boolean).join(", ")}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {cheese.milk_type && (
                        <Badge variant="outline" className="text-xs">
                          {cheese.milk_type}
                        </Badge>
                      )}
                      {avgRating && (
                        <span className="text-xs text-gray-500">★ {avgRating} avg</span>
                      )}
                      {myReview?.rating && (
                        <span className="text-xs text-amber-700 font-medium">
                          You: {myReview.rating}/5
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {!cheeses.length && (
        <p className="text-gray-500 text-center py-12">No cheeses added yet.</p>
      )}
    </div>
  );
}
