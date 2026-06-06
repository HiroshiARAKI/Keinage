// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Keinage",
    short_name: "Keinage",
    description: "Customizable digital signage web app",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/icon1.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon2.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
