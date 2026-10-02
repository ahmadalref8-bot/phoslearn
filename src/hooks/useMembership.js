import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase.js";

const FREE_MEMBERSHIP = Object.freeze({
  isPaid: false,
  plan: "free",
  planCode: null,
  activeUntil: null,
  currentPeriodEnd: null,
  autoRenew: false,
  cancelAtPeriodEnd: false,
  subscriptionStatus: "inactive",
  inRenewalGrace: false,
});

async function fetchMembership(session) {
  if (!session?.access_token) return FREE_MEMBERSHIP;
  const response = await fetch("/api/membership", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "تعذر التحقق من الاشتراك.");
  return data;
}

export default function useMembership() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [membership, setMembership] = useState(FREE_MEMBERSHIP);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [error, setError] = useState("");
  const requestGeneration = useRef(0);
  const sessionUserId = useRef(null);

  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!alive) return;
      if (sessionError) setError("تعذر قراءة جلسة الدخول.");
      sessionUserId.current = data?.session?.user?.id || null;
      setSession(data?.session || null);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!alive) return;
      requestGeneration.current += 1;
      const nextUserId = nextSession?.user?.id || null;
      if (sessionUserId.current !== nextUserId) setMembership(FREE_MEMBERSHIP);
      sessionUserId.current = nextUserId;
      setSession(nextSession || null);
      setAuthReady(true);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const refresh = useCallback(async (sessionOverride, trustedFallback) => {
    const current = sessionOverride === undefined ? session : sessionOverride;
    const currentUserId = current?.user?.id || null;
    // Old callbacks can outlive an account switch. Never let a request for the
    // previous account become the newest generation for the current account.
    if (currentUserId !== sessionUserId.current) return FREE_MEMBERSHIP;
    const generation = ++requestGeneration.current;
    if (!current) {
      if (generation === requestGeneration.current) {
        setMembership(FREE_MEMBERSHIP);
        setMembershipLoading(false);
      }
      return FREE_MEMBERSHIP;
    }
    setMembershipLoading(true);
    try {
      const next = await fetchMembership(current);
      if (generation === requestGeneration.current && currentUserId === sessionUserId.current) {
        setMembership(next);
        setError("");
      }
      return next;
    } catch (refreshError) {
      if (generation !== requestGeneration.current || currentUserId !== sessionUserId.current) return FREE_MEMBERSHIP;
      // A mutating API (such as cancellation) can return the authoritative
      // membership in its own authenticated response. Preserve that result if
      // the immediate follow-up GET happens to fail, instead of flashing the
      // account back to the free plan.
      if (trustedFallback && typeof trustedFallback === "object" && typeof trustedFallback.isPaid === "boolean") {
        const fallback = { ...FREE_MEMBERSHIP, ...trustedFallback };
        setMembership(fallback);
        setError("");
        return fallback;
      }
      setMembership(FREE_MEMBERSHIP);
      setError(refreshError.message || "تعذر التحقق من الاشتراك.");
      throw refreshError;
    } finally {
      if (generation === requestGeneration.current && currentUserId === sessionUserId.current) setMembershipLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!authReady) return;
    refresh(session).catch(() => {});
  }, [authReady, session, refresh]);

  useEffect(() => {
    if (!authReady || !session?.access_token) return undefined;
    const onFocus = () => refresh(session).catch(() => {});
    window.addEventListener("focus", onFocus);
    const onVisibility = () => { if (document.visibilityState === "visible") onFocus(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authReady, session, refresh]);

  useEffect(() => {
    if (!membership.isPaid || !membership.activeUntil || !session) return undefined;
    const expiresAt = new Date(membership.activeUntil).getTime();
    if (!Number.isFinite(expiresAt)) return undefined;
    let timer;
    let cancelled = false;
    const scheduleExpiryCheck = () => {
      if (cancelled) return;
      const remaining = expiresAt - Date.now() + 500;
      if (remaining <= 0) {
        refresh(session).catch(() => {});
        return;
      }
      // Browsers cap one timeout at about 24.85 days. Chain safe chunks so
      // 30/90-day plans still refresh at their real expiry in a long-lived tab.
      timer = setTimeout(scheduleExpiryCheck, Math.min(remaining, 2_147_000_000));
    };
    scheduleExpiryCheck();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [membership.isPaid, membership.activeUntil, session, refresh]);

  const sendMagicLink = useCallback(async (email) => {
    if (!supabase) throw new Error("لم تُضبط خدمة تسجيل الدخول بعد.");
    const redirect = new URL("/", window.location.origin);
    redirect.searchParams.set("auth", "confirmed");
    const current = new URL(window.location.href);
    const paymentState = current.searchParams.get("payment");
    const orderId = current.searchParams.get("order_id");
    if (paymentState === "success" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId || "")) {
      redirect.searchParams.set("payment", "success");
      redirect.searchParams.set("order_id", orderId);
    }
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirect.toString(),
        shouldCreateUser: true,
      },
    });
    if (signInError) throw signInError;
  }, []);

  const signOut = useCallback(async () => {
    requestGeneration.current += 1;
    try {
      if (supabase) await supabase.auth.signOut();
    } finally {
      sessionUserId.current = null;
      setSession(null);
      setMembership(FREE_MEMBERSHIP);
    }
  }, []);

  return useMemo(() => ({
    configured: supabaseConfigured,
    authReady,
    session,
    user: session?.user || null,
    membership,
    plan: membership.plan || "free",
    isPaid: Boolean(membership.isPaid),
    activeUntil: membership.activeUntil || null,
    currentPeriodEnd: membership.currentPeriodEnd || membership.activeUntil || null,
    autoRenew: Boolean(membership.autoRenew),
    cancelAtPeriodEnd: Boolean(membership.cancelAtPeriodEnd),
    subscriptionStatus: membership.subscriptionStatus || (membership.isPaid ? "active" : "inactive"),
    inRenewalGrace: Boolean(membership.inRenewalGrace),
    loading: !authReady || membershipLoading,
    error,
    refresh,
    sendMagicLink,
    signOut,
  }), [session, membership, authReady, membershipLoading, error, refresh, sendMagicLink, signOut]);
}
