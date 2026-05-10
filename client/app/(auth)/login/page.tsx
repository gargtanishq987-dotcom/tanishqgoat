"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { APP_VERSION } from "@/lib/version";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "Login failed");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Mail className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-lg text-gray-900 dark:text-gray-100">Cold Email</span>
        </div>
        <CardTitle>Welcome</CardTitle>
        <CardDescription>Click below to enter the dashboard</CardDescription>
        <span className="inline-block text-xs font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{APP_VERSION}</span>
      </CardHeader>
      <CardContent>
        <Button className="w-full" onClick={onLogin} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Enter Dashboard
        </Button>
      </CardContent>
    </Card>
  );
}
