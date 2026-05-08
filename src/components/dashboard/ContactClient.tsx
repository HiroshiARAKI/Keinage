// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTACT_CATEGORIES,
  CONTACT_CATEGORY_LABELS,
  type ContactCategory,
} from "@/lib/contact-shared";

export function ContactForm() {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ContactCategory>("technical");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setNotice(null);

    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, category, body }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setNotice({
        ok: false,
        message: typeof data.error === "string"
          ? data.error
          : "問い合わせを送信できませんでした。",
      });
      setSubmitting(false);
      return;
    }

    setTitle("");
    setCategory("technical");
    setBody("");
    setNotice({ ok: true, message: "問い合わせを送信しました。" });
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="contact-title">件名</Label>
        <Input
          id="contact-title"
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-category">カテゴリ</Label>
        <select
          id="contact-category"
          value={category}
          onChange={(event) => setCategory(event.target.value as ContactCategory)}
          className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {CONTACT_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {CONTACT_CATEGORY_LABELS[item]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-body">内容</Label>
        <Textarea
          id="contact-body"
          value={body}
          maxLength={4000}
          className="min-h-40"
          onChange={(event) => setBody(event.target.value)}
          required
        />
      </div>

      {notice && (
        <p className={`text-sm ${notice.ok ? "text-green-600" : "text-destructive"}`}>
          {notice.message}
        </p>
      )}

      <Button type="submit" disabled={submitting}>
        <Send className="size-4" />
        {submitting ? "送信中..." : "問い合わせを送信"}
      </Button>
    </form>
  );
}

export function ExternalSupportLinks({ showUpgrade }: { showUpgrade?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {showUpgrade && (
        <Link href="/billing" className={buttonVariants()}>
          プランを確認する
        </Link>
      )}
      <a
        href="https://github.com/HiroshiARAKI/Keinage/issues"
        target="_blank"
        rel="noreferrer"
        className={buttonVariants({ variant: "outline" })}
      >
        GitHub Issues
        <ExternalLink className="size-4" />
      </a>
      <a
        href="https://github.com/HiroshiARAKI/Keinage/discussions"
        target="_blank"
        rel="noreferrer"
        className={buttonVariants({ variant: "outline" })}
      >
        GitHub Discussions
        <ExternalLink className="size-4" />
      </a>
    </div>
  );
}
