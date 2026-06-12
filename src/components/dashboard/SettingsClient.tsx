// Copyright 2026 Hiroshi Araki (https://hiroshi.araki.tech)
// SPDX-License-Identifier: Apache-2.0
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import { WEATHER_AREAS } from "@/lib/weather-areas";
import type { WeatherPrefecture } from "@/lib/weather-areas";
import { PinInput } from "@/components/auth/PinInput";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { useTheme, type Theme } from "@/components/dashboard/ThemeProvider";
import { getLocaleDefinition, SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n";
import { planLimitMessageKey } from "@/lib/plan-limit";
import { QRCodeSVG } from "qrcode.react";

interface UploadedFile {
  filename: string;
  filePath: string;
  thumbPath: string | null;
  type: string;
  size: number;
  modifiedAt: string;
  boards: { boardId: string; boardName: string | null }[];
}

interface PasskeyCredential {
  id: string;
  name: string;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

interface OpenWeatherCountry {
  code: string;
  count: number;
}

interface OpenWeatherLocation {
  id: string;
  name: string;
  displayName?: string;
  prefectureName?: string;
  state: string;
  country: string;
  lat: number;
  lon: number;
}

const FEATURED_WEATHER_COUNTRIES = new Set(["JP", "US", "CN"]);

function openWeatherCityLabel(city: OpenWeatherLocation): string {
  return city.displayName ?? city.name;
}

function OpenWeatherCityName({ city }: { city: OpenWeatherLocation }) {
  const areaLabel = city.prefectureName || city.state;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate">{openWeatherCityLabel(city)}</span>
      {areaLabel && (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {areaLabel}
        </span>
      )}
    </span>
  );
}

export function SettingsClient({
  role,
  currentUserId,
  initialOrganizationName,
  isOwner,
  isSuperOwner,
  hasPasswordAuth,
  weatherProvider,
  defaultWeatherCityId,
}: {
  role: "admin" | "general";
  currentUserId: string;
  initialOrganizationName: string;
  isOwner: boolean;
  isSuperOwner: boolean;
  hasPasswordAuth: boolean;
  weatherProvider: "openweatherapi" | "tenkiyoho_api_jp";
  defaultWeatherCityId: string;
}) {
  const router = useRouter();
  const [cityId, setCityId] = useState(defaultWeatherCityId);
  const [selectedPref, setSelectedPref] = useState<WeatherPrefecture | null>(
    null,
  );
  const [weatherCountry, setWeatherCountry] = useState("");
  const [weatherCountries, setWeatherCountries] = useState<OpenWeatherCountry[]>([]);
  const [citySearch, setCitySearch] = useState("");
  const [openWeatherCities, setOpenWeatherCities] = useState<OpenWeatherLocation[]>([]);
  const [selectedOpenWeatherCity, setSelectedOpenWeatherCity] =
    useState<OpenWeatherLocation | null>(null);
  const [citySearchLoading, setCitySearchLoading] = useState(false);
  const [citySearchOpen, setCitySearchOpen] = useState(false);
  const [openWeatherApiKey, setOpenWeatherApiKey] = useState("");
  const [openWeatherApiKeyConfigured, setOpenWeatherApiKeyConfigured] = useState(false);
  const [openWeatherApiKeySaving, setOpenWeatherApiKeySaving] = useState(false);
  const [openWeatherApiKeyResult, setOpenWeatherApiKeyResult] =
    useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);
  const [mediaList, setMediaList] = useState<UploadedFile[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [maxLongEdge, setMaxLongEdge] = useState(3840);
  const [resizeEnabled, setResizeEnabled] = useState(true);
  const [planMaxResolution, setPlanMaxResolution] = useState<number | null>(null);
  const [imageSaving, setImageSaving] = useState(false);
  const [imageSaved, setImageSaved] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t, formatDate } = useLocale();
  const regionNames = useMemo(
    () => new Intl.DisplayNames([locale], { type: "region" }),
    [locale],
  );
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);
  const [localeSaving, setLocaleSaving] = useState(false);

  // PIN/Email change states
  const [pinConfigured, setPinConfigured] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinStep, setPinStep] = useState<"current" | "new" | "confirm">("current");
  const [pinChanging, setPinChanging] = useState(false);
  const [pinChangeResult, setPinChangeResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // PIN setup states (for users without a PIN)
  const [setupPin, setSetupPin] = useState("");
  const [setupConfirmPin, setSetupConfirmPin] = useState("");
  const [setupPinStep, setSetupPinStep] = useState<"new" | "confirm">("new");
  const [setupPinSaving, setSetupPinSaving] = useState(false);
  const [setupPinResult, setSetupPinResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [storedEmail, setStoredEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSaved, setEmailSaved] = useState<{ ok: boolean; msg: string } | null>(null);
  const [storedOrganizationName, setStoredOrganizationName] = useState(initialOrganizationName);
  const [organizationNameDraft, setOrganizationNameDraft] = useState(initialOrganizationName);
  const [organizationSaving, setOrganizationSaving] = useState(false);
  const [organizationResult, setOrganizationResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Password change states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordChangeResult, setPasswordChangeResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Auth expiry (login cache period) states
  const [authExpireDays, setAuthExpireDays] = useState(30);
  const [authExpirySaving, setAuthExpirySaving] = useState(false);
  const [authExpirySaved, setAuthExpirySaved] = useState<{ ok: boolean; msg: string } | null>(null);
  const [fullAuthExpiry, setFullAuthExpiry] = useState<string | null>(null);
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const [passkeyOwnerRequired, setPasskeyOwnerRequired] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [passkeyLoading, setPasskeyLoading] = useState(true);
  const [passkeyWorking, setPasskeyWorking] = useState(false);
  const [passkeyResult, setPasskeyResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // UserId change states
  const [newUserId, setNewUserId] = useState("");
  const [userIdChanging, setUserIdChanging] = useState(false);
  const [userIdChangeResult, setUserIdChangeResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const currentLocaleDefinition = getLocaleDefinition(locale);

  const fetchPasskeys = useCallback(async () => {
    if (!isOwner) {
      setPasskeyLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/account/webauthn/credentials");
      if (!res.ok) return;
      const data = await res.json();
      setPasskeyEnabled(Boolean(data.enabled));
      setPasskeyOwnerRequired(Boolean(data.ownerRequired));
      setPasskeys(Array.isArray(data.credentials) ? data.credentials : []);
    } finally {
      setPasskeyLoading(false);
    }
  }, [isOwner]);

  const fetchMedia = useCallback(async () => {
    if (role !== "admin") {
      setMediaLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/media/files");
      if (res.ok) {
        setMediaList(await res.json());
      }
    } finally {
      setMediaLoading(false);
    }
  }, [role]);

  // Load current settings
  useEffect(() => {
    (async () => {
      if (role !== "admin") {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const data = await res.json();
        const saved = data.weatherCityId ?? defaultWeatherCityId;
        setCityId(saved);
        if (weatherProvider === "tenkiyoho_api_jp") {
          const pref = WEATHER_AREAS.find((p) =>
            p.cities.some((c) => c.id === saved),
          );
          if (pref) setSelectedPref(pref);
        } else {
          const [countriesResponse, cityResponse] = await Promise.all([
            fetch("/api/weather/locations"),
            fetch(`/api/weather/locations?id=${encodeURIComponent(saved)}`),
          ]);
          if (countriesResponse.ok) {
            const countriesData = await countriesResponse.json();
            setWeatherCountries(countriesData.countries ?? []);
          }
          const resolvedCityResponse = cityResponse.ok
            ? cityResponse
            : await fetch(
                `/api/weather/locations?id=${encodeURIComponent(defaultWeatherCityId)}`,
              );
          if (resolvedCityResponse.ok) {
            const cityData = await resolvedCityResponse.json();
            if (cityData.city) {
              setCityId(cityData.city.id);
              setSelectedOpenWeatherCity(cityData.city);
              setWeatherCountry(cityData.city.country);
            }
          }
        }
        // Load image resize setting
        if (data.imageMaxLongEdge !== undefined) {
          const val = parseInt(data.imageMaxLongEdge, 10);
          if (val === 0) {
            setResizeEnabled(false);
            setMaxLongEdge(3840);
          } else {
            setResizeEnabled(true);
            setMaxLongEdge(val);
          }
        }
        const planRes = await fetch("/api/billing/plan");
        if (planRes.ok) {
          const planData = await planRes.json();
          const limit = planData?.plan?.limits?.maxResolution;
          if (typeof limit === "number" && Number.isFinite(limit)) {
            setPlanMaxResolution(limit);
            setResizeEnabled(true);
            setMaxLongEdge((current) => Math.min(current || limit, limit));
          }
        }
      } finally {
        setLoading(false);
      }
    })();
    fetchMedia();
    void fetchPasskeys();
    // Resolve dashboard URL for QR code
    (async () => {
      const origin = window.location.origin;
      const hostname = window.location.hostname;
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        try {
          const res = await fetch("/api/network");
          if (res.ok) {
            const { ip } = await res.json();
            if (ip) {
              setDashboardUrl(`${window.location.protocol}//${ip}:${window.location.port}/boards`);
              return;
            }
          }
        } catch { /* fallback below */ }
      }
      setDashboardUrl(`${origin}/boards`);
    })();
    // Load PIN status and email
    fetch("/api/auth/pin/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setPinConfigured(data.pinConfigured);
          if (data.email) setStoredEmail(data.email);
          if (data.authExpireDays) setAuthExpireDays(data.authExpireDays);
          if (data.fullAuthExpiry) setFullAuthExpiry(data.fullAuthExpiry);
        }
      })
      .catch(() => {});
  }, [
    defaultWeatherCityId,
    fetchMedia,
    fetchPasskeys,
    role,
    weatherProvider,
  ]);

  useEffect(() => {
    if (!isSuperOwner || weatherProvider !== "openweatherapi") return;

    let cancelled = false;
    void fetch("/api/super-owner/weather-settings")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setOpenWeatherApiKeyConfigured(Boolean(data.configured));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isSuperOwner, weatherProvider]);

  useEffect(() => {
    const query = citySearch.trim();
    if (
      weatherProvider !== "openweatherapi" ||
      !weatherCountry ||
      query.length < 2
    ) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCitySearchLoading(true);
      try {
        const response = await fetch(
          `/api/weather/locations?country=${encodeURIComponent(weatherCountry)}&q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("City search failed");
        const data = await response.json();
        setOpenWeatherCities(data.cities ?? []);
        setCitySearchOpen(true);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setOpenWeatherCities([]);
          setCitySearchOpen(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setCitySearchLoading(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [citySearch, weatherCountry, weatherProvider]);

  function handlePrefChange(prefName: string | null) {
    if (!prefName) return;
    const pref = WEATHER_AREAS.find((p) => p.name === prefName) ?? null;
    setSelectedPref(pref);
    // Auto-select first city
    if (pref && pref.cities.length > 0) {
      setCityId(pref.cities[0].id);
    }
    setSaved(false);
  }

  function handleCityChange(id: string | null) {
    if (!id) return;
    setCityId(id);
    setSaved(false);
  }

  function handleWeatherCountryChange(country: string | null) {
    if (!country) return;
    setWeatherCountry(country);
    setCitySearch("");
    setOpenWeatherCities([]);
    setCitySearchOpen(false);
    setSelectedOpenWeatherCity(null);
    setSaved(false);
  }

  function handleOpenWeatherCityChange(id: string | null) {
    if (!id) return;
    const city = openWeatherCities.find((item) => item.id === id);
    if (!city) return;
    setSelectedOpenWeatherCity(city);
    setCityId(city.id);
    setCitySearch("");
    setCitySearchOpen(false);
    setSaved(false);
  }

  async function handleOpenWeatherApiKeySave() {
    const apiKey = openWeatherApiKey.trim();
    if (!apiKey) return;

    setOpenWeatherApiKeySaving(true);
    setOpenWeatherApiKeyResult(null);
    try {
      const response = await fetch("/api/super-owner/weather-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (!response.ok) throw new Error("API key save failed");
      const data = await response.json();
      setOpenWeatherApiKey("");
      setOpenWeatherApiKeyConfigured(true);
      if (
        typeof data.weatherCityId === "string" &&
        data.weatherCityId !== cityId
      ) {
        const cityResponse = await fetch(
          `/api/weather/locations?id=${encodeURIComponent(data.weatherCityId)}`,
        );
        if (cityResponse.ok) {
          const cityData = await cityResponse.json();
          if (cityData.city) {
            setCityId(cityData.city.id);
            setWeatherCountry(cityData.city.country);
            setSelectedOpenWeatherCity(cityData.city);
          }
        }
      }
      setOpenWeatherApiKeyResult({
        ok: true,
        msg: t("settings.openWeatherApiSaved"),
      });
    } catch {
      setOpenWeatherApiKeyResult({
        ok: false,
        msg: t("settings.openWeatherApiSaveFailed"),
      });
    } finally {
      setOpenWeatherApiKeySaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weatherCityId: cityId }),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleImageSettingSave() {
    setImageSaving(true);
    setImageSaved(false);
    setImageError(null);
    try {
      const effectiveResizeEnabled = planMaxResolution !== null || resizeEnabled;
      const cappedLongEdge = planMaxResolution === null
        ? maxLongEdge
        : Math.min(maxLongEdge, planMaxResolution);
      const value = effectiveResizeEnabled ? String(cappedLongEdge) : "0";
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageMaxLongEdge: value }),
      });
      if (res.ok) {
        setMaxLongEdge(cappedLongEdge);
        setImageSaved(true);
      } else {
        const data = await res.json().catch(() => ({}));
        const messageKey = planLimitMessageKey(data.code, data.messageKey);
        setImageError(messageKey ? t(messageKey) : data.error ?? t("settings.changeFailed"));
      }
    } catch {
      setImageError(t("error.network"));
    } finally {
      setImageSaving(false);
    }
  }

  async function handleLocaleChange(nextLocale: SupportedLocale) {
    if (nextLocale === locale || localeSaving) return;

    const previousLocale = locale;
    setLocale(nextLocale);
    setLocaleSaving(true);
    let saved = false;

    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });

      if (!res.ok) {
        setLocale(previousLocale);
      } else {
        saved = true;
      }
    } catch {
      setLocale(previousLocale);
    } finally {
      setLocaleSaving(false);
      if (saved) {
        router.refresh();
      }
    }
  }

  async function handleVerifyCurrentPin(pin: string) {
    setPinChanging(true);
    setPinChangeResult(null);
    try {
      const res = await fetch("/api/auth/pin/change", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verifyCurrentPin", currentPin: pin }),
      });
      if (res.ok) {
        setCurrentPin(pin);
        setPinStep("new");
      } else {
        const data = await res.json();
        setPinChangeResult({ ok: false, msg: data.error ?? t("settings.pinIncorrect") });
        setCurrentPin("");
      }
    } catch {
      setPinChangeResult({ ok: false, msg: t("settings.verifyFailed") });
      setCurrentPin("");
    } finally {
      setPinChanging(false);
    }
  }

  async function handlePinChange(completedPin: string) {
    if (completedPin !== newPin) {
      setPinChangeResult({ ok: false, msg: t("auth.pinReset.mismatch") });
      setConfirmPin("");
      setPinStep("confirm");
      return;
    }
    setPinChanging(true);
    setPinChangeResult(null);
    try {
      const res = await fetch("/api/auth/pin/change", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "changePin", currentPin, newPin: completedPin }),
      });
      const data = await res.json();
      if (res.ok) {
        setPinChangeResult({ ok: true, msg: t("settings.pinChanged") });
        resetPinForm();
      } else {
        setPinChangeResult({ ok: false, msg: data.error ?? t("settings.changeFailed") });
        // If current PIN was wrong, go back to step 1
        if (res.status === 401) {
          setCurrentPin("");
          setNewPin("");
          setConfirmPin("");
          setPinStep("current");
        }
      }
    } catch {
      setPinChangeResult({ ok: false, msg: t("settings.changeFailed") });
    } finally {
      setPinChanging(false);
    }
  }

  function resetPinForm() {
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setPinStep("current");
  }

  async function handleSetupPinComplete(completedPin: string) {
    if (setupPinStep === "new") {
      setSetupPin(completedPin);
      setSetupPinStep("confirm");
      return;
    }
    // confirm step
    if (completedPin !== setupPin) {
      setSetupPinResult({ ok: false, msg: t("auth.pinSetup.mismatch") });
      setSetupConfirmPin("");
      return;
    }
    setSetupPinSaving(true);
    setSetupPinResult(null);
    try {
      const res = await fetch("/api/auth/pin/change", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setupPin", newPin: completedPin }),
      });
      const data = await res.json();
      if (res.ok) {
        setSetupPinResult({ ok: true, msg: t("settings.pinSet") });
        setPinConfigured(true);
        setSetupPin("");
        setSetupConfirmPin("");
        setSetupPinStep("new");
      } else {
        setSetupPinResult({ ok: false, msg: data.error ?? t("settings.setupFailed") });
      }
    } catch {
      setSetupPinResult({ ok: false, msg: t("settings.setupFailed") });
    } finally {
      setSetupPinSaving(false);
    }
  }

  function resetSetupPinForm() {
    setSetupPin("");
    setSetupConfirmPin("");
    setSetupPinStep("new");
    setSetupPinResult(null);
  }

  async function handleEmailChange() {
    setEmailSaving(true);
    setEmailSaved(null);
    try {
      const res = await fetch("/api/auth/pin/change", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "changeEmail", newEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setStoredEmail(newEmail);
        setNewEmail("");
        setEmailSaved({ ok: true, msg: t("settings.emailChanged") });
      } else {
        setEmailSaved({ ok: false, msg: data.error ?? t("settings.changeFailed") });
      }
    } catch {
      setEmailSaved({ ok: false, msg: t("settings.changeFailed") });
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/pin/logout", { method: "POST" });
    window.location.href = "/pin";
  }

  async function handleOrganizationNameSave() {
    setOrganizationSaving(true);
    setOrganizationResult(null);
    const normalizedOrganizationName = organizationNameDraft.trim();
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationName: normalizedOrganizationName || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStoredOrganizationName(normalizedOrganizationName);
        setOrganizationNameDraft(normalizedOrganizationName);
        setOrganizationResult({ ok: true, msg: t("settings.organizationNameSaved") });
        router.refresh();
      } else {
        setOrganizationResult({ ok: false, msg: data.error ?? t("settings.changeFailed") });
      }
    } catch {
      setOrganizationResult({ ok: false, msg: t("error.network") });
    } finally {
      setOrganizationSaving(false);
    }
  }

  async function handlePasswordChange() {
    if (newPassword !== confirmNewPassword) {
      setPasswordChangeResult({ ok: false, msg: t("settings.passwordMismatch") });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordChangeResult({ ok: false, msg: t("auth.signupPassword.tooShort") });
      return;
    }
    setPasswordChanging(true);
    setPasswordChangeResult(null);
    try {
      const res = await fetch("/api/auth/password/change", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordChangeResult({ ok: true, msg: t("settings.passwordChanged") });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
      } else {
        setPasswordChangeResult({ ok: false, msg: data.error ?? t("settings.changeFailed") });
      }
    } catch {
      setPasswordChangeResult({ ok: false, msg: t("error.network") });
    } finally {
      setPasswordChanging(false);
    }
  }

  async function handleAuthExpirySave(days: number) {
    if (!isOwner) return;

    setAuthExpirySaving(true);
    setAuthExpirySaved(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authExpireDays: String(days) }),
      });
      if (res.ok) {
        setAuthExpireDays(days);
        setAuthExpirySaved({ ok: true, msg: t("common.saved") });
      } else {
        setAuthExpirySaved({ ok: false, msg: t("settings.saveFailed") });
      }
    } catch {
      setAuthExpirySaved({ ok: false, msg: t("error.network") });
    } finally {
      setAuthExpirySaving(false);
    }
  }

  async function handleAddPasskey() {
    setPasskeyWorking(true);
    setPasskeyResult(null);
    try {
      const optionsResponse = await fetch("/api/auth/webauthn/register/start", {
        method: "POST",
      });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) {
        setPasskeyResult({ ok: false, msg: options.error ?? t("settings.passkeyAddFailed") });
        return;
      }

      const credential = await startRegistration({ optionsJSON: options });
      const finishResponse = await fetch("/api/auth/webauthn/register/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credential),
      });
      const finish = await finishResponse.json().catch(() => ({}));
      if (!finishResponse.ok) {
        setPasskeyResult({ ok: false, msg: finish.error ?? t("settings.passkeyAddFailed") });
        return;
      }

      setPasskeyResult({ ok: true, msg: t("settings.passkeyAdded") });
      await fetchPasskeys();
    } catch {
      setPasskeyResult({ ok: false, msg: t("settings.passkeyAddFailed") });
    } finally {
      setPasskeyWorking(false);
    }
  }

  async function handleDeletePasskey(id: string) {
    setPasskeyWorking(true);
    setPasskeyResult(null);
    try {
      const res = await fetch("/api/account/webauthn/credentials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasskeyResult({ ok: false, msg: data.error ?? t("settings.passkeyDeleteFailed") });
        return;
      }

      setPasskeyResult({ ok: true, msg: t("settings.passkeyDeleted") });
      await fetchPasskeys();
    } catch {
      setPasskeyResult({ ok: false, msg: t("settings.passkeyDeleteFailed") });
    } finally {
      setPasskeyWorking(false);
    }
  }

  async function handleUserIdChange() {
    if (!newUserId.trim()) return;
    setUserIdChanging(true);
    setUserIdChangeResult(null);
    try {
      const res = await fetch("/api/auth/pin/change", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "changeUserId", newUserId: newUserId.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setUserIdChangeResult({ ok: true, msg: t("settings.userIdChanged") });
        setNewUserId("");
      } else {
        setUserIdChangeResult({ ok: false, msg: data.error ?? t("settings.changeFailed") });
      }
    } catch {
      setUserIdChangeResult({ ok: false, msg: t("error.network") });
    } finally {
      setUserIdChanging(false);
    }
  }

  async function handleDeleteAllMedia() {
    if (!confirm(t("settings.deleteAllMediaConfirm"))) {
      return;
    }
    setDeleting(true);
    setDeleteResult(null);
    try {
      const res = await fetch("/api/media", { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        setDeleteResult(t("settings.deleteAllMediaSuccess", { count: data.deleted }));
        await fetchMedia();
      } else {
        setDeleteResult(t("settings.deleteAllMediaFailed"));
      }
    } catch {
      setDeleteResult(t("settings.deleteAllMediaFailed"));
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteFile(file: UploadedFile) {
    const boardNames = file.boards
      .map((b) => b.boardName ?? b.boardId)
      .join(", ");
    const msg =
      file.boards.length > 0
        ? t("settings.fileDeleteInUseConfirm", { names: boardNames })
        : t("settings.fileDeleteUnusedConfirm");
    if (!confirm(msg)) return;

    setDeletingFile(file.filename);
    try {
      const res = await fetch("/api/media/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.filename }),
      });
      if (res.ok) {
        setMediaList((prev) =>
          prev.filter((m) => m.filename !== file.filename),
        );
      }
    } finally {
      setDeletingFile(null);
    }
  }

  const currentCity = WEATHER_AREAS.flatMap((p) => p.cities).find(
    (c) => c.id === cityId,
  );

  if (loading) {
    return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Dashboard QR Code */}
      {dashboardUrl && (
        <div className="rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-semibold">{t("settings.dashboardQrTitle")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("settings.dashboardQrDescription")}
          </p>
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg bg-white p-3">
              <QRCodeSVG value={dashboardUrl} size={180} />
            </div>
            <p className="max-w-xs break-all text-center text-xs text-muted-foreground">
              {dashboardUrl}
            </p>
          </div>
        </div>
      )}

      {/* Theme Selection */}
      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">{t("settings.languageTitle")}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("settings.languageDescription")}
        </p>
        <Select value={locale} onValueChange={(value) => handleLocaleChange(value as SupportedLocale)}>
          <SelectTrigger className="w-full max-w-sm">
            <SelectValue>
              {currentLocaleDefinition.flag} {currentLocaleDefinition.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_LOCALES.map((item) => (
              <SelectItem key={item.code} value={item.code}>
                {item.flag} {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {localeSaving && (
          <p className="mt-3 text-sm text-muted-foreground">{t("common.loading")}</p>
        )}
      </div>

      {/* Theme Selection */}
      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">{t("settings.themeTitle")}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("settings.themeDescription")}
        </p>
        <div className="flex gap-3">
          {([
            { value: "system" as Theme, label: t("settings.themeSystem") },
            { value: "light" as Theme, label: t("settings.themeLight") },
            { value: "dark" as Theme, label: t("settings.themeDark") },
          ]).map((opt) => (
            <button
              key={opt.value}
              onClick={async () => {
                setTheme(opt.value);
                await fetch("/api/users/me", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ colorTheme: opt.value }),
                });
              }}
              className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                theme === opt.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Account Settings */}
      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">{t("settings.accountTitle")}</h2>
        <div>
          <h3 className="mb-2 text-sm font-medium">{t("settings.userIdTitle")}</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("settings.currentUserId")} <span className="font-mono">{currentUserId}</span>
          </p>
          <div className="flex items-center gap-3">
            <Input
              type="text"
              placeholder={t("settings.newUserIdPlaceholder")}
              value={newUserId}
              onChange={(e) => { setNewUserId(e.target.value); setUserIdChangeResult(null); }}
              className="max-w-sm"
            />
            <Button
              onClick={handleUserIdChange}
              disabled={userIdChanging || !newUserId.trim() || newUserId.trim() === currentUserId}
            >
              {userIdChanging ? t("common.loading") : t("common.change")}
            </Button>
          </div>
          {userIdChangeResult && (
            <span className={`mt-2 block text-sm ${userIdChangeResult.ok ? "text-green-600" : "text-red-600"}`}>
              {userIdChangeResult.msg}
            </span>
          )}
        </div>

        {isOwner && (
          <div className="mt-6 border-t pt-6">
            <h3 className="mb-2 text-sm font-medium">{t("settings.organizationNameTitle")}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {t("settings.organizationNameDescription")}
            </p>
            {storedOrganizationName && (
              <p className="mb-3 text-sm text-muted-foreground">
                {t("common.currentSetting")}: <span className="font-medium">{storedOrganizationName}</span>
              </p>
            )}
            <div className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                type="text"
                placeholder={t("settings.organizationNamePlaceholder")}
                value={organizationNameDraft}
                onChange={(e) => {
                  setOrganizationNameDraft(e.target.value);
                  setOrganizationResult(null);
                }}
                maxLength={120}
              />
              <Button
                onClick={handleOrganizationNameSave}
                disabled={organizationSaving || organizationNameDraft.trim() === storedOrganizationName}
              >
                {organizationSaving ? t("common.loading") : t("common.change")}
              </Button>
            </div>
            {organizationResult && (
              <span className={`mt-2 block text-sm ${organizationResult.ok ? "text-green-600" : "text-red-600"}`}>
                {organizationResult.msg}
              </span>
            )}
          </div>
        )}
      </div>

      {/* OpenWeather API key */}
      {isSuperOwner && weatherProvider === "openweatherapi" && (
        <div className="rounded-lg border p-6">
          <h2 className="mb-2 text-lg font-semibold">
            {t("settings.openWeatherApiTitle")}
          </h2>
          <p className="mb-2 text-sm text-muted-foreground">
            {t("settings.openWeatherApiDescription")}
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            {openWeatherApiKeyConfigured
              ? t("settings.openWeatherApiConfigured")
              : t("settings.openWeatherApiNotConfigured")}
          </p>
          <div className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="openweather-api-key">
                {t("settings.openWeatherApiKeyLabel")}
              </Label>
              <Input
                id="openweather-api-key"
                type="password"
                autoComplete="off"
                value={openWeatherApiKey}
                placeholder={t("settings.openWeatherApiKeyPlaceholder")}
                onChange={(event) => {
                  setOpenWeatherApiKey(event.target.value);
                  setOpenWeatherApiKeyResult(null);
                }}
              />
            </div>
            <Button
              onClick={handleOpenWeatherApiKeySave}
              disabled={openWeatherApiKeySaving || !openWeatherApiKey.trim()}
            >
              {openWeatherApiKeySaving
                ? t("common.loading")
                : t("settings.saveButton")}
            </Button>
          </div>
          {openWeatherApiKeyResult && (
            <span
              className={`mt-2 block text-sm ${
                openWeatherApiKeyResult.ok ? "text-green-600" : "text-red-600"
              }`}
            >
              {openWeatherApiKeyResult.msg}
            </span>
          )}
        </div>
      )}

      {/* Weather Area Selection */}
      {role === "admin" && <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">{t("settings.weatherAreaTitle")}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {weatherProvider === "openweatherapi"
            ? t("settings.weatherAreaDescriptionGlobal")
            : t("settings.weatherAreaDescription")}
        </p>

        {weatherProvider === "openweatherapi" ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="setting-country">
                  {t("settings.countryLabel")}
                </Label>
                <Select
                  value={weatherCountry}
                  onValueChange={handleWeatherCountryChange}
                >
                  <SelectTrigger id="setting-country" className="w-full">
                    <SelectValue placeholder={t("settings.countryPlaceholder")}>
                      {weatherCountry
                        ? regionNames.of(weatherCountry) ?? weatherCountry
                        : t("settings.countryPlaceholder")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>
                        {t("settings.featuredCountries")}
                      </SelectLabel>
                      {weatherCountries
                        .filter((country) =>
                          FEATURED_WEATHER_COUNTRIES.has(country.code),
                        )
                        .map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {regionNames.of(country.code) ?? country.code}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>{t("settings.allCountries")}</SelectLabel>
                      {weatherCountries
                        .filter((country) =>
                          !FEATURED_WEATHER_COUNTRIES.has(country.code),
                        )
                        .map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {regionNames.of(country.code) ?? country.code}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="setting-city-search">
                  {t("settings.citySearchLabel")}
                </Label>
                <div className="relative">
                  <Input
                    id="setting-city-search"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={
                      citySearchOpen && citySearch.trim().length >= 2
                    }
                    value={citySearch}
                    placeholder={t("settings.citySearchPlaceholder")}
                    disabled={!weatherCountry}
                    onChange={(event) => {
                      setCitySearch(event.target.value);
                      setCitySearchOpen(event.target.value.trim().length >= 2);
                    }}
                    onFocus={() => {
                      if (citySearch.trim().length >= 2) {
                        setCitySearchOpen(true);
                      }
                    }}
                    onBlur={() => setCitySearchOpen(false)}
                  />
                  {citySearchOpen && citySearch.trim().length >= 2 && (
                    <div
                      role="listbox"
                      className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
                    >
                      {citySearchLoading ? (
                        <div className="px-2.5 py-2 text-sm text-muted-foreground">
                          {t("common.loading")}
                        </div>
                      ) : openWeatherCities.length === 0 ? (
                        <div className="px-2.5 py-2 text-sm text-muted-foreground">
                          {t("settings.citySearchEmpty")}
                        </div>
                      ) : (
                        openWeatherCities.map((city) => (
                          <button
                            key={city.id}
                            type="button"
                            role="option"
                            aria-selected={
                              selectedOpenWeatherCity?.id === city.id
                            }
                            className="flex w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() =>
                              handleOpenWeatherCityChange(city.id)
                            }
                          >
                            <OpenWeatherCityName city={city} />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("settings.citySearchHint")}
                </p>
              </div>
            </div>

            {selectedOpenWeatherCity && (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  {t("common.currentSetting")}:
                </span>{" "}
                <span className="font-medium">
                  <OpenWeatherCityName city={selectedOpenWeatherCity} />
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="setting-pref">{t("settings.prefectureLabel")}</Label>
              <Select
                value={selectedPref?.name ?? ""}
                onValueChange={handlePrefChange}
              >
                <SelectTrigger id="setting-pref" className="w-full">
                  <SelectValue placeholder={t("settings.prefecturePlaceholder")}>
                    {selectedPref?.name ?? t("settings.prefecturePlaceholder")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {WEATHER_AREAS.map((pref) => (
                    <SelectItem key={pref.name} value={pref.name}>
                      {pref.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="setting-city">{t("settings.cityLabel")}</Label>
              <Select
                value={cityId}
                onValueChange={handleCityChange}
                disabled={!selectedPref}
              >
                <SelectTrigger id="setting-city" className="w-full">
                  <SelectValue placeholder={t("settings.cityPlaceholder")}>
                    {currentCity?.name ?? t("settings.cityPlaceholder")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {selectedPref?.cities.map((city) => (
                    <SelectItem key={city.id} value={city.id}>
                      {city.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={
              saving ||
              (weatherProvider === "openweatherapi" &&
                !selectedOpenWeatherCity)
            }
          >
            {saving ? t("boardEdit.saving") : t("settings.saveButton")}
          </Button>
          {saved && (
            <span className="text-sm text-green-600">{t("common.saved")}</span>
          )}
        </div>

        {weatherProvider === "openweatherapi" && selectedOpenWeatherCity ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("settings.weatherCurrent", {
              pref:
                selectedOpenWeatherCity.prefectureName ??
                selectedOpenWeatherCity.country,
              city: openWeatherCityLabel(selectedOpenWeatherCity),
              code: cityId,
            })}
          </p>
        ) : currentCity && (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("settings.weatherCurrent", { pref: selectedPref?.name ?? "", city: currentCity.name, code: cityId })}
          </p>
        )}
      </div>}

      {/* Image Resize Settings */}
      {role === "admin" && <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">{t("settings.imageResizeTitle")}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("settings.imageResizeDescription")}
        </p>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="resize-enabled"
              checked={resizeEnabled || planMaxResolution !== null}
              disabled={planMaxResolution !== null}
              onCheckedChange={setResizeEnabled}
            />
            <Label htmlFor="resize-enabled">{t("settings.resizeEnabled")}</Label>
          </div>

          {(resizeEnabled || planMaxResolution !== null) && (
            <div className="space-y-1.5">
              <Label htmlFor="max-long-edge">{t("settings.maxLongEdge")}</Label>
              <div className="flex items-center gap-2">
                <NumberInput
                  id="max-long-edge"
                  min={100}
                  max={planMaxResolution ?? undefined}
                  step={100}
                  value={maxLongEdge}
                  onValueChange={setMaxLongEdge}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">px</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {planMaxResolution
                  ? t("settings.planMaxLongEdge", { value: planMaxResolution })
                  : t("settings.defaultLongEdge")}
              </p>
            </div>
          )}

          {imageError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {imageError}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={handleImageSettingSave}
              disabled={imageSaving}
            >
              {imageSaving ? t("boardEdit.saving") : t("settings.saveButton")}
            </Button>
            {imageSaved && (
              <span className="text-sm text-green-600">{t("common.saved")}</span>
            )}
          </div>
        </div>
      </div>}

      {/* Security / PIN Settings */}
      {pinConfigured ? (
        <div className="rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-semibold">{t("settings.securityTitle")}</h2>

          {/* PIN Change */}
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-medium">{t("settings.pinChangeTitle")}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {t("settings.pinChangeDescription")}
            </p>

            {pinStep === "current" && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">{t("settings.currentPinLabel")}</Label>
                <PinInput
                  value={currentPin}
                  onChange={(v) => { setCurrentPin(v); setPinChangeResult(null); }}
                  onComplete={handleVerifyCurrentPin}
                  disabled={pinChanging}
                  error={pinChangeResult?.ok === false && pinStep === "current"}
                />
              </div>
            )}

            {pinStep === "new" && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">{t("settings.newPinLabel")}</Label>
                <PinInput
                  value={newPin}
                  onChange={setNewPin}
                  onComplete={() => setPinStep("confirm")}
                />
              </div>
            )}

            {pinStep === "confirm" && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">{t("settings.confirmPinLabel")}</Label>
                <PinInput
                  value={confirmPin}
                  onChange={setConfirmPin}
                  onComplete={handlePinChange}
                  disabled={pinChanging}
                  error={pinChangeResult?.ok === false && confirmPin.length < 6}
                />
              </div>
            )}

            <div className="mt-3 flex items-center gap-3">
              {pinStep !== "current" && (
                <Button variant="outline" size="sm" onClick={resetPinForm} disabled={pinChanging}>
                  {t("common.reset")}
                </Button>
              )}
              {pinChangeResult && (
                <span className={`text-sm ${pinChangeResult.ok ? "text-green-600" : "text-red-600"}`}>
                  {pinChangeResult.msg}
                </span>
              )}
            </div>
          </div>

          {/* Email Change */}
          <div className="border-t pt-4">
            <h3 className="mb-2 text-sm font-medium">{t("settings.recoveryEmailTitle")}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {t("settings.recoveryEmailDescription")}
            </p>
            {storedEmail && (
              <p className="mb-3 text-sm">
                {t("common.currentSetting")}: <span className="font-mono">{storedEmail}</span>
              </p>
            )}
            <div className="flex items-center gap-3">
              <Input
                type="email"
                placeholder={t("settings.newEmailPlaceholder")}
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setEmailSaved(null);
                }}
                className="max-w-sm"
              />
              <Button
                onClick={handleEmailChange}
                disabled={emailSaving || !newEmail || !newEmail.includes("@")}
              >
                {emailSaving ? t("boardEdit.saving") : t("common.change")}
              </Button>
            </div>
            {emailSaved && (
              <span className={`mt-2 block text-sm ${emailSaved.ok ? "text-green-600" : "text-red-600"}`}>
                {emailSaved.msg}
              </span>
            )}
          </div>

          {hasPasswordAuth && (
            <div className="border-t pt-4">
              <h3 className="mb-2 text-sm font-medium">{t("settings.passwordTitle")}</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                {t("settings.passwordDescription")}
              </p>
              <div className="space-y-3 max-w-sm">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("settings.currentPasswordLabel")}</label>
                  <Input
                    type="password"
                    placeholder={t("settings.currentPasswordPlaceholder")}
                    value={currentPassword}
                    onChange={(e) => { setCurrentPassword(e.target.value); setPasswordChangeResult(null); }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("settings.newPasswordLabel")}</label>
                  <Input
                    type="password"
                    placeholder={t("settings.newPasswordPlaceholder")}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPasswordChangeResult(null); }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("settings.confirmPasswordLabel")}</label>
                  <Input
                    type="password"
                    placeholder={t("settings.confirmPasswordPlaceholder")}
                    value={confirmNewPassword}
                    onChange={(e) => { setConfirmNewPassword(e.target.value); setPasswordChangeResult(null); }}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handlePasswordChange}
                    disabled={passwordChanging || !currentPassword || !newPassword || !confirmNewPassword}
                  >
                    {passwordChanging ? t("common.loading") : t("settings.passwordChangeButton")}
                  </Button>
                </div>
                {passwordChangeResult && (
                  <span className={`text-sm ${passwordChangeResult.ok ? "text-green-600" : "text-red-600"}`}>
                    {passwordChangeResult.msg}
                  </span>
                )}
              </div>
            </div>
          )}

          {isOwner && passkeyEnabled && (
            <div className="border-t pt-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Fingerprint className="size-4 text-primary" />
                    {t("settings.passkeyTitle")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {passkeyOwnerRequired
                      ? t("settings.passkeyRequiredDescription")
                      : t("settings.passkeyOptionalDescription")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddPasskey}
                  disabled={passkeyWorking}
                >
                  {passkeyWorking ? t("common.loading") : t("settings.passkeyAdd")}
                </Button>
              </div>

              {passkeyLoading ? (
                <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
              ) : passkeys.length === 0 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {t("settings.passkeyEmpty")}
                </p>
              ) : (
                <div className="space-y-2">
                  {passkeys.map((credential) => (
                    <div
                      key={credential.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{credential.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("settings.passkeyCreatedAt")}:{" "}
                          {new Date(credential.createdAt).toLocaleString(locale)}
                          {credential.lastUsedAt
                            ? ` / ${t("settings.passkeyLastUsedAt")}: ${new Date(credential.lastUsedAt).toLocaleString(locale)}`
                            : ""}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDeletePasskey(credential.id)}
                        disabled={passkeyWorking || (passkeyOwnerRequired && passkeys.length <= 1)}
                        title={t("common.delete")}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {passkeyResult && (
                <span className={`mt-2 block text-sm ${passkeyResult.ok ? "text-green-600" : "text-red-600"}`}>
                  {passkeyResult.msg}
                </span>
              )}
            </div>
          )}

          {/* Auth Expiry / Login Cache Period - Owner only */}
          {isOwner && <div className="border-t pt-4">
            <h3 className="mb-2 text-sm font-medium">{t("settings.authCacheTitle")}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {t("settings.authCacheDescription")}
            </p>
            {fullAuthExpiry && (
              <p className="mb-3 text-sm text-muted-foreground">
                {t("settings.currentExpiry")}:{" "}
                <span className="font-medium">
                    {formatDate(fullAuthExpiry, {
                    year: "numeric", month: "long", day: "numeric",
                  })}
                </span>
              </p>
            )}
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { label: t("settings.authExpiryDays", { days: 30 }), days: 30 },
                { label: t("settings.authExpiryDays", { days: 60 }), days: 60 },
                { label: t("settings.authExpiryDays", { days: 90 }), days: 90 },
                { label: t("settings.authExpiryDays", { days: 180 }), days: 180 },
                { label: t("settings.authExpiryYear"), days: 365 },
              ].map((opt) => {
                const expiry = new Date(Date.now() + opt.days * 86_400_000);
                return (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => handleAuthExpirySave(opt.days)}
                    disabled={authExpirySaving}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      authExpireDays === opt.days
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-accent hover:text-accent-foreground"
                    }`}
                      title={formatDate(expiry, { year: "numeric", month: "long", day: "numeric" })}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("common.currentSetting")}: {t("settings.authExpiryCurrent", {
                days: authExpireDays,
                defaultSuffix: authExpireDays === 30 ? t("settings.defaultSuffix") : "",
              })}
            </p>
            {authExpirySaved && (
              <span className={`mt-2 block text-sm ${authExpirySaved.ok ? "text-green-600" : "text-red-600"}`}>
                {authExpirySaved.msg}
              </span>
            )}
          </div>}

          {/* Logout */}
          <div className="mt-6 border-t pt-4">
            <Button variant="outline" onClick={handleLogout}>
              {t("dashboard.logout")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-semibold">{t("settings.securityTitle")}</h2>

          {/* PIN Setup (for users without a PIN) */}
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-medium">{t("settings.pinConfigTitle")}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {t("settings.pinConfigDescription")}
            </p>

            {setupPinStep === "new" && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">{t("settings.pinEnterLabel")}</Label>
                <PinInput
                  value={setupPin}
                  onChange={(v) => { setSetupPin(v); setSetupPinResult(null); }}
                  onComplete={handleSetupPinComplete}
                  disabled={setupPinSaving}
                />
              </div>
            )}

            {setupPinStep === "confirm" && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">{t("settings.pinConfirmLabel")}</Label>
                <PinInput
                  value={setupConfirmPin}
                  onChange={setSetupConfirmPin}
                  onComplete={handleSetupPinComplete}
                  disabled={setupPinSaving}
                  error={setupPinResult?.ok === false}
                />
              </div>
            )}

            <div className="mt-3 flex items-center gap-3">
              {setupPinStep === "confirm" && (
                <Button variant="outline" size="sm" onClick={resetSetupPinForm} disabled={setupPinSaving}>
                  {t("common.reset")}
                </Button>
              )}
              {setupPinResult && (
                <span className={`text-sm ${setupPinResult.ok ? "text-green-600" : "text-red-600"}`}>
                  {setupPinResult.msg}
                </span>
              )}
            </div>
          </div>

          {/* Email Change */}
          <div className="border-t pt-4">
            <h3 className="mb-2 text-sm font-medium">{t("settings.recoveryEmailTitle")}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {t("settings.recoveryEmailDescription")}
            </p>
            {storedEmail && (
              <p className="mb-3 text-sm">
                {t("common.currentSetting")}: <span className="font-mono">{storedEmail}</span>
              </p>
            )}
            <div className="flex items-center gap-3">
              <Input
                type="email"
                placeholder={t("settings.newEmailPlaceholder")}
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setEmailSaved(null);
                }}
                className="max-w-sm"
              />
              <Button
                onClick={handleEmailChange}
                disabled={emailSaving || !newEmail || !newEmail.includes("@")}
              >
                {emailSaving ? t("boardEdit.saving") : t("common.change")}
              </Button>
            </div>
            {emailSaved && (
              <span className={`mt-2 block text-sm ${emailSaved.ok ? "text-green-600" : "text-red-600"}`}>
                {emailSaved.msg}
              </span>
            )}
          </div>

          {hasPasswordAuth && (
            <div className="border-t pt-4">
              <h3 className="mb-2 text-sm font-medium">{t("settings.passwordTitle")}</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                {t("settings.passwordDescription")}
              </p>
              <div className="space-y-3 max-w-sm">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("settings.currentPasswordLabel")}</label>
                  <Input
                    type="password"
                    placeholder={t("settings.currentPasswordPlaceholder")}
                    value={currentPassword}
                    onChange={(e) => { setCurrentPassword(e.target.value); setPasswordChangeResult(null); }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("settings.newPasswordLabel")}</label>
                  <Input
                    type="password"
                    placeholder={t("settings.newPasswordPlaceholder")}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPasswordChangeResult(null); }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("settings.confirmPasswordLabel")}</label>
                  <Input
                    type="password"
                    placeholder={t("settings.confirmPasswordPlaceholder")}
                    value={confirmNewPassword}
                    onChange={(e) => { setConfirmNewPassword(e.target.value); setPasswordChangeResult(null); }}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handlePasswordChange}
                    disabled={passwordChanging || !currentPassword || !newPassword || !confirmNewPassword}
                  >
                    {passwordChanging ? t("common.loading") : t("settings.passwordChangeButton")}
                  </Button>
                </div>
                {passwordChangeResult && (
                  <span className={`text-sm ${passwordChangeResult.ok ? "text-green-600" : "text-red-600"}`}>
                    {passwordChangeResult.msg}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Logout */}
          <div className="mt-6 border-t pt-4">
            <Button variant="outline" onClick={handleLogout}>
              {t("dashboard.logout")}
            </Button>
          </div>
        </div>
      )}

      {/* Media Management - admin only */}
      {role === "admin" && <div id="media-management" className="rounded-lg border border-red-200 p-6">
        <h2 className="mb-4 text-lg font-semibold">{t("settings.mediaManagementTitle")}</h2>

        {/* Individual media list */}
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium">{t("settings.uploadedMediaTitle")}</h3>
          {mediaLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : mediaList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("settings.mediaEmpty")}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mediaList.map((file) => (
                <div
                  key={file.filename}
                  className="flex items-start gap-3 rounded-md border p-3"
                >
                  {/* Thumbnail */}
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded bg-muted">
                    {file.type === "image" ? (
                      <img
                        src={file.thumbPath ?? file.filePath}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : file.thumbPath ? (
                      <img
                        src={file.thumbPath}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <video
                        src={file.filePath}
                        preload="metadata"
                        muted
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  {/* Info + delete button */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-xs text-muted-foreground">
                      {file.type === "image" ? t("common.image") : t("common.video")} ・{" "}
                      {file.size < 1024 * 1024
                        ? `${Math.round(file.size / 1024)} KB`
                        : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
                    </span>
                    {file.boards.length > 0 ? (
                      <span className="truncate text-xs">
                        {t("settings.mediaBoardsLabel")}:{" "}
                        {file.boards
                          .map((b) => b.boardName ?? b.boardId)
                          .join(", ")}
                      </span>
                    ) : (
                      <span className="truncate text-xs text-amber-600">
                        {t("settings.mediaUnused")}
                      </span>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      className="mt-1 w-fit text-xs"
                      disabled={deletingFile === file.filename}
                      onClick={() => handleDeleteFile(file)}
                    >
                      {deletingFile === file.filename ? t("settings.deleting") : t("common.delete")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bulk delete */}
        <div className="border-t pt-4">
          <p className="mb-4 text-sm text-muted-foreground">
            {t("settings.deleteAllMediaDescription")}
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="destructive"
              onClick={handleDeleteAllMedia}
              disabled={deleting}
            >
              {deleting ? t("settings.deleting") : t("settings.deleteAllMediaButton")}
            </Button>
            {deleteResult && (
              <span className="text-sm text-muted-foreground">
                {deleteResult}
              </span>
            )}
          </div>
        </div>
      </div>}

      {isOwner && (
        <div className="rounded-lg border border-red-300 bg-red-50/60 p-6">
          <p className="text-sm font-medium text-red-700">{t("settings.dangerZoneLabel")}</p>
          <h2 className="mt-2 text-lg font-semibold text-red-950">{t("settings.ownerDeletionTitle")}</h2>
          <p className="mt-3 text-sm leading-6 text-red-900/80">
            {t("settings.ownerDeletionDescription")}
          </p>
          <div className="mt-4">
            <Link
              href="/delete-account"
              className="inline-flex rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              {t("settings.ownerDeletionButton")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
