// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0

export type BoardShareResult = "shared" | "copied" | "failed" | "cancelled";

const SHARE_TEXT = "Keinage board";

export function buildPublicBoardUrl(boardId: string) {
  return new URL(`/${encodeURIComponent(boardId)}`, window.location.origin).toString();
}

async function writeToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("clipboard_copy_failed");
}

export async function copyPublicBoardUrl(boardId: string): Promise<BoardShareResult> {
  try {
    await writeToClipboard(buildPublicBoardUrl(boardId));
    return "copied";
  } catch {
    return "failed";
  }
}

export async function sharePublicBoard(input: {
  boardId: string;
  title: string;
}): Promise<BoardShareResult> {
  const url = buildPublicBoardUrl(input.boardId);

  if (typeof navigator.share !== "function") {
    return copyPublicBoardUrl(input.boardId);
  }

  try {
    await navigator.share({
      title: input.title,
      text: SHARE_TEXT,
      url,
    });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return "cancelled";
    }
    return copyPublicBoardUrl(input.boardId);
  }
}
