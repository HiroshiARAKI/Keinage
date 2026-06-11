// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import {
  UmbrellaIcon,
  WeatherConditionIcon,
} from "@/components/board/WeatherIcons";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth";
import type { WeatherCondition } from "@/lib/weather/types";

const CONDITIONS: WeatherCondition[] = [
  "clear",
  "partly-cloudy",
  "cloudy",
  "rain",
  "snow",
  "thunder",
  "fog",
  "unknown",
];

export default async function SuperOwnerWeatherIconsPage() {
  const session = await getSessionUser();

  if (!session?.user.isSuperOwner) {
    redirect("/boards");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Weather Icons</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Provider-independent weather icon preview.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {CONDITIONS.map((condition) => (
          <Card key={condition}>
            <CardHeader>
              <CardTitle className="font-mono">{condition}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex min-h-40 items-center justify-center rounded-xl bg-slate-900 text-white">
                <WeatherConditionIcon
                  condition={condition}
                  className="size-28"
                />
              </div>
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle className="font-mono">umbrella</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex min-h-40 items-center justify-center rounded-xl bg-slate-900 text-white">
              <UmbrellaIcon className="size-24" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
