// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import Image from "next/image";
import googleLogo from "@/resources/google_logo.png";

const googleButtonClassName = [
  "flex h-10 w-full items-center justify-center gap-[10px] rounded-[4px]",
  "border border-[#747775] bg-white px-3 py-0",
  "text-sm font-medium leading-5 text-[#1f1f1f] [font-family:Roboto,Arial,sans-serif]",
  "transition-colors hover:bg-[#f8fafd] disabled:cursor-not-allowed disabled:opacity-60",
].join(" ");

function GoogleLogo() {
  return (
    <Image
      src={googleLogo}
      alt=""
      width={18}
      height={18}
      aria-hidden="true"
      className="shrink-0"
      style={{ width: 18, height: "auto" }}
    />
  );
}

export function GoogleAuthButton({
  children,
  disabled,
  href,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  if (href) {
    return (
      <a href={href} className={googleButtonClassName}>
        <GoogleLogo />
        <span>{children}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={googleButtonClassName}
    >
      <GoogleLogo />
      <span>{children}</span>
    </button>
  );
}
