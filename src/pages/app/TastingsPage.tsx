import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface TastingRow {
  id: string;
  date: string;
  notes: string | null;
  cheeses: { id: string }[];
}

export default function TastingsPage() {
  const { profile } = useAuth();
  const [tastings, setTastings] = useState<TastingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    const fetchTastings = () =>
      supabase
        .from("tastings")
        .select("*, cheeses(id)")
        .order("date", { ascending: false })
        .then(({ data }) => {
          setTastings((data ?? []) as TastingRow[]);
          setLoading(false);
        });

    fetchTastings();

    const channel = supabase
      .channel("tastings-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "tastings" }, fetchTastings)
      .on("postgres_changes", { event: "*", schema: "public", table: "cheeses" }, fetchTastings)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) return <p className="text-center py-12 text-gray-400">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-amber-900">Tastings</h1>
        {profile?.role === "admin" && (
          <Button asChild size="sm">
            <Link to="/tastings/new">+ New Tasting</Link>
          </Button>
        )}
      </div>

      {!tastings.length && (
        <p className="text-gray-500 text-center py-12">No tastings yet.</p>
      )}

      <div className="space-y-3">
        {tastings.map((tasting) => (
          <Link key={tasting.id} to={`/tastings/${tasting.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-amber-100">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-semibold text-amber-900">{formatDate(tasting.date)}</p>
                  {tasting.notes && (
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{tasting.notes}</p>
                  )}
                </div>
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                  {tasting.cheeses.length} cheese{tasting.cheeses.length !== 1 ? "s" : ""}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
