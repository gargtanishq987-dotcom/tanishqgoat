"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Search, MoreVertical, ThumbsUp, Calendar, Trash2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { Lead, Campaign } from "@/lib/types";
import { formatDate, formatRelative } from "@/lib/utils";
import Link from "next/link";

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "secondary"> = {
  pending: "secondary",
  queued: "default",
  sent: "default",
  replied: "success",
  positive: "success",
  booked: "success",
  bounced: "destructive",
  unsubscribed: "warning",
};

const STATUSES = ["all", "pending", "queued", "sent", "replied", "positive", "booked", "bounced", "unsubscribed"];

function LeadDetailDialog({ lead, open, onOpenChange }: { lead: Lead | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/leads/${lead?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Lead updated");
        qc.invalidateQueries({ queryKey: ["leads"] });
      } else {
        toast.error(res.error);
      }
    },
  });

  const [notes, setNotes] = useState(lead?.notes ?? "");

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead.firstName} {lead.lastName}</DialogTitle>
          <DialogDescription>{lead.email} · {lead.company}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={STATUS_VARIANT[lead.status]}>{lead.status}</Badge>
            {lead.positiveReply && <Badge variant="success">Positive reply</Badge>}
            {lead.bookedMeeting && <Badge variant="success">Meeting booked</Badge>}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Sent at</p>
              <p>{formatDate(lead.sentAt)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Next follow-up</p>
              <p>{lead.nextFollowUpAt ? formatRelative(lead.nextFollowUpAt) : "—"}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Follow-up #</p>
              <p>{lead.currentFollowUp}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Created</p>
              <p>{formatDate(lead.createdAt)}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">Initial email</p>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-sm">
              <p className="font-medium mb-1">{lead.subject}</p>
              <pre className="text-gray-600 dark:text-gray-400 text-xs whitespace-pre-wrap font-sans">{lead.body}</pre>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes..."
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateMutation.mutate({ notes })}
              disabled={notes === lead.notes}
            >
              Save notes
            </Button>
          </div>

          <div className="flex gap-2 pt-2">
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
  );
}

export default function LeadsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: leads, isLoading } = useQuery<Lead[]>({
    queryKey: ["leads", statusFilter, campaignFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (campaignFilter !== "all") params.set("campaignId", campaignFilter);
      return fetch(`/api/leads?${params}`).then((r) => r.json()).then((d) => d.data ?? []);
    },
  });

  const { data: campaigns } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: () => fetch("/api/campaigns").then((r) => r.json()).then((d) => d.data ?? []),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/leads/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Lead deleted");
        qc.invalidateQueries({ queryKey: ["leads"] });
        qc.invalidateQueries({ queryKey: ["campaigns"] });
      } else {
        toast.error(res.error);
      }
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      fetch("/api/leads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: ids }),
      }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(`Deleted ${res.data.deleted} leads`);
        setSelectedIds(new Set());
        qc.invalidateQueries({ queryKey: ["leads"] });
        qc.invalidateQueries({ queryKey: ["campaigns"] });
      } else {
        toast.error(res.error ?? "Delete failed");
      }
    },
  });

  const filtered = (leads ?? []).filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.email.toLowerCase().includes(q) ||
      l.firstName.toLowerCase().includes(q) ||
      l.lastName.toLowerCase().includes(q) ||
      l.company.toLowerCase().includes(q)
    );
  });

  const allSelected = filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id));
  const someSelected = filtered.some((l) => selectedIds.has(l.id));


  const campaignMap = Object.fromEntries((campaigns ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Leads</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {leads?.length ?? 0} total leads
          </p>
        </div>
        {selectedIds.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            disabled={bulkDeleteMutation.isPending}
            onClick={() => {
              const ids = filtered.filter((l) => selectedIds.has(l.id)).map((l) => l.id);
              if (confirm(`Delete ${ids.length} selected lead${ids.length > 1 ? "s" : ""}?`)) {
                bulkDeleteMutation.mutate(ids);
              }
            }}
          >
            {bulkDeleteMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Trash2 className="h-4 w-4" />}
            Delete {selectedIds.size} selected
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-56"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Campaign" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campaigns</SelectItem>
            {(campaigns ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              ))}
            </div>
          ) : !filtered.length ? (
            <div className="text-center py-16">
              <Users className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">
                {leads?.length ? "No leads match your filters" : "No leads yet. Import leads in a campaign."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 cursor-pointer"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              filtered.forEach((l) => next.add(l.id));
                              return next;
                            });
                          } else {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              filtered.forEach((l) => next.delete(l.id));
                              return next;
                            });
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((lead) => {
                    const isSelected = selectedIds.has(lead.id);
                    return (
                      <TableRow
                        key={lead.id}
                        className={`cursor-pointer ${isSelected ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
                        onClick={() => setSelectedLead(lead)}
                      >
                        <TableCell className="w-8" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 cursor-pointer"
                            checked={isSelected}
                            onChange={(e) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                e.target.checked ? next.add(lead.id) : next.delete(lead.id);
                                return next;
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {lead.firstName} {lead.lastName}
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm">{lead.email}</TableCell>
                        <TableCell className="text-gray-500 text-sm">{lead.company || "—"}</TableCell>
                        <TableCell className="text-xs">
                          {campaignMap[lead.campaignId] ? (
                            <Link
                              href={`/campaigns/${lead.campaignId}`}
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {campaignMap[lead.campaignId]}
                            </Link>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[lead.status]}>{lead.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-gray-500">{formatRelative(lead.sentAt)}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setSelectedLead(lead)}>
                                View details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 dark:text-red-400 focus:text-red-600"
                                onClick={() => { if (confirm("Delete lead?")) deleteMutation.mutate(lead.id); }}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <LeadDetailDialog
        lead={selectedLead}
        open={!!selectedLead}
        onOpenChange={(v) => { if (!v) setSelectedLead(null); }}
      />
    </div>
  );
}
