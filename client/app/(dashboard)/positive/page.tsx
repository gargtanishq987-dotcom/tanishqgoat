"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ThumbsUp, Calendar, MessageSquare, Users, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Lead, Campaign } from "@/lib/types";
import { formatDate, formatRelative, formatDateTime } from "@/lib/utils";

function LeadCard({ lead, campaigns }: { lead: Lead; campaigns: Campaign[] }) {
  const qc = useQueryClient();
  const [detailOpen, setDetailOpen] = useState(false);
  const [notes, setNotes] = useState(lead.notes ?? "");

  const campaign = campaigns.find((c) => c.id === lead.campaignId);

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Updated");
        qc.invalidateQueries({ queryKey: ["positive-leads"] });
        qc.invalidateQueries({ queryKey: ["booked-leads"] });
      } else {
        toast.error(res.error);
      }
    },
  });

  return (
    <>
      <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setDetailOpen(true)}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                {lead.firstName} {lead.lastName}
              </p>
              <p className="text-sm text-gray-500 truncate">{lead.email}</p>
              {lead.company && <p className="text-xs text-gray-400 truncate">{lead.company}</p>}
            </div>
            <div className="flex flex-col gap-1 items-end shrink-0">
              {lead.positiveReply && <Badge variant="success">Positive</Badge>}
              {lead.bookedMeeting && <Badge variant="success">Booked</Badge>}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
            <div>
              <span className="font-medium">Campaign: </span>
              {campaign?.name ?? "—"}
            </div>
            <div>
              <span className="font-medium">Replied: </span>
              {formatRelative(lead.sentAt)}
            </div>
          </div>

          {lead.notes && (
            <div className="mt-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-2.5 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
              {lead.notes}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-2">
              {!lead.bookedMeeting && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateMutation.mutate({ bookedMeeting: true });
                  }}
                >
                  <Calendar className="h-3.5 w-3.5" /> Mark booked
                </Button>
              )}
            </div>
            <Link
              href={`/campaigns/${lead.campaignId}`}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              Campaign <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{lead.firstName} {lead.lastName}</DialogTitle>
            <DialogDescription>{lead.email} · {lead.company}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {lead.positiveReply && <Badge variant="success">Positive reply</Badge>}
              {lead.bookedMeeting && <Badge variant="success">Meeting booked</Badge>}
              <Badge variant="secondary">{lead.status}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500 text-xs">Campaign</p>
                <p>{campaign?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Sent at</p>
                <p>{formatDate(lead.sentAt)}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Follow-ups sent</p>
                <p>{Math.max(0, lead.currentFollowUp - 1)}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Created</p>
                <p>{formatDate(lead.createdAt)}</p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-sm">
              <p className="font-medium text-xs text-gray-500 mb-1">Initial subject</p>
              <p className="text-gray-800 dark:text-gray-200">{lead.subject}</p>
            </div>

            {lead.replyText && (
              <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3">
                <p className="text-xs text-green-600 dark:text-green-400 mb-1.5 font-medium">
                  Their reply {lead.repliedAt ? `· ${formatDateTime(lead.repliedAt)}` : ""}
                </p>
                <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-sans leading-relaxed max-h-32 overflow-y-auto">
                  {lead.replyText}
                </pre>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this lead..."
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateMutation.mutate({ notes })}
                disabled={notes === (lead.notes ?? "")}
              >
                Save notes
              </Button>
            </div>

            <div className="flex gap-2 pt-1">
              {!lead.positiveReply && (
                <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ positiveReply: true })}>
                  <ThumbsUp className="h-3.5 w-3.5" /> Mark positive
                </Button>
              )}
              {!lead.bookedMeeting && (
                <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ bookedMeeting: true })}>
                  <Calendar className="h-3.5 w-3.5" /> Mark booked
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function PositivePage() {
  const { data: positiveLeads, isLoading: loadingPos } = useQuery<Lead[]>({
    queryKey: ["positive-leads"],
    queryFn: () => fetch("/api/leads?positiveReply=true").then((r) => r.json()).then((d) => d.data ?? []),
  });

  const { data: bookedLeads, isLoading: loadingBook } = useQuery<Lead[]>({
    queryKey: ["booked-leads"],
    queryFn: () => fetch("/api/leads?bookedMeeting=true").then((r) => r.json()).then((d) => d.data ?? []),
  });

  const { data: campaigns } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: () => fetch("/api/campaigns").then((r) => r.json()).then((d) => d.data ?? []),
  });

  const allPositive = positiveLeads ?? [];
  const allBooked = bookedLeads ?? [];
  const campaignList = campaigns ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Positive Responses</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Leads who replied positively or booked meetings
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-950/40">
                <ThumbsUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Positive replies</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{allPositive.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950/40">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Meetings booked</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{allBooked.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="positive">
        <TabsList>
          <TabsTrigger value="positive">
            <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
            Positive ({allPositive.length})
          </TabsTrigger>
          <TabsTrigger value="booked">
            <Calendar className="h-3.5 w-3.5 mr-1.5" />
            Booked ({allBooked.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="positive" className="mt-4">
          {loadingPos ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-40 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !allPositive.length ? (
            <div className="text-center py-16">
              <ThumbsUp className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No positive replies yet</p>
              <p className="text-xs text-gray-400 mt-1">Mark leads as positive from the Leads page or campaign detail</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allPositive.map((lead) => (
                <LeadCard key={lead.id} lead={lead} campaigns={campaignList} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="booked" className="mt-4">
          {loadingBook ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-40 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !allBooked.length ? (
            <div className="text-center py-16">
              <Calendar className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No meetings booked yet</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allBooked.map((lead) => (
                <LeadCard key={lead.id} lead={lead} campaigns={campaignList} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
