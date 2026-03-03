import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { Tasting, Cheese } from "@/lib/supabase/types";

type CheeseWithReviews = Cheese & {
  reviews: { rating: number | null; is_favorite: boolean; user_id: string }[];
};

type TastingCheeseJoin = { cheeses: CheeseWithReviews | null };

export default function TastingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [tasting, setTasting] = useState<Tasting | null>(null);
  const [cheeses, setCheeses] = useState<CheeseWithReviews[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showChooser, setShowChooser] = useState(false);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();

    const fetchData = () =>
      Promise.all([
        supabase.from("tastings").select("*").eq("id", id).single(),
        supabase
          .from("tasting_cheeses")
          .select("cheeses(*, reviews(rating, is_favorite, user_id))")
          .eq("tasting_id", id)
          .order("created_at"),
      ]).then(([{ data: t }, { data: tc }]) => {
        setTasting(t as Tasting | null);
        const cheeseList = ((tc ?? []) as TastingCheeseJoin[])
          .map((row) => row.cheeses)
          .filter((c): c is CheeseWithReviews => c != null);
        setCheeses(cheeseList);
        setLoading(false);
      });

    fetchData();

    // Clear any pending notifications for this tasting
    if (user?.id) {
      supabase.from("notifications").delete().eq("user_id", user.id).eq("ref_id", id).then(() => {});
    }

    const channel = supabase
      .channel(`tasting-detail-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tastings", filter: `id=eq.${id}` }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasting_cheeses", filter: `tasting_id=eq.${id}` }, fetchData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const handleDeleteTasting = async () => {
    if (!id) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("tastings").delete().eq("id", id);
    if (error) { toast.error("Failed to delete tasting"); setDeleting(false); return; }
    toast.success("Tasting deleted");
    navigate("/tastings");
  };

  if (loading) return <p className="text-center py-12 text-gray-400">Loading...</p>;
  if (!tasting) return <p className="text-center py-12 text-gray-400">Tasting not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => navigate(-1)} className="text-sm text-amber-700 hover:underline">← Back</button>
        <div className="flex items-start justify-between gap-2 mt-2">
          <h1 className="text-2xl font-bold text-amber-900">{formatDate(tasting.date)}</h1>
          {profile?.role === "admin" && (
            <div className="flex items-center gap-2 flex-wrap justify-end flex-shrink-0">
              <Button asChild size="sm">
                <Link to={`/tastings/${id}/cheeses/new`}>📷 Scan New Card</Link>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowChooser((v) => !v)}>
                Add Existing
              </Button>
              {!confirmDelete ? (
                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setConfirmDelete(true)}>
                  Delete Tasting
                </Button>
              ) : (
                <>
                  <span className="text-xs text-red-600 whitespace-nowrap">
                    Delete with all {cheeses.length} cheese{cheeses.length !== 1 ? "s" : ""}?
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                  <Button variant="destructive" size="sm" onClick={handleDeleteTasting} disabled={deleting}>
                    {deleting ? "Deleting…" : "Yes, delete"}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        {tasting.notes && <p className="text-gray-600 mt-1">{tasting.notes}</p>}
      </div>

      {showChooser && (
        <ExistingCheeseChooser
          tastingId={id!}
          alreadyAdded={cheeses.map((c) => c.id)}
          onDone={() => setShowChooser(false)}
        />
      )}

      <div className="space-y-3">
        {cheeses.map((cheese) => {
          const myReview = cheese.reviews?.find((r) => r.user_id === user?.id);
          const ratedReviews = cheese.reviews?.filter((r) => r.rating) ?? [];
          const avgRating = ratedReviews.length
            ? (ratedReviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratedReviews.length).toFixed(1)
            : null;

          return (
            <Link key={cheese.id} to={`/cheeses/${cheese.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer border-amber-100">
                <CardContent className="flex gap-3 py-4">
                  {cheese.front_image_url && (
                    <div className="w-10 aspect-[4/7] rounded-lg overflow-hidden flex-shrink-0 bg-amber-100">
                      <img
                        src={cheese.front_image_url}
                        alt={cheese.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-amber-900">{cheese.name}</p>
                      {myReview?.is_favorite && <span className="text-amber-400 text-lg">★</span>}
                    </div>
                    <p className="text-sm text-gray-500">
                      {[cheese.region, cheese.country].filter(Boolean).join(", ")}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {cheese.milk_type && (
                        <Badge variant="outline" className="text-xs">{cheese.milk_type}</Badge>
                      )}
                      {avgRating && <span className="text-xs text-gray-500">★ {avgRating} avg</span>}
                      {myReview?.rating && (
                        <span className="text-xs text-amber-700 font-medium">You: {myReview.rating}/5</span>
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

// ─── ExistingCheeseChooser ────────────────────────────────────────────────────

function ExistingCheeseChooser({
  tastingId,
  alreadyAdded,
  onDone,
}: {
  tastingId: string;
  alreadyAdded: string[];
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const [cheeses, setCheeses] = useState<{ id: string; name: string; country: string | null; milk_type: string | null }[]>([]);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .from("cheeses")
      .select("id, name, country, milk_type")
      .order("name")
      .then(({ data }) => setCheeses((data ?? []) as typeof cheeses));
  }, []);

  const filtered = cheeses
    .filter((c) => !alreadyAdded.includes(c.id))
    .filter((c) => !search.trim() || c.name.toLowerCase().includes(search.toLowerCase()));

  const handleSelect = async (cheese: typeof cheeses[0]) => {
    setAdding(cheese.id);
    await createClient()
      .from("tasting_cheeses")
      .upsert({ tasting_id: tastingId, cheese_id: cheese.id }, { onConflict: "tasting_id,cheese_id", ignoreDuplicates: true });
    navigate(`/cheeses/${cheese.id}`);
  };

  return (
    <div className="border border-amber-200 rounded-xl p-4 space-y-3 bg-amber-50/50">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-amber-900">Add existing cheese</p>
        <button className="text-xs text-gray-400 hover:text-gray-600" onClick={onDone}>✕</button>
      </div>
      <Input
        placeholder="Search cheeses..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {filtered.map((cheese) => (
          <button
            key={cheese.id}
            className="w-full text-left border border-amber-100 rounded-lg px-3 py-2 hover:bg-amber-50 transition-colors disabled:opacity-50 bg-white"
            disabled={adding === cheese.id}
            onClick={() => handleSelect(cheese)}
          >
            <p className="font-medium text-amber-900 text-sm">{cheese.name}</p>
            <p className="text-xs text-gray-500">{[cheese.milk_type, cheese.country].filter(Boolean).join(" · ")}</p>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            {search.trim() ? `No cheeses match "${search}"` : "All cheeses are already in this tasting."}
          </p>
        )}
      </div>
    </div>
  );
}
