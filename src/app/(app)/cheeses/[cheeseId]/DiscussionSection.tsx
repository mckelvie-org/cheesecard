"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import type { Comment } from "@/lib/supabase/types";


interface ProfileMini {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Props {
  cheeseId: string;
  userId: string;
  initialComments: Comment[];
  profileMap: Record<string, ProfileMini>;
}

interface ThreadedComment extends Comment {
  replies: Comment[];
}

function buildThreads(comments: Comment[]): ThreadedComment[] {
  const byId = new Map<string, ThreadedComment>();
  const roots: ThreadedComment[] = [];

  for (const c of comments) {
    byId.set(c.id, { ...c, replies: [] });
  }
  for (const c of byId.values()) {
    if (c.parent_id) {
      byId.get(c.parent_id)?.replies.push(c);
    } else {
      roots.push(c);
    }
  }
  return roots;
}

export default function DiscussionSection({
  cheeseId,
  userId,
  initialComments,
  profileMap,
}: Props) {
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
      .insert({
        cheese_id: cheeseId,
        user_id: userId,
        body: body.trim(),
        parent_id: parentId,
      })
      .select()
      .single();

    setPosting(false);
    if (error) {
      toast.error("Failed to post comment");
      return;
    }
    setComments((prev) => [...prev, data as Comment]);
    if (parentId) {
      setReplyingTo(null);
      setReplyBody("");
    } else {
      setNewBody("");
    }
  };

  const threads = buildThreads(comments);

  return (
    <div className="space-y-4">
      {threads.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">
          No discussion yet. Start the conversation!
        </p>
      )}

      {threads.map((thread) => (
        <CommentThread
          key={thread.id}
          comment={thread}
          profileMap={profileMap}
          userId={userId}
          replyingTo={replyingTo}
          replyBody={replyBody}
          posting={posting}
          onReply={(id) => {
            setReplyingTo(id === replyingTo ? null : id);
            setReplyBody("");
          }}
          onReplyBodyChange={setReplyBody}
          onPostReply={() => postComment(replyBody, thread.id)}
        />
      ))}

      {/* New top-level comment */}
      <div className="space-y-2 pt-2 border-t border-amber-100">
        <Textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="Add to the discussion..."
          rows={2}
        />
        <Button
          size="sm"
          onClick={() => postComment(newBody)}
          disabled={posting || !newBody.trim()}
        >
          {posting ? "Posting..." : "Post"}
        </Button>
      </div>
    </div>
  );
}

function CommentThread({
  comment,
  profileMap,
  userId,
  replyingTo,
  replyBody,
  posting,
  onReply,
  onReplyBodyChange,
  onPostReply,
}: {
  comment: ThreadedComment;
  profileMap: Record<string, ProfileMini>;
  userId: string;
  replyingTo: string | null;
  replyBody: string;
  posting: boolean;
  onReply: (id: string) => void;
  onReplyBodyChange: (v: string) => void;
  onPostReply: () => void;
}) {
  return (
    <div className="space-y-2">
      <CommentBubble
        comment={comment}
        profileMap={profileMap}
        userId={userId}
        onReply={() => onReply(comment.id)}
      />

      {/* Replies */}
      {comment.replies.length > 0 && (
        <div className="ml-8 space-y-2 border-l-2 border-amber-100 pl-3">
          {comment.replies.map((reply) => (
            <CommentBubble
              key={reply.id}
              comment={reply}
              profileMap={profileMap}
              userId={userId}
              onReply={() => onReply(comment.id)}
            />
          ))}
        </div>
      )}

      {/* Reply input */}
      {replyingTo === comment.id && (
        <div className="ml-8 space-y-2">
          <Textarea
            value={replyBody}
            onChange={(e) => onReplyBodyChange(e.target.value)}
            placeholder="Write a reply..."
            rows={2}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReply(comment.id)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={onPostReply}
              disabled={posting || !replyBody.trim()}
            >
              Reply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentBubble({
  comment,
  profileMap,
  userId,
  onReply,
}: {
  comment: Comment;
  profileMap: Record<string, ProfileMini>;
  userId: string;
  onReply: () => void;
}) {
  const p = profileMap[comment.user_id];
  const isOwn = comment.user_id === userId;
  const initials = p?.full_name
    ? p.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)
    : "?";

  return (
    <div className="flex gap-2">
      <Avatar className="h-6 w-6 flex-shrink-0 mt-0.5">
        {p?.avatar_url && <AvatarImage src={p.avatar_url} />}
        <AvatarFallback className="text-xs bg-gray-100">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold">
            {p?.full_name ?? "Member"}
            {isOwn && (
              <span className="text-gray-400 font-normal ml-1">(you)</span>
            )}
          </span>
          <span className="text-xs text-gray-400">
            {new Date(comment.created_at).toLocaleDateString()}
          </span>
        </div>
        <p className="text-sm text-gray-700 mt-0.5">{comment.body}</p>
        <button
          onClick={onReply}
          className="text-xs text-amber-600 hover:underline mt-0.5"
        >
          Reply
        </button>
      </div>
    </div>
  );
}
