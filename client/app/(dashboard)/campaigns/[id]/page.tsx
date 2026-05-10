"use client";

import { use, useState, useRef } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Papa from "papaparse";
import {
  ArrowLeft, Play, Pause, Square, Upload, Users, Send, TrendingUp,
  Calendar, MoreVertical, Loader2, FileText, ClipboardPaste, AlertCircle,
  Eye, Pencil, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Campaign, Lead, Inbox } from "@/lib/types";
import { formatDate, formatRelative, formatDateTime } from "@/lib/utils";
import { replacePlaceholders, buildLeadVariables } from "@/lib/utils";

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

const CAMPAIGN_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "secondary"> = {
  draft: "secondary",
  active: "success",
  paused: "warning",
  completed: "default",
  stopped: "destructive",
};

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Tokyo", "Asia/Kolkata",
  "Asia/Singapore", "Australia/Sydney",
];

const CSV_TEMPLATE = `first_name,last_name,company,email,subject,body,followup_1,followup_2,followup_3
John,Doe,Acme Corp,john@acme.com,Quick question about {{company}},Hi {{first_name}},\n\nI noticed that {{company}} is growing fast and wanted to reach out.\n\nWould you be open to a quick 15-min chat?\n\nBest,\n[Your Name],Hi {{first_name}},\n\nJust following up on my last email — any thoughts?\n\nBest,\n[Your Name],,`;

// ─── Email Preview Dialog ──────────────────────────────────────────────────────

function EmailPreviewDialog({
  lead,
  followupIndex,
  open,
  onOpenChange,
}: {
  lead: Lead;
  followupIndex: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const vars = buildLeadVariables({
    firstName: lead.firstName,
    lastName: lead.lastName,
    company: lead.company,
    email: lead.email,
    customVariables: lead.customVariables ?? {},
  });

  const bodies = [lead.body, lead.followup1, lead.followup2, lead.followup3];
  const labels = ["Initial email", "Follow-up 1", "Follow-up 2", "Follow-up 3"];
  const [tab, setTab] = useState(String(followupIndex));

  const subject = replacePlaceholders(lead.subject, vars);
  const body = replacePlaceholders(bodies[Number(tab)] ?? "", vars);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email Preview — {lead.firstName} {lead.lastName}</DialogTitle>
          <DialogDescription>{lead.email}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            {bodies.map((b, i) => b ? (
              <TabsTrigger key={i} value={String(i)}>{labels[i]}</TabsTrigger>
            ) : null)}
          </TabsList>
          {bodies.map((b, i) => b ? (
            <TabsContent key={i} value={String(i)}>
              <div className="space-y-3">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
                  <p className="text-xs text-gray-500 mb-1">Subject</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{subject}</p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 p-4">
                  <p className="text-xs text-gray-500 mb-2">Body</p>
                  <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">
                    {replacePlaceholders(b, vars)}
                  </pre>
                </div>
              </div>
            </TabsContent>
          ) : null)}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Follow-up Time Dialog ────────────────────────────────────────────────

function EditScheduleDialog({
  lead,
  open,
  onOpenChange,
  onSave,
}: {
  lead: Lead;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (ts: number) => void;
}) {
  const current = lead.nextFollowUpAt
    ? new Date(lead.nextFollowUpAt).toISOString().slice(0, 16)
    : new Date(Date.now() + 86400_000).toISOString().slice(0, 16);
  const [value, setValue] = useState(current);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reschedule follow-up</DialogTitle>
          <DialogDescription>Change when the next follow-up is sent to {lead.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Send at</Label>
          <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSave(new Date(value).getTime()); onOpenChange(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Campaign Dialog ──────────────────────────────────────────────────────

function EditCampaignDialog({
  campaign,
  open,
  onOpenChange,
  onSave,
  saving,
}: {
  campaign: Campaign;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (data: Partial<Campaign>) => void;
  saving: boolean;
}) {
  const [dailyLimit, setDailyLimit] = useState(campaign.dailyLimit);
  const [windowStart, setWindowStart] = useState(campaign.sendingWindowStart);
  const [windowEnd, setWindowEnd] = useState(campaign.sendingWindowEnd);
  const [minDelay, setMinDelay] = useState(campaign.minDelaySec);
  const [maxDelay, setMaxDelay] = useState(campaign.maxDelaySec);
  const [timezone, setTimezone] = useState(campaign.timezone);
  const [followUpDays, setFollowUpDays] = useState(campaign.followUpDelayDays?.join(", ") ?? "");

  function handleSave() {
    const days = followUpDays.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n)).slice(0, 3);
    onSave({
      dailyLimit,
      sendingWindowStart: windowStart,
      sendingWindowEnd: windowEnd,
      minDelaySec: minDelay,
      maxDelaySec: maxDelay,
      timezone,
      followUpDelayDays: days,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Campaign Settings</DialogTitle>
          <DialogDescription>Changes apply to future sends immediately</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Daily limit</Label>
              <Input type="number" min={1} max={500} value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz.split("/")[1]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Window start</Label>
              <Input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Window end</Label>
              <Input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Min delay (sec)</Label>
              <Input type="number" min={30} value={minDelay} onChange={(e) => setMinDelay(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Max delay (sec)</Label>
              <Input type="number" min={30} value={maxDelay} onChange={(e) => setMaxDelay(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Follow-up delays (days, comma-separated)</Label>
            <Input
              placeholder="3, 5, 7"
              value={followUpDays}
              onChange={(e) => setFollowUpDays(e.target.value)}
            />
            <p className="text-xs text-gray-500">e.g. "3, 5" = follow-up 1 after 3 days, follow-up 2 after 5 days</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Import Dialog ─────────────────────────────────────────────────────────────

function ImportDialog({
  open, onOpenChange, campaignId, onSuccess,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; campaignId: string; onSuccess: () => void;
}) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [filename, setFilename] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [importing, setImporting] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function parseRows(content: string, name?: string) {
    setParseErrors([]);
    Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length) setParseErrors(results.errors.map((e) => e.message));
        setRows(results.data);
        if (name) setFilename(name);
      },
    });
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => parseRows(ev.target?.result as string, file.name);
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!rows.length) return;
    setImporting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, leads: rows }),
      }).then((r) => r.json());
      if (res.success) {
        const { imported, errors } = res.data;
        if (errors.length) toast.warning(`Imported ${imported} leads, ${errors.length} rows had errors`);
        else toast.success(`Imported ${imported} leads`);
        onSuccess();
        onOpenChange(false);
        setRows([]); setFilename(""); setPasteText("");
      } else {
        toast.error(res.error ?? "Import failed");
      }
    } catch { toast.error("Network error"); }
    finally { setImporting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Leads</DialogTitle>
          <DialogDescription>
            Required: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">first_name, email, subject, body</code>.
            Optional: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">last_name, company, followup_1, followup_2, followup_3</code>.
            Use <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">{"{{first_name}}"}</code> for placeholders.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="file">
          <TabsList className="mb-4">
            <TabsTrigger value="file"><Upload className="h-3.5 w-3.5 mr-1.5" />Upload CSV</TabsTrigger>
            <TabsTrigger value="paste"><ClipboardPaste className="h-3.5 w-3.5 mr-1.5" />Paste CSV</TabsTrigger>
          </TabsList>
          <TabsContent value="file">
            <div
              className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {filename ? <span className="font-medium text-blue-600">{filename} — {rows.length} rows parsed</span> : "Click to select a .csv file"}
              </p>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
            </div>
          </TabsContent>
          <TabsContent value="paste">
            <div className="space-y-3">
              <textarea
                className="flex min-h-[200px] w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-gray-100 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 font-mono resize-y"
                placeholder={`Paste CSV here:\n\nfirst_name,email,subject,body\nJohn,john@acme.com,Quick question,Hi John...`}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <Button variant="outline" size="sm" onClick={() => parseRows(pasteText)} disabled={!pasteText.trim()}>
                Parse CSV
              </Button>
              {rows.length > 0 && <p className="text-sm text-green-600 dark:text-green-400">{rows.length} rows parsed</p>}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <button
            className="text-blue-600 dark:text-blue-400 hover:underline"
            onClick={() => {
              const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "leads_template.csv"; a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download template CSV
          </button>
        </div>

        {parseErrors.length > 0 && (
          <div className="flex gap-2 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-900">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div className="text-xs text-red-700 dark:text-red-400 space-y-1">
              {parseErrors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="text-xs w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900">
                  {Object.keys(rows[0]).map((k) => (
                    <th key={k} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 3).map((row, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[150px] truncate">{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 3 && <p className="text-center text-xs text-gray-400 py-2">+ {rows.length - 3} more rows</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleImport} disabled={!rows.length || importing}>
            {importing && <Loader2 className="h-4 w-4 animate-spin" />}
            Import {rows.length > 0 ? `${rows.length} leads` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [previewLead, setPreviewLead] = useState<{ lead: Lead; tab: number } | null>(null);
  const [scheduleEdit, setScheduleEdit] = useState<Lead | null>(null);

  const { data: campaign, isLoading: loadingCampaign } = useQuery<Campaign>({
    queryKey: ["campaign", id],
    queryFn: () => fetch(`/api/campaigns/${id}`).then((r) => r.json()).then((d) => d.data),
  });

  const { data: leads, isLoading: loadingLeads } = useQuery<Lead[]>({
    queryKey: ["leads", id],
    queryFn: () => fetch(`/api/leads?campaignId=${id}`).then((r) => r.json()).then((d) => d.data ?? []),
  });

  const { data: inboxes } = useQuery<Inbox[]>({
    queryKey: ["inboxes"],
    queryFn: () => fetch("/api/inboxes").then((r) => r.json()).then((d) => d.data ?? []),
  });

  const inboxMap = Object.fromEntries((inboxes ?? []).map((i) => [i.id, i]));

  const actionMutation = useMutation({
    mutationFn: (action: string) =>
      fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }).then((r) => r.json()),
    onSuccess: (res, action) => {
      if (res.success) {
        toast.success(`Campaign ${action}ed`);
        qc.invalidateQueries({ queryKey: ["campaign", id] });
        qc.invalidateQueries({ queryKey: ["leads", id] });
        qc.invalidateQueries({ queryKey: ["campaigns"] });
      } else {
        toast.error(res.error ?? "Action failed");
      }
    },
  });

  const editMutation = useMutation({
    mutationFn: (data: Partial<Campaign>) =>
      fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Campaign updated");
        setEditOpen(false);
        qc.invalidateQueries({ queryKey: ["campaign", id] });
        qc.invalidateQueries({ queryKey: ["campaigns"] });
      } else {
        toast.error(res.error ?? "Failed to update");
      }
    },
  });

  const updateLeadMutation = useMutation({
    mutationFn: ({ leadId, data }: { leadId: string; data: Record<string, unknown> }) =>
      fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads", id] }),
  });

  if (loadingCampaign) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }

  if (!campaign) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Campaign not found</p>
        <Link href="/campaigns"><Button className="mt-4" variant="outline">Back to campaigns</Button></Link>
      </div>
    );
  }

  const replyRate = campaign.sentCount > 0 ? ((campaign.replyCount / campaign.sentCount) * 100).toFixed(1) : "0";
  const positiveLeads = (leads ?? []).filter((l) => l.positiveReply);
  const bookedLeads = (leads ?? []).filter((l) => l.bookedMeeting);
  const queuedCount = (leads ?? []).filter((l) => l.status === "queued").length;

  function getScheduleLabel(lead: Lead): string {
    if (lead.status === "queued") return `In queue (${campaign.sendingWindowStart}–${campaign.sendingWindowEnd})`;
    if (lead.status === "sent" && lead.nextFollowUpAt) return `Follow-up: ${formatDateTime(lead.nextFollowUpAt)}`;
    if (lead.status === "pending") return "Waiting to start";
    return "—";
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/campaigns">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{campaign.name}</h1>
            <Badge variant={CAMPAIGN_STATUS_VARIANT[campaign.status]}>{campaign.status}</Badge>
            {queuedCount > 0 && <span className="text-xs text-gray-500">{queuedCount} queued</span>}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Created {formatDate(campaign.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          {campaign.status === "draft" && (
            <Button size="sm" onClick={() => actionMutation.mutate("start")} disabled={actionMutation.isPending}>
              <Play className="h-4 w-4" /> Start
            </Button>
          )}
          {campaign.status === "active" && (
            <Button size="sm" variant="outline" onClick={() => actionMutation.mutate("pause")} disabled={actionMutation.isPending}>
              <Pause className="h-4 w-4" /> Pause
            </Button>
          )}
          {campaign.status === "paused" && (
            <Button size="sm" onClick={() => actionMutation.mutate("resume")} disabled={actionMutation.isPending}>
              <Play className="h-4 w-4" /> Resume
            </Button>
          )}
          {(campaign.status === "active" || campaign.status === "paused") && (
            <Button size="sm" variant="destructive" onClick={() => { if (confirm("Stop this campaign?")) actionMutation.mutate("stop"); }} disabled={actionMutation.isPending}>
              <Square className="h-4 w-4" /> Stop
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import leads
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Total leads", value: campaign.totalLeads, icon: Users },
          { label: "Sent", value: campaign.sentCount, icon: Send },
          { label: "Reply rate", value: `${replyRate}%`, icon: TrendingUp },
          { label: "Positive", value: positiveLeads.length, icon: TrendingUp },
          { label: "Meetings", value: bookedLeads.length, icon: Calendar },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-gray-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Config */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Configuration</CardTitle>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Daily limit</p>
              <p className="font-medium">{campaign.dailyLimit}/day</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Sending window</p>
              <p className="font-medium">{campaign.sendingWindowStart}–{campaign.sendingWindowEnd} ({campaign.timezone?.split("/")[1]})</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Delay between emails</p>
              <p className="font-medium">{campaign.minDelaySec}–{campaign.maxDelaySec}s</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Follow-up delays</p>
              <p className="font-medium">{campaign.followUpDelayDays?.join(", ") || "None"} days</p>
            </div>
          </div>
          {campaign.assignedInboxIds?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-500 mb-1.5">Sending inboxes</p>
              <div className="flex flex-wrap gap-1.5">
                {campaign.assignedInboxIds.map((iid) => (
                  <Badge key={iid} variant="secondary">{inboxMap[iid]?.email ?? iid}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leads table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Leads ({leads?.length ?? 0})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingLeads ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              ))}
            </div>
          ) : !leads?.length ? (
            <div className="text-center py-12">
              <Users className="h-8 w-8 mx-auto text-gray-300 dark:text-gray-700 mb-2" />
              <p className="text-sm text-gray-500">No leads imported yet</p>
              <Button className="mt-3" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import CSV
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Inbox</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Scheduled</div>
                    </TableHead>
                    <TableHead>Preview</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => {
                    const sendingInbox = inboxMap[lead.inboxId];
                    return (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium">
                          {lead.firstName} {lead.lastName}
                          {lead.company && <span className="text-gray-400 text-xs ml-1">· {lead.company}</span>}
                        </TableCell>
                        <TableCell className="text-gray-500 text-xs">{lead.email}</TableCell>
                        <TableCell className="text-xs">
                          {sendingInbox ? (
                            <span className="text-gray-600 dark:text-gray-400">{sendingInbox.email}</span>
                          ) : lead.inboxId ? (
                            <span className="text-gray-400">ID: {lead.inboxId.slice(0, 8)}…</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            <Badge variant={STATUS_VARIANT[lead.status]}>{lead.status}</Badge>
                            {lead.positiveReply && <Badge variant="success">positive</Badge>}
                            {lead.bookedMeeting && <Badge variant="success">booked</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-gray-500 max-w-[180px]">
                          <div className="flex items-center gap-1">
                            <span className="truncate">{getScheduleLabel(lead)}</span>
                            {lead.status === "sent" && lead.nextFollowUpAt && (
                              <button
                                className="text-blue-500 hover:text-blue-700 shrink-0"
                                onClick={() => setScheduleEdit(lead)}
                                title="Reschedule"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setPreviewLead({ lead, tab: lead.currentFollowUp ?? 0 })}
                            title="Preview email"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setPreviewLead({ lead, tab: 0 })}>
                                <Eye className="h-4 w-4 mr-2" /> Preview email
                              </DropdownMenuItem>
                              {!lead.positiveReply && (
                                <DropdownMenuItem onClick={() => updateLeadMutation.mutate({ leadId: lead.id, data: { positiveReply: true } })}>
                                  Mark positive reply
                                </DropdownMenuItem>
                              )}
                              {!lead.bookedMeeting && (
                                <DropdownMenuItem onClick={() => updateLeadMutation.mutate({ leadId: lead.id, data: { bookedMeeting: true } })}>
                                  Mark meeting booked
                                </DropdownMenuItem>
                              )}
                              {lead.status === "sent" && lead.nextFollowUpAt && (
                                <DropdownMenuItem onClick={() => setScheduleEdit(lead)}>
                                  <Clock className="h-4 w-4 mr-2" /> Reschedule follow-up
                                </DropdownMenuItem>
                              )}
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

      {/* Dialogs */}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        campaignId={id}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["leads", id] });
          qc.invalidateQueries({ queryKey: ["campaign", id] });
          qc.invalidateQueries({ queryKey: ["campaigns"] });
        }}
      />

      {campaign && (
        <EditCampaignDialog
          campaign={campaign}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSave={(data) => editMutation.mutate(data)}
          saving={editMutation.isPending}
        />
      )}

      {previewLead && (
        <EmailPreviewDialog
          lead={previewLead.lead}
          followupIndex={previewLead.tab}
          open={!!previewLead}
          onOpenChange={(v) => { if (!v) setPreviewLead(null); }}
        />
      )}

      {scheduleEdit && (
        <EditScheduleDialog
          lead={scheduleEdit}
          open={!!scheduleEdit}
          onOpenChange={(v) => { if (!v) setScheduleEdit(null); }}
          onSave={(ts) => {
            updateLeadMutation.mutate({ leadId: scheduleEdit.id, data: { nextFollowUpAt: ts } });
            setScheduleEdit(null);
            toast.success("Follow-up rescheduled");
          }}
        />
      )}
    </div>
  );
}
