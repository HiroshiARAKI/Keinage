// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Trash2,
  Plus,
  Save,
  Pencil,
  Check,
  X,
  Lock,
  Globe,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { templates } from "@/lib/templates";
import { TemplateConfigEditor } from "@/components/dashboard/config-editors";
import MediaUploadZone from "@/components/dashboard/MediaUploadZone";
import CallScreenAdmin from "@/components/dashboard/CallScreenAdmin";
import { BoardSchedulePanel } from "@/components/dashboard/BoardSchedulePanel";
import type { Board, MediaItem, Message, PublicBoardPlan } from "@/types";

interface BoardDetail extends Board {
  mediaItems: MediaItem[];
  messages: Message[];
  boardPlan?: PublicBoardPlan;
}

const DEFAULT_BOARD_PLAN: PublicBoardPlan = {
  watermark: false,
  scheduling: "full",
  menuItemImages: true,
};

export default function BoardEditClient({ boardId }: { boardId: string }) {
  const router = useRouter();
  const { t, formatDateTime, getTemplateCopy } = useLocale();
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [config, setConfig] = useState<Record<string, unknown>>({});

  // New message state
  const [newMsgContent, setNewMsgContent] = useState("");
  const [newMsgPriority, setNewMsgPriority] = useState("0");

  // Message editing state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editMsgContent, setEditMsgContent] = useState("");
  const [editMsgPriority, setEditMsgPriority] = useState("");

  const fetchBoard = useCallback(async () => {
    const res = await fetch(`/api/boards/${boardId}`);
    if (!res.ok) {
      setError(t("boardEdit.notFound"));
      setLoading(false);
      return;
    }
    const data: BoardDetail = await res.json();
    setBoard(data);
    setName(data.name);
    setIsActive(data.isActive);
    setVisibility(data.visibility === "public" ? "public" : "private");
    const parsed =
      typeof data.config === "string" ? JSON.parse(data.config) : data.config;
    setConfig(parsed && typeof parsed === "object" ? parsed : {});
    setLoading(false);
  }, [boardId, t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchBoard();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchBoard]);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/boards/${boardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, isActive, visibility, config }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? t("error.createFailed"));
    } else {
      await fetchBoard();
    }
    setSaving(false);
  }

  async function handleDelete() {
    const res = await fetch(`/api/boards/${boardId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/boards");
    }
  }

  async function handleAddMessage() {
    if (!newMsgContent.trim()) return;

    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boardId,
        content: newMsgContent,
        priority: parseInt(newMsgPriority, 10) || 0,
      }),
    });

    if (res.ok) {
      setNewMsgContent("");
      setNewMsgPriority("0");
      await fetchBoard();
    }
  }

  async function handleDeleteMessage(msgId: string) {
    const res = await fetch(`/api/messages/${msgId}`, { method: "DELETE" });
    if (res.ok) {
      await fetchBoard();
    }
  }

  function startEditMessage(msg: Message) {
    setEditingMsgId(msg.id);
    setEditMsgContent(msg.content);
    setEditMsgPriority(String(msg.priority));
  }

  function cancelEditMessage() {
    setEditingMsgId(null);
    setEditMsgContent("");
    setEditMsgPriority("");
  }

  async function handleSaveMessage(msgId: string) {
    const res = await fetch(`/api/messages/${msgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: editMsgContent,
        priority: parseInt(editMsgPriority, 10) || 0,
      }),
    });
    if (res.ok) {
      setEditingMsgId(null);
      await fetchBoard();
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">{t("common.loading")}</div>;
  }

  if (!board) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">{error ?? t("boardEdit.notFound")}</p>
        <Link
          href="/boards"
          className={`mt-4 ${buttonVariants({ variant: "outline" })}`}
        >
          {t("boards.backToList")}
        </Link>
      </div>
    );
  }

  const template = templates[board.templateId as keyof typeof templates];
  const templateCopy = getTemplateCopy(board.templateId);
  const supportsScheduleTemplate =
    board.templateId === "simple" || board.templateId === "photo-clock";
  const boardPlan = board.boardPlan ?? DEFAULT_BOARD_PLAN;
  const supportsMessages =
    board.templateId === "simple" ||
    board.templateId === "message";
  const supportsMedia =
    board.templateId === "simple" ||
    board.templateId === "photo-clock" ||
    board.templateId === "restaurant-menu";

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/boards"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ArrowLeft data-icon="inline-start" />
          {t("boards.backToList")}
        </Link>
        <a
          href={`/${boardId}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink data-icon="inline-start" />
          {t("boardEdit.openDisplayUrl")}
        </a>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left: Board settings (2 cols) */}
        <div className="min-w-0 space-y-6 md:col-span-2">
          {/* Basic info */}
          <Card>
            <CardHeader>
              <CardTitle>{t("boardEdit.basicTitle")}</CardTitle>
              <CardDescription>
                {t("boardEdit.templateDescription", {
                  name: template ? templateCopy.name : board.templateId,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="board-name">{t("boards.nameLabel")}</Label>
                <Input
                  id="board-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Switch
                  id="board-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
                <Label htmlFor="board-active">
                  {t("boardEdit.activate")}
                </Label>
                <Badge variant={isActive ? "default" : "secondary"}>
                  {isActive ? t("common.enabled") : t("common.disabled")}
                </Badge>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <div className="space-y-1">
                  <Label htmlFor="board-visibility">{t("boards.visibilityLabel")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("boardEdit.visibilityDescription")}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm ${
                      visibility === "private"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Lock className="size-3.5" />
                    {t("common.private")}
                  </div>
                  <Switch
                    id="board-visibility"
                    checked={visibility === "public"}
                    onCheckedChange={(checked) => setVisibility(checked ? "public" : "private")}
                  />
                  <div
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm ${
                      visibility === "public"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Globe className="size-3.5" />
                    {t("common.public")}
                  </div>
                  <Badge variant={visibility === "public" ? "default" : "secondary"}>
                    {visibility === "public"
                      ? t("boards.visibilityPublicStatus")
                      : t("boards.visibilityPrivateStatus")}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Config Editor */}
          <Card>
            <CardHeader>
              <CardTitle>{t("boardEdit.templateSettingsTitle")}</CardTitle>
              <CardDescription>
                {t("boardEdit.templateSettingsDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TemplateConfigEditor
                templateId={board.templateId}
                config={config}
                onChange={setConfig}
                mediaItems={board.mediaItems}
                boardPlan={boardPlan}
              />
            </CardContent>
          </Card>

          {/* Call screen admin (call-number template only) */}
          {board.templateId === "call-number" && (
            <CallScreenAdmin
              boardId={boardId}
              config={config}
              onUpdateConfig={setConfig}
            />
          )}

          {/* Messages */}
          {supportsMessages && (
          <Card>
            <CardHeader>
              <CardTitle>{t("boardEdit.messagesTitle")}</CardTitle>
              <CardDescription>
                {t("boardEdit.messagesCount", { count: board.messages.length })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add new message */}
              <div className="flex flex-wrap gap-2">
                <Input
                  value={newMsgContent}
                  onChange={(e) => setNewMsgContent(e.target.value)}
                  placeholder={t("boardEdit.messagePlaceholder")}
                  className="min-w-0 flex-1 basis-40"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleAddMessage();
                    }
                  }}
                />
                {board.templateId !== "call-number" && (
                <Input
                  value={newMsgPriority}
                  onChange={(e) => setNewMsgPriority(e.target.value)}
                  placeholder={t("boardEdit.priorityPlaceholder")}
                  type="number"
                  min={0}
                  className="w-20"
                />
                )}
                <Button type="button" size="sm" onClick={handleAddMessage}>
                  <Plus data-icon="inline-start" />
                  {t("common.add")}
                </Button>
              </div>

              <Separator />

              {/* Message list */}
              {board.messages.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t("board.message.none")}
                </p>
              ) : (
                <div className="space-y-2">
                  {[...board.messages]
                    .sort((a, b) => b.priority - a.priority)
                    .map((msg) =>
                      editingMsgId === msg.id ? (
                        <div
                          key={msg.id}
                          className="flex flex-col gap-2 rounded-md border border-primary/30 bg-accent/30 px-3 py-2 text-sm sm:flex-row sm:items-center"
                        >
                          <Input
                            value={editMsgPriority}
                            onChange={(e) => setEditMsgPriority(e.target.value)}
                            type="number"
                            min={0}
                            className="w-20 shrink-0 sm:w-16"
                          />
                          <Input
                            value={editMsgContent}
                            onChange={(e) => setEditMsgContent(e.target.value)}
                            className="min-w-0 flex-1"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                handleSaveMessage(msg.id);
                              }
                              if (e.key === "Escape") {
                                cancelEditMessage();
                              }
                            }}
                            autoFocus
                          />
                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleSaveMessage(msg.id)}
                            >
                              <Check className="size-3.5 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={cancelEditMessage}
                            >
                              <X className="size-3.5 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={msg.id}
                          className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
                        >
                          <Badge variant="secondary" className="shrink-0">
                            P{msg.priority}
                          </Badge>
                          <span className="flex-1 truncate">{msg.content}</span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => startEditMessage(msg)}
                          >
                            <Pencil className="size-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleDeleteMessage(msg.id)}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      ),
                    )}
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* Media items */}
          {supportsMedia && (
          <Card>
            <CardHeader>
              <CardTitle>{t("boardEdit.mediaTitle")}</CardTitle>
              <CardDescription>
                {t("boardEdit.mediaCount", { count: board.mediaItems.length })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <MediaUploadZone
                boardId={boardId}
                mediaItems={board.mediaItems}
                onUpdate={fetchBoard}
                scheduleConfig={supportsScheduleTemplate ? config : undefined}
                scheduling={boardPlan.scheduling}
                onScheduleConfigChange={supportsScheduleTemplate ? setConfig : undefined}
              />
              {supportsScheduleTemplate && (
                <>
                  <Separator />
                  <BoardSchedulePanel
                    templateId={board.templateId}
                    config={config}
                    mediaItems={board.mediaItems}
                    messages={board.messages}
                    scheduling={boardPlan.scheduling}
                    onChange={setConfig}
                  />
                </>
              )}
            </CardContent>
          </Card>
          )}
        </div>

        {/* Right: Actions sidebar */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("boardEdit.actionsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" onClick={handleSave} disabled={saving}>
                <Save data-icon="inline-start" />
                {saving ? t("boardEdit.saving") : t("common.save")}
              </Button>

              <a
                href={`/${boardId}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline", className: "w-full" })}
              >
                <ExternalLink data-icon="inline-start" />
                {t("boardEdit.openDisplayUrl")}
              </a>

              <Separator />

              <Dialog>
                <DialogTrigger
                render={
                  <Button variant="destructive" className="w-full">
                    <Trash2 data-icon="inline-start" />
                    {t("boardEdit.delete")}
                  </Button>
                }
              />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("boardEdit.deleteConfirmTitle")}</DialogTitle>
                    <DialogDescription>
                      {t("boardEdit.deleteConfirmDescription", { name: board.name })}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose
                      render={<Button variant="outline">{t("common.cancel")}</Button>}
                    />
                    <Button variant="destructive" onClick={handleDelete}>
                      {t("common.delete")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {error && (
            <Card className="border-destructive">
              <CardContent className="py-3">
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="py-4 text-xs text-muted-foreground">
              <div>{t("common.id")}: <span className="font-mono">{board.id}</span></div>
              <div>{t("common.createdAt")}: {formatDateTime(board.createdAt)}</div>
              <div>{t("common.updatedAt")}: {formatDateTime(board.updatedAt)}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
