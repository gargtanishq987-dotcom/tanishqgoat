"use client";

import { use, useState, useRef } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Papa from "papaparse";
import {
  ArrowLeft, Play, Pause, Square, Upload, Users, Send, TrendingUp,
  Calendar, MoreVertical, Loader2, FileText, ClipboardPaste, AlertCircle,
  Eye, Pencil, Clock, MessageSquare, Trash2,
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

// Body/followup fields are quoted so embedded newlines are preserved when opened in Excel/Sheets
const CSV_TEMPLATE =
  'first_name,last_name,company,email,subject,body,followup_1,followup_2,followup_3\n' +
  'John,Doe,Acme Corp,john@acme.com,Quick question about {{company}},' +
  '"Hi {{first_name}},\n\nI noticed that {{company}} is growing fast and wanted to reach out.\n\nWould you be open to a quick 15-min chat?\n\nBest,\n[Your Name]",' +
  '"Hi {{first_name}},\n\nJust following up on my last email — any thoughts?\n\nBest,\n[Your Name]",,\n';

// ─── Email Preview Dialog (single lead + prev/next navigation) ────────────────

function EmailPreviewDialog({
  leads,
  initialLeadIndex,
  followupIndex,
  open,
  onOpenChange,
}: {
  leads: Lead[];
  initialLeadIndex: number;
  followupIndex: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [leadIndex, setLeadIndex] = useState(initialLeadIndex);
  const [tab, setTab] = useState(String(followupIndex));

  const lead = leads[leadIndex];
  if (!lead) return null;

  const vars = buildLeadVariables({
    firstName: lead.firstName,
    lastName: lead.lastName,
    company: lead.company,
    email: lead.email,
    customVariables: lead.customVariables ?? {},
  });

  const bodies = [lead.body, lead.followup1, lead.followup2, lead.followup3];
  const labels = ["Initial email", "Follow-up 1", "Follow-up 2", "Follow-up 3"];
  const subject = replacePlaceholders(lead.subject, vars);

  function goPrev() { setLeadIndex((i) => Math.max(0, i - 1)); setTab("0"); }
  function goNext() { setLeadIndex((i) => Math.min(leads.length - 1, i + 1)); setTab("0"); }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-8">
            <div>
              <DialogTitle>Email Preview — {lead.firstName} {lead.lastName}</DialogTitle>
              <DialogDescription>{lead.email}</DialogDescription>
            </div>
            {leads.length > 1 && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={goPrev}
                  disabled={leadIndex === 0}
                  className="h-7 w-7 rounded border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-30"
                >
                  ‹
                </button>
                <span className="text-xs text-gray-500 w-14 text-center">
                  {leadIndex + 1} / {leads.length}
                </span>
                <button
                  onClick={goNext}
                  disabled={leadIndex === leads.length - 1}
                  className="h-7 w-7 rounded border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-30"
                >
                  ›
                </button>
              </div>
            )}
          </div>
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

// ─── Reply Viewer Dialog ───────────────────────────────────────────────────────

function ReplyViewerDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-green-500" />
            Reply from {lead.firstName} {lead.lastName}
          </DialogTitle>
          <DialogDescription>{lead.email} · {lead.repliedAt ? formatDateTime(lead.repliedAt) : "—"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
            <p className="text-xs text-gray-500 mb-1">Your subject</p>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{lead.subject}</p>
          </div>
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-4">
            <p className="text-xs text-green-600 dark:text-green-400 mb-2">Their reply</p>
            {lead.replyText ? (
              <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">
                {lead.replyText}
              </pre>
            ) : (
              <p className="text-sm text-gray-400 italic">
                Reply detected but content could not be extracted — check your Gmail inbox directly.
              </p>
            )}
          </div>
        </div>
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

// ─── Test Email Dialog ────────────────────────────────────────────────────────

function TestEmailDialog({
  open, onOpenChange, inboxes, leads,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  inboxes: import("@/lib/types").Inbox[];
  leads: import("@/lib/types").Lead[];
}) {
  const [to, setTo] = useState("");
  const [inboxId, setInboxId] = useState("");
  const [leadIdx, setLeadIdx] = useState(0);
  const [sending, setSending] = useState(false);

  const lead = leads[leadIdx];
  const activeInboxes = inboxes.filter((i) => i.status === "active");

  async function handleSend() {
    if (!inboxId || !to || !lead) return;
    setSending(true);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inboxId, to, subject: lead.subject, body: lead.body }),
      }).then((r) => r.json());
      if (res.success) {
        toast.success(`Test sent to ${to}`);
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Send failed");
      }
    } catch { toast.error("Network error"); }
    finally { setSending(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Test Email</DialogTitle>
          <DialogDescription>Send a real email using one of your leads&apos; content to verify formatting before launching</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Send from inbox</Label>
            <Select value={inboxId} onValueChange={setInboxId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an inbox…" />
              </SelectTrigger>
              <SelectContent>
                {activeInboxes.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeInboxes.length === 0 && <p className="text-xs text-red-500">No active inboxes available</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Send to (your test address)</Label>
            <Input placeholder="you@example.com" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {leads.length > 1 && (
            <div className="space-y-1.5">
              <Label>Preview lead</Label>
              <Select value={String(leadIdx)} onValueChange={(v) => setLeadIdx(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {leads.slice(0, 20).map((l, i) => (
                    <SelectItem key={l.id} value={String(i)}>{l.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {lead && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 space-y-2 text-xs">
              <p className="font-medium text-gray-700 dark:text-gray-300">Subject: {lead.subject}</p>
              <pre className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-sans max-h-32 overflow-y-auto">{lead.body}</pre>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || !inboxId || !to || !lead}>
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Import Dialog with Column Mapper ─────────────────────────────────────────

const FIELD_DEFS = [
  { key: "email",      label: "Email",      required: true },
  { key: "subject",    label: "Subject",    required: true },
  { key: "body",       label: "Body",       required: true },
  { key: "first_name", label: "First Name", required: false },
  { key: "last_name",  label: "Last Name",  required: false },
  { key: "company",    label: "Company",    required: false },
  { key: "followup_1", label: "Follow-up 1",required: false },
  { key: "followup_2", label: "Follow-up 2",required: false },
  { key: "followup_3", label: "Follow-up 3",required: false },
];

function autoMap(columns: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const aliases: Record<string, string[]> = {
    first_name: ["first_name","firstname","first","fname","name","first name"],
    last_name:  ["last_name","lastname","last","lname","surname","last name"],
    email:      ["email","email address","e-mail","mail"],
    company:    ["company","company name","organization","org","account"],
    subject:    ["subject","subject line","email subject"],
    body:       ["body","email body","message","content","email content"],
    followup_1: ["followup_1","follow_up_1","followup1","follow up 1","follow-up 1"],
    followup_2: ["followup_2","follow_up_2","followup2","follow up 2","follow-up 2"],
    followup_3: ["followup_3","follow_up_3","followup3","follow up 3","follow-up 3"],
  };
  for (const [field, alts] of Object.entries(aliases)) {
    const match = columns.find((c) => alts.includes(c.toLowerCase().trim()));
    if (match) map[field] = match;
  }
  return map;
}

function applyMapping(rows: Record<string, string>[], mapping: Record<string, string>): Record<string, string>[] {
  return rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [field, col] of Object.entries(mapping)) {
      if (col) out[field] = row[col] ?? "";
    }
    // pass through unmapped columns as custom variables (skip empty-named columns)
    for (const [col, val] of Object.entries(row)) {
      const isMapped = Object.values(mapping).includes(col);
      if (!isMapped && col !== "") out[col] = val;
    }
    return out;
  });
}

function ImportDialog({
  open, onOpenChange, campaignId, onSuccess,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; campaignId: string; onSuccess: () => void;
}) {
  const [step, setStep] = useState<"input" | "map" | "preview">("input");
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [filename, setFilename] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [importing, setImporting] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleParsed(results: Papa.ParseResult<Record<string, string>>, name?: string) {
    const realErrors = results.errors.filter((e) => !e.message.includes("empty string"));
    if (realErrors.length) setParseErrors(realErrors.slice(0, 3).map((e) => e.message));
    const cols = Object.keys(results.data[0] ?? {});
    setColumns(cols);
    setRawRows(results.data);
    setMapping(autoMap(cols));
    if (name) setFilename(name);
    setStep("map");
  }

  function parseContent(content: string, name?: string) {
    setParseErrors([]);
    // Strip BOM (added by Excel/Google Sheets exports) which creates an empty first header
    const cleaned = content.replace(/^﻿/, "");
    Papa.parse<Record<string, string>>(cleaned, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (r) => handleParsed(r, name),
    });
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => parseContent(ev.target?.result as string, file.name);
    reader.readAsText(file);
  }

  const mappedRows = applyMapping(rawRows, mapping);

  async function handleImport() {
    setImporting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, leads: mappedRows, allowDuplicates }),
      }).then((r) => r.json());
      if (res.success) {
        const { imported, blocked, duplicates, errors } = res.data;
        const validationErrors = errors.length - duplicates - blocked;
        const parts = [`Imported ${imported} leads`];
        if (duplicates > 0) parts.push(`${duplicates} duplicates skipped`);
        if (blocked > 0) parts.push(`${blocked} blocked`);
        if (validationErrors > 0) parts.push(`${validationErrors} invalid rows`);
        const hasSkipped = duplicates > 0 || blocked > 0 || validationErrors > 0;
        if (hasSkipped) {
          toast.warning(parts.join(" · "));
          // Surface the first few specific error messages so the user knows why rows were skipped
          const validationErrs = errors.filter(
            (e: { row: number; error: string }) => !e.error.includes("block list") && !e.error.includes("already exists")
          ).slice(0, 3);
          for (const e of validationErrs) {
            toast.error(`Row ${e.row}: ${e.error}`, { duration: 8000 });
          }
        } else {
          toast.success(parts.join(" · "));
        }
        onSuccess();
        onOpenChange(false);
        setStep("input"); setRawRows([]); setFilename(""); setPasteText("");
      } else {
        toast.error(res.error ?? "Import failed");
      }
    } catch { toast.error("Network error"); }
    finally { setImporting(false); }
  }

  function reset() { setStep("input"); setRawRows([]); setFilename(""); setPasteText(""); setParseErrors([]); setAllowDuplicates(false); }

  const missingRequired = FIELD_DEFS.filter((f) => f.required && !mapping[f.key]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Leads {step === "map" ? "— Map Columns" : step === "preview" ? "— Preview" : ""}</DialogTitle>
          <DialogDescription>
            {step === "input" && "Upload or paste your CSV — columns will be auto-detected and mapped"}
            {step === "map" && `${rawRows.length} rows detected — map your CSV columns to the required fields`}
            {step === "preview" && `${mappedRows.length} leads ready to import`}
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <>
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
                    {filename ? <span className="font-medium text-blue-600">{filename}</span> : "Click to select a CSV file — any column names work"}
                  </p>
                  <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
                </div>
              </TabsContent>
              <TabsContent value="paste">
                <div className="space-y-3">
                  <textarea
                    className="flex min-h-[200px] w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-gray-100 font-mono resize-y"
                    placeholder={"Paste any CSV here — column names don't need to be exact\n\nname,mail,headline,message\nJohn,john@co.com,Hello,..."}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                  <Button variant="outline" size="sm" onClick={() => parseContent(pasteText)} disabled={!pasteText.trim()}>
                    Parse CSV
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
            <div className="text-xs">
              <button className="text-blue-600 dark:text-blue-400 hover:underline" onClick={() => {
                const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
                const url = URL.createObjectURL(blob); const a = document.createElement("a");
                a.href = url; a.download = "leads_template.csv"; a.click(); URL.revokeObjectURL(url);
              }}>Download template CSV</button>
            </div>
          </>
        )}

        {step === "map" && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Detected columns: {columns.join(", ")}</p>
            <div className="grid grid-cols-2 gap-3">
              {FIELD_DEFS.map(({ key, label, required }) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {label} {required && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100"
                    value={mapping[key] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                  >
                    <option value="">— skip —</option>
                    {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {missingRequired.length > 0 && (
              <p className="text-xs text-red-500">Required: {missingRequired.map((f) => f.label).join(", ")}</p>
            )}
            {parseErrors.length > 0 && (
              <div className="text-xs text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30 p-2 rounded">
                {parseErrors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none border border-gray-200 dark:border-gray-700 rounded-md p-2">
              <input
                type="checkbox"
                checked={allowDuplicates}
                onChange={(e) => setAllowDuplicates(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span>
                <span className="font-medium text-gray-700 dark:text-gray-300">Allow duplicate emails</span>
                <span className="text-gray-400 ml-1">— import emails that already exist in other campaigns (blocklist still enforced)</span>
              </span>
            </label>
          </div>
        )}

        {step === "preview" && (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="text-xs w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900">
                  {["first_name","email","subject","body"].map((k) => (
                    <th key={k} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappedRows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                    {["first_name","email","subject","body"].map((k) => (
                      <td key={k} className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[150px] truncate">{row[k]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {mappedRows.length > 5 && <p className="text-center text-xs text-gray-400 py-2">+ {mappedRows.length - 5} more rows</p>}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "input" && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          )}
          {step === "map" && (
            <>
              <Button variant="outline" onClick={() => setStep("input")}>Back</Button>
              <Button onClick={() => setStep("preview")} disabled={missingRequired.length > 0}>
                Preview {rawRows.length} rows
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("map")}>Back</Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                Import {mappedRows.length} leads
              </Button>
            </>
          )}
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
  const [previewState, setPreviewState] = useState<{ leadIndex: number; tab: number } | null>(null);
  const [previewAllOpen, setPreviewAllOpen] = useState(false);
  const [scheduleEdit, setScheduleEdit] = useState<Lead | null>(null);
  const [replyViewLead, setReplyViewLead] = useState<Lead | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [testEmailOpen, setTestEmailOpen] = useState(false);

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

  const deleteLeadMutation = useMutation({
    mutationFn: (leadId: string) =>
      fetch(`/api/leads/${leadId}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Lead deleted");
        qc.invalidateQueries({ queryKey: ["leads", id] });
        qc.invalidateQueries({ queryKey: ["campaign", id] });
        qc.invalidateQueries({ queryKey: ["campaigns"] });
      } else {
        toast.error(res.error ?? "Failed to delete");
      }
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (leadIds: string[]) =>
      fetch("/api/leads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds }),
      }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(`Deleted ${res.data.deleted} leads`);
        setSelectedLeads(new Set());
        qc.invalidateQueries({ queryKey: ["leads", id] });
        qc.invalidateQueries({ queryKey: ["campaign", id] });
        qc.invalidateQueries({ queryKey: ["campaigns"] });
      } else {
        toast.error(res.error ?? "Failed to delete");
      }
    },
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
    if (lead.status === "queued") return `Queued · ${campaign?.sendingWindowStart}–${campaign?.sendingWindowEnd} (${campaign?.timezone?.split("/")[1] ?? campaign?.timezone})`;
    if (lead.status === "sent" && lead.nextFollowUpAt) return `Follow-up ${formatDateTime(lead.nextFollowUpAt)}`;
    if (lead.status === "sent" && !lead.nextFollowUpAt) return `Sent ${lead.sentAt ? formatDateTime(lead.sentAt) : ""}`;
    if (lead.status === "pending") return "Waiting to start";
    if (lead.status === "replied") return lead.sentAt ? `Replied · sent ${formatDate(lead.sentAt)}` : "Replied";
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
          <Button size="sm" variant="outline" onClick={() => setTestEmailOpen(true)} disabled={!leads?.length}>
            <Send className="h-4 w-4" /> Send test
          </Button>
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
            <div className="flex items-center gap-2">
              {selectedLeads.size > 0 && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs"
                  disabled={bulkDeleteMutation.isPending}
                  onClick={() => {
                    if (confirm(`Delete ${selectedLeads.size} selected lead${selectedLeads.size > 1 ? "s" : ""}?`)) {
                      bulkDeleteMutation.mutate(Array.from(selectedLeads));
                    }
                  }}
                >
                  {bulkDeleteMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                  Delete {selectedLeads.size} selected
                </Button>
              )}
              {(leads?.length ?? 0) > 0 && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPreviewAllOpen(true)}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> Preview all
                </Button>
              )}
            </div>
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
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 cursor-pointer"
                        checked={selectedLeads.size === leads.length && leads.length > 0}
                        ref={(el) => { if (el) el.indeterminate = selectedLeads.size > 0 && selectedLeads.size < leads.length; }}
                        onChange={(e) => setSelectedLeads(e.target.checked ? new Set(leads.map((l) => l.id)) : new Set())}
                      />
                    </TableHead>
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
                    const isSelected = selectedLeads.has(lead.id);
                    return (
                      <TableRow key={lead.id} className={isSelected ? "bg-blue-50 dark:bg-blue-950/20" : ""}>
                        <TableCell className="w-8">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 cursor-pointer"
                            checked={isSelected}
                            onChange={(e) => setSelectedLeads((prev) => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(lead.id) : next.delete(lead.id);
                              return next;
                            })}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {lead.firstName} {lead.lastName}
                          {lead.company && <span className="text-gray-400 text-xs ml-1">· {lead.company}</span>}
                        </TableCell>
                        <TableCell className="text-gray-500 text-xs">{lead.email}</TableCell>
                        <TableCell className="text-xs text-gray-500">
                          {sendingInbox ? sendingInbox.email : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap items-center">
                            <Badge variant={STATUS_VARIANT[lead.status]}>{lead.status}</Badge>
                            {lead.positiveReply && <Badge variant="success">positive</Badge>}
                            {lead.bookedMeeting && <Badge variant="success">booked</Badge>}
                            {lead.status === "replied" && (
                              <button
                                onClick={() => setReplyViewLead(lead)}
                                className="text-green-500 hover:text-green-700"
                                title="View reply"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                              </button>
                            )}
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
                            onClick={() => setPreviewState({ leadIndex: leads.indexOf(lead), tab: lead.currentFollowUp ?? 0 })}
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
                              <DropdownMenuItem onClick={() => setPreviewState({ leadIndex: leads.indexOf(lead), tab: 0 })}>
                                <Eye className="h-4 w-4 mr-2" /> Preview email
                              </DropdownMenuItem>
                              {lead.status === "replied" && (
                                <DropdownMenuItem onClick={() => setReplyViewLead(lead)}>
                                  <MessageSquare className="h-4 w-4 mr-2" /> View reply
                                </DropdownMenuItem>
                              )}
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
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => {
                                  if (confirm(`Delete ${lead.firstName} ${lead.lastName} (${lead.email})?`)) {
                                    deleteLeadMutation.mutate(lead.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete lead
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

      {/* Dialogs */}
      <TestEmailDialog
        open={testEmailOpen}
        onOpenChange={setTestEmailOpen}
        inboxes={inboxes ?? []}
        leads={leads ?? []}
      />

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

      {previewState && leads && (
        <EmailPreviewDialog
          leads={leads}
          initialLeadIndex={previewState.leadIndex}
          followupIndex={previewState.tab}
          open={!!previewState}
          onOpenChange={(v) => { if (!v) setPreviewState(null); }}
        />
      )}

      {previewAllOpen && leads && leads.length > 0 && (
        <EmailPreviewDialog
          leads={leads}
          initialLeadIndex={0}
          followupIndex={0}
          open={previewAllOpen}
          onOpenChange={(v) => { if (!v) setPreviewAllOpen(false); }}
        />
      )}

      {replyViewLead && (
        <ReplyViewerDialog
          lead={replyViewLead}
          open={!!replyViewLead}
          onOpenChange={(v) => { if (!v) setReplyViewLead(null); }}
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
