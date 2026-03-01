import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import type { Cheese, Review, Comment } from "@/lib/supabase/types";

interface ProfileMini {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

// ── Cheese page ────────────────────────────────────────────────────────────────

export default function CheesePage() {
  const { cheeseId } = useParams<{ cheeseId: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [cheese, setCheese] = useState<Cheese | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileMini>>({});
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showBack, setShowBack] = useState(false);

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
      setProfileMap(Object.fromEntries(((p ?? []) as ProfileMini[]).map((x) => [x.id, x])));
      setLoading(false);
    });
  }, [cheeseId]);

  const handleDelete = async () => {
    if (!cheese) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("cheeses").delete().eq("id", cheese.id);
    if (error) { toast.error("Failed to delete cheese"); setDeleting(false); return; }
    toast.success(`"${cheese.name}" deleted`);
    navigate(`/tastings/${cheese.tasting_id}`);
  };

  if (loading) return <p className="text-center py-12 text-gray-400">Loading...</p>;
  if (!cheese) return <p className="text-center py-12 text-gray-400">Cheese not found.</p>;

  const myReview = reviews.find((r) => r.user_id === user?.id) ?? null;
  const otherReviews = reviews.filter((r) => r.user_id !== user?.id);

  return (
    <div className="space-y-5">
      <Link to={`/tastings/${cheese.tasting_id}`} className="text-sm text-amber-700 hover:underline">
        ← Back to tasting
      </Link>

      <div className="flex gap-3 items-start">
        {cheese.front_image_url && (
          <div className="flex-1 rounded-xl overflow-hidden bg-amber-100 aspect-[4/7]">
            <img src={cheese.front_image_url} alt={`${cheese.name} front`} className="w-full h-full object-contain" />
          </div>
        )}
        <div className="flex-1 space-y-2 pt-1">
          <h1 className="text-xl font-bold text-amber-900 leading-tight">{cheese.name}</h1>
          <p className="text-gray-500 text-sm">
            {[cheese.region, cheese.country].filter(Boolean).join(", ")}
          </p>
          {cheese.milk_type && (
            <Badge variant="outline" className="text-xs">{cheese.milk_type} milk</Badge>
          )}
          {cheese.back_image_url && (
            <button
              onClick={() => setShowBack((v) => !v)}
              className="block text-xs text-amber-700 hover:underline mt-1"
            >
              {showBack ? "Hide back of card" : "View back of card"}
            </button>
          )}
        </div>
      </div>

      {showBack && cheese.back_image_url && (
        <div className="w-1/2 rounded-xl overflow-hidden bg-amber-100 aspect-[4/7]">
          <img src={cheese.back_image_url} alt={`${cheese.name} back`} className="w-full h-full object-contain" />
        </div>
      )}

      {cheese.description && (
        <p className="text-gray-700 text-sm leading-relaxed">{cheese.description}</p>
      )}

      {(cheese.food_pairings.length > 0 || cheese.wine_pairings.length > 0) && (
        <div className="space-y-2">
          {cheese.food_pairings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Food Pairings</p>
              <div className="flex flex-wrap gap-1">
                {cheese.food_pairings.map((p) => (
                  <Badge key={p} variant="secondary" className="bg-amber-100 text-amber-800">{p}</Badge>
                ))}
              </div>
            </div>
          )}
          {cheese.wine_pairings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Wine Pairings</p>
              <div className="flex flex-wrap gap-1">
                {cheese.wine_pairings.map((p) => (
                  <Badge key={p} variant="secondary" className="bg-purple-100 text-purple-800">🍷 {p}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {profile?.role === "admin" && (
        <div className="flex justify-end items-center gap-2 flex-wrap">
          {!confirmDelete ? (
            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={() => setConfirmDelete(true)}>
              Delete Cheese
            </Button>
          ) : (
            <>
              <span className="text-sm text-red-600">Delete this cheese?</span>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Yes, delete"}
              </Button>
            </>
          )}
        </div>
      )}

      <Separator />

      <ReviewSection
        cheeseId={cheeseId!}
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

// ── Review section ─────────────────────────────────────────────────────────────

interface ReviewProps {
  cheeseId: string;
  userId: string;
  myReview: Review | null;
  otherReviews: Review[];
  profileMap: Record<string, ProfileMini>;
  reviewCount: number;
  commentCount: number;
  comments: Comment[];
}

function ReviewSection({
  cheeseId, userId, myReview: initialMyReview, otherReviews,
  profileMap, reviewCount, commentCount, comments,
}: ReviewProps) {
  const supabase = createClient();
  const [myReview, setMyReview] = useState<Review | null>(initialMyReview);
  const [editing, setEditing] = useState(!initialMyReview);
  const [rating, setRating] = useState(initialMyReview?.rating ?? 0);
  const [isFavorite, setIsFavorite] = useState(initialMyReview?.is_favorite ?? false);
  const [body, setBody] = useState(initialMyReview?.body ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { data, error } = await supabase
      .from("reviews")
      .upsert(
        { cheese_id: cheeseId, user_id: userId, rating: rating || null, is_favorite: isFavorite, body: body || null, updated_at: new Date().toISOString() },
        { onConflict: "cheese_id,user_id" }
      )
      .select()
      .single();
    setSaving(false);
    if (error) { toast.error("Failed to save review"); return; }
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
      <Card className="border-2 border-amber-300 bg-amber-50">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                <AvatarFallback className="text-xs bg-amber-200 text-amber-900">{initials}</AvatarFallback>
              </Avatar>
              <span className="font-medium text-sm">
                {profile?.full_name ?? "You"} <span className="text-gray-400 font-normal">(you)</span>
              </span>
            </div>
            {!editing && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-amber-700">
                ✏ Edit
              </Button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} onClick={() => setRating(star === rating ? 0 : star)}
                    className={`text-2xl transition-transform hover:scale-110 ${star <= rating ? "text-amber-400" : "text-gray-300"}`}>
                    ★
                  </button>
                ))}
                <button onClick={() => setIsFavorite(!isFavorite)}
                  className={`ml-3 text-2xl transition-transform hover:scale-110 ${isFavorite ? "text-amber-500" : "text-gray-300"}`}
                  title="Mark as favorite">♥</button>
              </div>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your review..." rows={3} />
              <div className="flex gap-2">
                {myReview && (
                  <Button variant="outline" size="sm" onClick={() => { setEditing(false); setRating(myReview.rating ?? 0); setBody(myReview.body ?? ""); setIsFavorite(myReview.is_favorite); }}>
                    Cancel
                  </Button>
                )}
                <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Review"}</Button>
              </div>
            </div>
          ) : myReview ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <StarRating rating={myReview.rating ?? 0} />
                {myReview.is_favorite && <span className="text-amber-500 text-sm">♥ Favorite</span>}
              </div>
              {myReview.body && <p className="text-sm text-gray-700">{myReview.body}</p>}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">No review yet. Tap Edit to add one.</p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="reviews">
        <TabsList className="w-full">
          <TabsTrigger value="reviews" className="flex-1">Reviews ({reviewCount})</TabsTrigger>
          <TabsTrigger value="discussion" className="flex-1">Discussion ({commentCount})</TabsTrigger>
        </TabsList>
        <TabsContent value="reviews" className="space-y-3 mt-3">
          {otherReviews.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No reviews from others yet.</p>
          ) : otherReviews.map((review) => {
            const p = profileMap[review.user_id];
            const ini = p?.full_name ? p.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2) : "?";
            return (
              <Card key={review.id} className="border-amber-100">
                <CardContent className="pt-4 pb-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      {p?.avatar_url && <AvatarImage src={p.avatar_url} />}
                      <AvatarFallback className="text-xs bg-gray-100">{ini}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm">{p?.full_name ?? "Member"}</span>
                    {review.is_favorite && <span className="text-amber-500 text-xs">♥</span>}
                  </div>
                  <StarRating rating={review.rating ?? 0} />
                  {review.body && <p className="text-sm text-gray-700">{review.body}</p>}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
        <TabsContent value="discussion" className="mt-3">
          <DiscussionSection cheeseId={cheeseId} userId={userId} initialComments={comments} profileMap={profileMap} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={`text-sm ${star <= rating ? "text-amber-400" : "text-gray-200"}`}>★</span>
      ))}
    </div>
  );
}

// ── Discussion section ─────────────────────────────────────────────────────────

interface ThreadedComment extends Comment { replies: Comment[]; }

function buildThreads(comments: Comment[]): ThreadedComment[] {
  const byId = new Map<string, ThreadedComment>();
  const roots: ThreadedComment[] = [];
  for (const c of comments) byId.set(c.id, { ...c, replies: [] });
  for (const c of byId.values()) {
    if (c.parent_id) byId.get(c.parent_id)?.replies.push(c);
    else roots.push(c);
  }
  return roots;
}

function DiscussionSection({ cheeseId, userId, initialComments, profileMap }: {
  cheeseId: string; userId: string; initialComments: Comment[]; profileMap: Record<string, ProfileMini>;
}) {
  const supabase = createClient();
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newBody, setNewBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const postComment = async (body: string, parentId: string | null = null) => {
    if (!body.trim()) return;
    setPosting(true);
    const { data, error } = await supabase
      .from("comments")
      .insert({ cheese_id: cheeseId, user_id: userId, body: body.trim(), parent_id: parentId })
      .select().single();
    setPosting(false);
    if (error) { toast.error("Failed to post comment"); return; }
    setComments((prev) => [...prev, data as Comment]);
    if (parentId) { setReplyingTo(null); setReplyBody(""); } else { setNewBody(""); }
  };

  const threads = buildThreads(comments);

  return (
    <div className="space-y-4">
      {threads.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">No discussion yet. Start the conversation!</p>
      )}
      {threads.map((thread) => (
        <div key={thread.id} className="space-y-2">
          <CommentBubble comment={thread} profileMap={profileMap} userId={userId} onReply={() => setReplyingTo(thread.id === replyingTo ? null : thread.id)} />
          {thread.replies.length > 0 && (
            <div className="ml-8 space-y-2 border-l-2 border-amber-100 pl-3">
              {thread.replies.map((reply) => (
                <CommentBubble key={reply.id} comment={reply} profileMap={profileMap} userId={userId} onReply={() => setReplyingTo(thread.id === replyingTo ? null : thread.id)} />
              ))}
            </div>
          )}
          {replyingTo === thread.id && (
            <div className="ml-8 space-y-2">
              <Textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Write a reply..." rows={2} autoFocus />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setReplyingTo(null)}>Cancel</Button>
                <Button size="sm" onClick={() => postComment(replyBody, thread.id)} disabled={posting || !replyBody.trim()}>Reply</Button>
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="space-y-2 pt-2 border-t border-amber-100">
        <Textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} placeholder="Add to the discussion..." rows={2} />
        <Button size="sm" onClick={() => postComment(newBody)} disabled={posting || !newBody.trim()}>
          {posting ? "Posting..." : "Post"}
        </Button>
      </div>
    </div>
  );
}

function CommentBubble({ comment, profileMap, userId, onReply }: {
  comment: Comment; profileMap: Record<string, ProfileMini>; userId: string; onReply: () => void;
}) {
  const p = profileMap[comment.user_id];
  const isOwn = comment.user_id === userId;
  const initials = p?.full_name ? p.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2) : "?";
  return (
    <div className="flex gap-2">
      <Avatar className="h-6 w-6 flex-shrink-0 mt-0.5">
        {p?.avatar_url && <AvatarImage src={p.avatar_url} />}
        <AvatarFallback className="text-xs bg-gray-100">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold">
            {p?.full_name ?? "Member"}{isOwn && <span className="text-gray-400 font-normal ml-1">(you)</span>}
          </span>
          <span className="text-xs text-gray-400">{new Date(comment.created_at).toLocaleDateString()}</span>
        </div>
        <p className="text-sm text-gray-700 mt-0.5">{comment.body}</p>
        <button onClick={onReply} className="text-xs text-amber-600 hover:underline mt-0.5">Reply</button>
      </div>
    </div>
  );
}
