"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle, ExternalLink, Eye, EyeOff, Trash2, Plus, Play, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { AppSettings } from "@/lib/types";
import { formatRelative, formatDateTime } from "@/lib/utils";

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Rome",
  "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney",
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CRON_INTERVALS = [
  { value: 1,   label: "Every 1 minute" },
  { value: 2,   label: "Every 2 minutes" },
  { value: 5,   label: "Every 5 minutes" },
  { value: 10,  label: "Every 10 minutes" },
  { value: 15,  label: "Every 15 minutes" },
  { value: 30,  label: "Every 30 minutes" },
  { value: 60,  label: "Every hour" },
  { value: 120, label: "Every 2 hours" },
  { value: 360, label: "Every 6 hours" },
];

function GeneralSettings() {
  const qc = useQueryClient();
  const [runningNow, setRunningNow] = useState(false);
  const [cronEnabled, setCronEnabled] = useState(true);
  const [cronIntervalMinutes, setCronIntervalMinutes] = useState(5);

  const { data: settings, isLoading } = useQuery<AppSettings>({
    queryKey: ["settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()).then((d) => d.data),
  });

  const { register, handleSubmit, reset, control, watch, setValue, formState: { isDirty } } = useForm<AppSettings>();

  useEffect(() => {
    if (settings) {
      reset(settings);
      setCronEnabled(settings.cronEnabled ?? true);
      setCronIntervalMinutes(settings.cronIntervalMinutes ?? 5);
    }
  }, [settings, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<AppSettings>) =>
      fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Settings saved");
        qc.invalidateQueries({ queryKey: ["settings"] });
      } else {
        toast.error(res.error ?? "Failed to save");
      }
    },
  });

  const saveCronMutation = useMutation({
    mutationFn: () =>
      fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cronEnabled, cronIntervalMinutes }),
      }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Schedule saved");
        qc.invalidateQueries({ queryKey: ["settings"] });
      } else {
        toast.error(res.error ?? "Failed to save");
      }
    },
  });

  async function handleRunNow() {
    setRunningNow(true);
    try {
      const res = await fetch("/api/cron", { method: "POST" }).then((r) => r.json());
      if (res.success) {
        const d = res.data;
        if (d) toast.success(`Done — sent ${d.sent}, follow-ups ${d.followups}, replies ${d.replies}`);
        else toast.success("Worker ran successfully");
        qc.invalidateQueries({ queryKey: ["settings"] });
      } else {
        toast.error(res.error ?? "Worker failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setRunningNow(false);
    }
  }

  const sendingDays = watch("sendingDays") ?? [];

  function toggleDay(day: number) {
    const current = sendingDays;
    const next = current.includes(day) ? current.filter((d: number) => d !== day) : [...current, day];
    setValue("sendingDays", next, { shouldDirty: true });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit((d) => updateMutation.mutate(d))} className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Sending Window</CardTitle>
          <CardDescription>Default hours and days for sending emails</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Controller
              control={control}
              name="timezone"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Window start</Label>
              <Input type="time" {...register("sendingWindowStart")} />
            </div>
            <div className="space-y-1.5">
              <Label>Window end</Label>
              <Input type="time" {...register("sendingWindowEnd")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sending days</Label>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map((day, i) => (
                <label key={i} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={sendingDays.includes(i)}
                    onCheckedChange={() => toggleDay(i)}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{day}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sending Limits</CardTitle>
          <CardDescription>Delays between emails to avoid spam detection</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Default daily limit per inbox</Label>
            <Input type="number" min={1} max={500} {...register("defaultDailyLimit", { valueAsNumber: true })} />
            <p className="text-xs text-gray-500">New inboxes will start at this limit (default: 30)</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Min delay (seconds)</Label>
              <Input type="number" min={30} {...register("minDelaySec", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Max delay (seconds)</Label>
              <Input type="number" min={30} {...register("maxDelaySec", { valueAsNumber: true })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compliance</CardTitle>
          <CardDescription>Unsubscribe footer appended to all emails</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea rows={3} {...register("unsubscribeText")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Worker Schedule
          </CardTitle>
          <CardDescription>Controls how often the email worker runs to process queued leads and follow-ups</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Enable automatic worker</p>
              <p className="text-xs text-gray-500 mt-0.5">When disabled, no emails will be sent automatically</p>
            </div>
            <Switch
              checked={cronEnabled}
              onCheckedChange={(v) => setCronEnabled(v)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Run interval</Label>
            <Select
              value={String(cronIntervalMinutes)}
              onValueChange={(v) => setCronIntervalMinutes(Number(v))}
              disabled={!cronEnabled}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRON_INTERVALS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              GitHub Actions triggers the worker every 10 min — this controls how often it actually processes emails. Set higher to throttle, lower to send faster.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Last run</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {settings?.lastCronRunAt
                  ? `${formatRelative(settings.lastCronRunAt)} · ${formatDateTime(settings.lastCronRunAt)}`
                  : "Never"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Next run</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {!cronEnabled
                  ? "Disabled"
                  : settings?.lastCronRunAt
                    ? formatDateTime(settings.lastCronRunAt + cronIntervalMinutes * 60_000)
                    : "On next cron tick"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <Button
              type="button"
              size="sm"
              onClick={() => saveCronMutation.mutate()}
              disabled={saveCronMutation.isPending}
            >
              {saveCronMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save schedule
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRunNow}
              disabled={runningNow}
            >
              {runningNow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run worker now
            </Button>
            <p className="text-xs text-gray-400">Run Now bypasses the interval — useful for testing</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={updateMutation.isPending || !isDirty}>
          {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save settings
        </Button>
      </div>
    </form>
  );
}

function CredentialsSettings() {
  const qc = useQueryClient();
  const [showSecret, setShowSecret] = useState(false);

  const { data: creds, isLoading } = useQuery({
    queryKey: ["credentials"],
    queryFn: () => fetch("/api/credentials").then((r) => r.json()).then((d) => d.data),
  });

  const { register, handleSubmit, watch } = useForm({
    defaultValues: {
      googleClientId: "",
      googleClientSecret: "",
      googleRedirectUri: "",
    },
  });

  useEffect(() => {
    if (creds) {
      // Pre-fill non-secret fields
    }
  }, [creds]);

  const saveMutation = useMutation({
    mutationFn: (data: { googleClientId: string; googleClientSecret: string; googleRedirectUri: string }) =>
      fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Credentials saved — connect Gmail to test");
        qc.invalidateQueries({ queryKey: ["credentials"] });
      } else {
        toast.error(res.error ?? "Failed to save");
      }
    },
  });

  const defaultRedirectUri = typeof window !== "undefined"
    ? `${window.location.origin}/api/gmail/callback`
    : "/api/gmail/callback";

  return (
    <div className="max-w-2xl space-y-6">
      {/* Status */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            ) : creds?.configured ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            <div>
              <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                Gmail OAuth — {creds?.configured ? "configured" : "not configured"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {creds?.configured
                  ? `Last updated ${creds.updatedAt ? new Date(creds.updatedAt).toLocaleDateString() : "—"}`
                  : "Enter your Google OAuth app credentials below"}
              </p>
            </div>
            {creds?.configured && <Badge variant="success" className="ml-auto">Active</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* Setup guide */}
      <Card>
        <CardHeader>
          <CardTitle>Setup Guide</CardTitle>
          <CardDescription>Create a Google Cloud OAuth app in 3 steps</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <div className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-bold">1</span>
            <span>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-blue-600 underline inline-flex items-center gap-0.5">Google Cloud Console <ExternalLink className="h-3 w-3" /></a> → Create OAuth 2.0 Client ID (Web application)</span>
          </div>
          <div className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-bold">2</span>
            <div>
              Add this as an Authorized Redirect URI:
              <code className="block mt-1 bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 text-xs font-mono break-all">{defaultRedirectUri}</code>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-bold">3</span>
            <span>Enable the <strong>Gmail API</strong> in APIs & Services → Library</span>
          </div>
        </CardContent>
      </Card>

      {/* Credentials form */}
      <Card>
        <CardHeader>
          <CardTitle>OAuth Credentials</CardTitle>
          <CardDescription>Paste your Google OAuth 2.0 client credentials</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((d) => saveMutation.mutate(d))}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>Google Client ID</Label>
              <Input
                placeholder="123456789-abc....apps.googleusercontent.com"
                defaultValue={creds?.googleClientId ?? ""}
                {...register("googleClientId", { required: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Google Client Secret</Label>
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  placeholder={creds?.configured ? "••••••••••••••••  (leave blank to keep existing)" : "GOCSPX-..."}
                  {...register("googleClientSecret")}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Redirect URI</Label>
              <Input
                defaultValue={defaultRedirectUri}
                {...register("googleRedirectUri", { required: true })}
              />
              <p className="text-xs text-gray-500">Must match exactly what's registered in Google Cloud Console</p>
            </div>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save credentials
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Worker secret */}
      <Card>
        <CardHeader>
          <CardTitle>Worker Secret</CardTitle>
          <CardDescription>Used to trigger the email sending worker via cron</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Set <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">WORKER_SECRET</code> in your environment variables and call:
          </p>
          <code className="block bg-gray-100 dark:bg-gray-800 rounded px-3 py-2 text-xs font-mono break-all">
            POST {typeof window !== "undefined" ? window.location.origin : ""}/api/worker<br />
            x-worker-secret: YOUR_SECRET
          </code>
          <p className="text-xs text-gray-500">
            Trigger this every 5 minutes via cron (Vercel Cron, GitHub Actions, etc.) to process queued emails and follow-ups.
          </p>
        </CardContent>
      </Card>

      {/* Encryption key */}
      <Card>
        <CardHeader>
          <CardTitle>Encryption Key</CardTitle>
          <CardDescription>Used to encrypt Gmail refresh tokens stored in Firestore</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Set <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">ENCRYPTION_KEY</code> in your environment — a 64-character hex string. Generate with:
          </p>
          <code className="block mt-2 bg-gray-100 dark:bg-gray-800 rounded px-3 py-2 text-xs font-mono">
            openssl rand -hex 32
          </code>
        </CardContent>
      </Card>
    </div>
  );
}

function BlocklistSettings() {
  const qc = useQueryClient();
  const [input, setInput] = useState("");

  const { data: emails = [], isLoading } = useQuery<string[]>({
    queryKey: ["blocklist"],
    queryFn: () => fetch("/api/blocklist").then((r) => r.json()).then((d) => d.data ?? []),
  });

  const addMutation = useMutation({
    mutationFn: (newEmails: string[]) =>
      fetch("/api/blocklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: newEmails }),
      }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Added to block list");
        setInput("");
        qc.invalidateQueries({ queryKey: ["blocklist"] });
      } else {
        toast.error(res.error ?? "Failed");
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: (email: string) =>
      fetch("/api/blocklist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blocklist"] }),
  });

  function handleAdd() {
    const newEmails = input
      .split(/[\n,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@"));
    if (!newEmails.length) return toast.error("No valid emails found");
    addMutation.mutate(newEmails);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Block List</CardTitle>
          <CardDescription>Emails on this list will never be contacted — checked on every import and send</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Add emails (one per line, or comma/semicolon separated)</Label>
            <Textarea
              rows={4}
              placeholder={"unsubscribed@company.com\ndonotemail@example.com"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
          <Button onClick={handleAdd} disabled={addMutation.isPending || !input.trim()}>
            {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add to block list
          </Button>

          <Separator />

          {isLoading ? (
            <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          ) : emails.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No blocked emails yet</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              <p className="text-xs text-gray-500 mb-2">{emails.length} blocked email{emails.length !== 1 ? "s" : ""}</p>
              {emails.map((email) => (
                <div key={email} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 group">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{email}</span>
                  <button
                    onClick={() => removeMutation.mutate(email)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Configure your platform</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="credentials">API & Credentials</TabsTrigger>
          <TabsTrigger value="blocklist">Block List</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-6">
          <GeneralSettings />
        </TabsContent>
        <TabsContent value="credentials" className="mt-6">
          <CredentialsSettings />
        </TabsContent>
        <TabsContent value="blocklist" className="mt-6">
          <BlocklistSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
