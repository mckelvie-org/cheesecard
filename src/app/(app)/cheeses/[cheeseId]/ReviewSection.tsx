"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import type { Review, Comment } from "@/lib/supabase/types";
import DiscussionSection from "./DiscussionSection";

interface ProfileMini {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Props {
  cheeseId: string;
  userId: string;
  myReview: Review | null;
  otherReviews: Review[];
  profileMap: Record<string, ProfileMini>;
  reviewCount: number;
  commentCount: number;
  comments: Comment[];
}

export default function ReviewSection({
  cheeseId,
  userId,
  myReview: initialMyReview,
  otherReviews,
  profileMap,
  reviewCount,
  commentCount,
  comments,
}: Props) {
  const supabase = createClient();
  const [myReview, setMyReview] = useState<Review | null>(initialMyReview);
  const [editing, setEditing] = useState(!initialMyReview);
  const [rating, setRating] = useState(initialMyReview?.rating ?? 0);
  const [isFavorite, setIsFavorite] = useState(
    initialMyReview?.is_favorite ?? false
  );
  const [body, setBody] = useState(initialMyReview?.body ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { data, error } = await supabase
      .from("reviews")
      .upsert(
        {
          cheese_id: cheeseId,
          user_id: userId,
          rating: rating || null,
          is_favorite: isFavorite,
          body: body || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "cheese_id,user_id" }
      )
      .select()
      .single();

    setSaving(false);
    if (error) {
      toast.error("Failed to save review");
      return;
    }
    setMyReview(data as Review);
    setEditing(false);
    toast.success("Review saved");
  };

  const profile = profileMap[userId];
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)
    : "?";

  return (
    <div className="space-y-4">
      {/* Pinned own review */}
      <Card className="border-2 border-amber-300 bg-amber-50">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7">
                {profile?.avatar_url && (
                  <AvatarImage src={profile.avatar_url} />
                )}
                <AvatarFallback className="text-xs bg-amber-200 text-amber-900">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-sm">
                {profile?.full_name ?? "You"}{" "}
                <span className="text-gray-400 font-normal">(you)</span>
              </span>
            </div>
            {!editing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
                className="text-amber-700"
              >
                ✏ Edit
              </Button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star === rating ? 0 : star)}
                    className={`text-2xl transition-transform hover:scale-110 ${
                      star <= rating ? "text-amber-400" : "text-gray-300"
                    }`}
                  >
                    ★
                  </button>
                ))}
                <button
                  onClick={() => setIsFavorite(!isFavorite)}
                  className={`ml-3 text-2xl transition-transform hover:scale-110 ${
                    isFavorite ? "text-amber-500" : "text-gray-300"
                  }`}
                  title="Mark as favorite"
                >
                  ♥
                </button>
              </div>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your review..."
                rows={3}
              />
              <div className="flex gap-2">
                {myReview && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(false);
                      setRating(myReview.rating ?? 0);
                      setBody(myReview.body ?? "");
                      setIsFavorite(myReview.is_favorite);
                    }}
                  >
                    Cancel
                  </Button>
                )}
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save Review"}
                </Button>
              </div>
            </div>
          ) : myReview ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <StarRating rating={myReview.rating ?? 0} />
                {myReview.is_favorite && (
                  <span className="text-amber-500 text-sm">♥ Favorite</span>
                )}
              </div>
              {myReview.body && (
                <p className="text-sm text-gray-700">{myReview.body}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">No review yet. Tap Edit to add one.</p>
          )}
        </CardContent>
      </Card>

      {/* Tabs for other reviews and discussion */}
      <Tabs defaultValue="reviews">
        <TabsList className="w-full">
          <TabsTrigger value="reviews" className="flex-1">
            Reviews ({reviewCount})
          </TabsTrigger>
          <TabsTrigger value="discussion" className="flex-1">
            Discussion ({commentCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reviews" className="space-y-3 mt-3">
          {otherReviews.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              No reviews from others yet.
            </p>
          ) : (
            otherReviews.map((review) => {
              const p = profileMap[review.user_id];
              const ini = p?.full_name
                ? p.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)
                : "?";
              return (
                <Card key={review.id} className="border-amber-100">
                  <CardContent className="pt-4 pb-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        {p?.avatar_url && <AvatarImage src={p.avatar_url} />}
                        <AvatarFallback className="text-xs bg-gray-100">
                          {ini}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">
                        {p?.full_name ?? "Member"}
                      </span>
                      {review.is_favorite && (
                        <span className="text-amber-500 text-xs">♥</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StarRating rating={review.rating ?? 0} />
                    </div>
                    {review.body && (
                      <p className="text-sm text-gray-700">{review.body}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="discussion" className="mt-3">
          <DiscussionSection
            cheeseId={cheeseId}
            userId={userId}
            initialComments={comments}
            profileMap={profileMap}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={`text-sm ${star <= rating ? "text-amber-400" : "text-gray-200"}`}
        >
          ★
        </span>
      ))}
    </div>
  );
}
