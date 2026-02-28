import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function NewTastingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("tastings")
      .insert({ date, notes: notes || null, created_by: user.id })
      .select()
      .single();

    setLoading(false);

    if (error) {
      toast.error("Failed to create tasting");
      return;
    }

    const tasting = data as { id: string };
    navigate(`/tastings/${tasting.id}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-amber-700 hover:underline">← All tastings</Link>
        <h1 className="text-2xl font-bold text-amber-900 mt-2">New Tasting</h1>
      </div>

      <Card className="border-amber-100">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about this tasting..."
                rows={3}
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creating..." : "Create Tasting"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
