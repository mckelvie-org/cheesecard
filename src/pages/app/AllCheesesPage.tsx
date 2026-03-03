import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TastingEntry {
  tasting_id: string;
  created_at: string;
  tastings: { id: string; date: string } | null;
}

interface CheeseRow {
  id: string;
  name: string;
  milk_type: string | null;
  country: string | null;
  region: string | null;
  front_image_url: string | null;
  tasting_cheeses: TastingEntry[];
  reviews: { rating: number | null; is_favorite: boolean; user_id: string }[];
}

type SortColumn =
  | "name"
  | "tasting_date"
  | "my_rating"
  | "my_favorite"
  | "avg_rating"
  | "milk_type"
  | "country"
  | "region";
type SortDirection = "asc" | "desc";
interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

interface GroupedRow {
  mode: "grouped";
  id: string;
  name: string;
  milk_type: string | null;
  country: string | null;
  region: string | null;
  front_image_url: string | null;
  tastings: { tasting_id: string; date: string }[];
  myRating: number | null;
  myFavorite: boolean;
  avgRating: number | null;
}

interface FlatRow {
  mode: "flat";
  id: string;
  name: string;
  milk_type: string | null;
  country: string | null;
  region: string | null;
  front_image_url: string | null;
  tasting_id: string;
  tasting_date: string;
  myRating: number | null;
  myFavorite: boolean;
  avgRating: number | null;
}

type DisplayRow = GroupedRow | FlatRow;

// ─── Row builders ─────────────────────────────────────────────────────────────

function buildGroupedRows(cheeses: CheeseRow[], userId: string): GroupedRow[] {
  return cheeses.map((c) => {
    const myReview = c.reviews.find((r) => r.user_id === userId);
    const ratedReviews = c.reviews.filter((r) => r.rating != null);
    const avgRating =
      ratedReviews.length > 0
        ? ratedReviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratedReviews.length
        : null;
    const tastings = c.tasting_cheeses
      .filter((tc) => tc.tastings != null)
      .map((tc) => ({ tasting_id: tc.tastings!.id, date: tc.tastings!.date }))
      .sort((a, b) => (a.date > b.date ? -1 : 1));
    return {
      mode: "grouped",
      id: c.id,
      name: c.name,
      milk_type: c.milk_type,
      country: c.country,
      region: c.region,
      front_image_url: c.front_image_url,
      tastings,
      myRating: myReview?.rating ?? null,
      myFavorite: myReview?.is_favorite ?? false,
      avgRating,
    };
  });
}

function buildFlatRows(cheeses: CheeseRow[], userId: string): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const c of cheeses) {
    const myReview = c.reviews.find((r) => r.user_id === userId);
    const ratedReviews = c.reviews.filter((r) => r.rating != null);
    const avgRating =
      ratedReviews.length > 0
        ? ratedReviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratedReviews.length
        : null;
    for (const tc of c.tasting_cheeses) {
      if (!tc.tastings) continue;
      rows.push({
        mode: "flat",
        id: c.id,
        name: c.name,
        milk_type: c.milk_type,
        country: c.country,
        region: c.region,
        front_image_url: c.front_image_url,
        tasting_id: tc.tastings.id,
        tasting_date: tc.tastings.date,
        myRating: myReview?.rating ?? null,
        myFavorite: myReview?.is_favorite ?? false,
        avgRating,
      });
    }
  }
  return rows;
}

function sortRows<T extends DisplayRow>(rows: T[], sort: SortState): T[] {
  return [...rows].sort((a, b) => {
    const aVal = getSortValue(a, sort.column);
    const bVal = getSortValue(b, sort.column);
    // Nulls always last regardless of direction
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sort.direction === "asc" ? cmp : -cmp;
  });
}

function getSortValue(row: DisplayRow, col: SortColumn): string | number | null {
  switch (col) {
    case "name":
      return row.name.toLowerCase();
    case "tasting_date":
      return row.mode === "flat" ? row.tasting_date : null;
    case "my_rating":
      return row.myRating;
    case "my_favorite":
      return row.myFavorite ? 1 : 0;
    case "avg_rating":
      return row.avgRating;
    case "milk_type":
      return row.milk_type?.toLowerCase() ?? null;
    case "country":
      return row.country?.toLowerCase() ?? null;
    case "region":
      return row.region?.toLowerCase() ?? null;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SortHeader({
  col,
  label,
  sort,
  onSort,
  className,
}: {
  col: SortColumn;
  label: string;
  sort: SortState;
  onSort: (col: SortColumn) => void;
  className?: string;
}) {
  const active = sort.column === col;
  return (
    <th
      className={`px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-amber-800 ${active ? "text-amber-800" : ""} ${className ?? ""}`}
      onClick={() => onSort(col)}
    >
      {label}
      <span className="ml-0.5 inline-block w-3 text-center">
        {active ? (sort.direction === "asc" ? "↑" : "↓") : ""}
      </span>
    </th>
  );
}

function TastingDateCell({ tastings }: { tastings: { tasting_id: string; date: string }[] }) {
  if (tastings.length === 0) return <span className="text-gray-300">—</span>;
  const MAX_VISIBLE = 5;
  const visible = tastings.slice(0, MAX_VISIBLE);
  const extra = tastings.slice(MAX_VISIBLE);
  return (
    <div className="flex flex-col gap-0.5">
      {visible.map((t) => (
        <Link
          key={t.tasting_id}
          to={`/tastings/${t.tasting_id}`}
          className="text-amber-700 hover:underline text-xs whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          {formatDate(t.date)}
        </Link>
      ))}
      {extra.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="text-xs text-gray-400 hover:text-amber-700 text-left"
              onClick={(e) => e.stopPropagation()}
            >
              +{extra.length} more
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-2" align="start">
            <div className="flex flex-col gap-1">
              {tastings.map((t) => (
                <Link
                  key={t.tasting_id}
                  to={`/tastings/${t.tasting_id}`}
                  className="text-amber-700 hover:underline text-xs whitespace-nowrap"
                >
                  {formatDate(t.date)}
                </Link>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function CheeseTableRow({ row }: { row: DisplayRow }) {
  const dateCell =
    row.mode === "flat" ? (
      <Link
        to={`/tastings/${row.tasting_id}`}
        className="text-amber-700 hover:underline text-xs whitespace-nowrap"
        onClick={(e) => e.stopPropagation()}
      >
        {formatDate(row.tasting_date)}
      </Link>
    ) : (
      <TastingDateCell tastings={row.tastings} />
    );

  return (
    <tr className="border-b border-gray-100 hover:bg-amber-50/50 transition-colors">
      <td className="px-2 py-2">
        <div className="flex items-center gap-2">
          <Link to={`/cheeses/${row.id}`} className="flex-shrink-0">
            {row.front_image_url ? (
              <div className="rounded overflow-hidden bg-amber-50 border border-amber-100"
                   style={{ width: 24, height: 42 }}>
                <img src={row.front_image_url} alt="" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="rounded bg-amber-50 border border-amber-100"
                   style={{ width: 24, height: 42 }} />
            )}
          </Link>
          <Link to={`/cheeses/${row.id}`} className="font-medium text-amber-900 hover:underline text-sm">
            {row.name}
          </Link>
        </div>
      </td>
      <td className="px-2 py-2 text-sm text-gray-600">
        {row.myRating != null ? `${row.myRating}/5` : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-2 py-2 text-base">
        {row.myFavorite ? (
          <span className="text-amber-500">♥</span>
        ) : (
          <span className="text-gray-200">♡</span>
        )}
      </td>
      <td className="px-2 py-2 text-sm text-gray-600">
        {row.avgRating != null ? row.avgRating.toFixed(1) : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-2 py-2">
        {row.milk_type ? (
          <Badge variant="outline" className="text-xs">{row.milk_type}</Badge>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </td>
      <td className="px-2 py-2 text-xs text-gray-600">{row.country ?? <span className="text-gray-300">—</span>}</td>
      <td className="px-2 py-2 text-xs text-gray-600">{row.region ?? <span className="text-gray-300">—</span>}</td>
      <td className="px-2 py-2 text-sm">{dateCell}</td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AllCheesesPage() {
  const { user } = useAuth();
  const [cheeses, setCheeses] = useState<CheeseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortState>({ column: "name", direction: "asc" });

  useEffect(() => {
    const supabase = createClient();

    const fetchCheeses = () =>
      supabase
        .from("cheeses")
        .select(
          "id, name, milk_type, country, region, front_image_url, tasting_cheeses(tasting_id, created_at, tastings(id, date)), reviews(rating, is_favorite, user_id)"
        )
        .order("name")
        .then(({ data }) => {
          setCheeses((data ?? []) as CheeseRow[]);
          setLoading(false);
        });

    fetchCheeses();

    const channel = supabase
      .channel("all-cheeses-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "cheeses" }, fetchCheeses)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasting_cheeses" }, fetchCheeses)
      .on("postgres_changes", { event: "*", schema: "public", table: "reviews" }, fetchCheeses)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSort = (col: SortColumn) => {
    setSort((prev) => {
      if (prev.column === col) {
        return { column: col, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      const defaultDir: SortDirection = col === "tasting_date" ? "desc" : "asc";
      return { column: col, direction: defaultDir };
    });
  };

  const displayRows = useMemo<DisplayRow[]>(() => {
    const userId = user?.id ?? "";
    if (sort.column === "tasting_date") {
      const flat = buildFlatRows(cheeses, userId);
      return sortRows(flat, sort);
    }
    const grouped = buildGroupedRows(cheeses, userId);
    return sortRows(grouped, sort);
  }, [cheeses, sort, user?.id]);

  if (loading) return <p className="text-center py-12 text-gray-400">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-amber-900">All Cheeses</h1>
        <Button asChild variant="outline" size="sm">
          <Link to="/tastings">View Tastings</Link>
        </Button>
      </div>

      {cheeses.length === 0 && (
        <p className="text-gray-500 text-center py-12">No cheeses yet.</p>
      )}

      {cheeses.length > 0 && (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b-2 border-amber-100">
                <SortHeader col="name" label="Cheese" sort={sort} onSort={handleSort} />
                <SortHeader col="my_rating" label="Mine" sort={sort} onSort={handleSort} />
                <SortHeader col="my_favorite" label="♥" sort={sort} onSort={handleSort} />
                <SortHeader col="avg_rating" label="Avg" sort={sort} onSort={handleSort} />
                <SortHeader col="milk_type" label="Milk" sort={sort} onSort={handleSort} />
                <SortHeader col="country" label="Country" sort={sort} onSort={handleSort} />
                <SortHeader col="region" label="Region" sort={sort} onSort={handleSort} />
                <SortHeader col="tasting_date" label="Tasting" sort={sort} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => (
                <CheeseTableRow key={row.mode === "flat" ? `${row.id}-${row.tasting_id}` : row.id + i} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
