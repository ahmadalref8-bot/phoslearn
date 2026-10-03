import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

const emptyProfile = { displayName: "", avatarUrl: "", updatedAt: "" };

function fallbackName(user) {
  return String(
    user?.user_metadata?.display_name ||
    user?.email?.split("@")[0] ||
    "مستخدم فوس"
  ).trim();
}

function avatarMessage(error) {
  const raw = String(error?.message || error || "").toLowerCase();
  if (raw.includes("bucket") || raw.includes("relation") || raw.includes("profiles")) {
    return "يلزم تشغيل إعداد الملف الشخصي في Supabase أولًا.";
  }
  if (raw.includes("row-level security") || raw.includes("policy")) {
    return "تعذر حفظ الملف الشخصي بسبب صلاحيات التخزين.";
  }
  return "تعذر حفظ الملف الشخصي الآن. حاول مرة أخرى.";
}

export default function useProfile(user) {
  const [profile, setProfile] = useState(emptyProfile);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    if (!user?.id || !supabase) {
      setProfile(emptyProfile);
      setLoading(false);
      setError("");
      return () => { alive = false; };
    }

    setLoading(true);
    setError("");
    supabase
      .from("profiles")
      .select("display_name, avatar_url, updated_at")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (!alive) return;
        if (loadError) {
          setProfile({
            displayName: fallbackName(user),
            avatarUrl: String(user?.user_metadata?.avatar_url || ""),
            updatedAt: "",
          });
          setError(avatarMessage(loadError));
          return;
        }
        setProfile({
          displayName: String(data?.display_name || fallbackName(user)),
          avatarUrl: String(data?.avatar_url || user?.user_metadata?.avatar_url || ""),
          updatedAt: String(data?.updated_at || ""),
        });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [user?.id, user?.email, user?.user_metadata?.display_name, user?.user_metadata?.avatar_url]);

  const saveProfile = useCallback(async ({ displayName, avatarFile, removeAvatar = false }) => {
    if (!user?.id || !supabase) throw new Error("سجّل الدخول أولًا.");

    const cleanName = String(displayName || "").trim().replace(/\s+/g, " ");
    if (cleanName.length < 2 || cleanName.length > 40) {
      throw new Error("اكتب اسمًا من حرفين إلى ٤٠ حرفًا.");
    }
    if (avatarFile) {
      if (!String(avatarFile.type || "").startsWith("image/")) {
        throw new Error("اختر صورة صحيحة.");
      }
      if (avatarFile.size > 5 * 1024 * 1024) {
        throw new Error("حجم الصورة يجب ألا يتجاوز ٥ ميجابايت.");
      }
    }

    setSaving(true);
    setError("");
    try {
      const avatarPath = `${user.id}/avatar`;
      let avatarUrl = removeAvatar ? "" : String(profile.avatarUrl || "");

      if (removeAvatar) {
        const { error: removeError } = await supabase.storage.from("avatars").remove([avatarPath]);
        if (removeError && !String(removeError.message || "").toLowerCase().includes("not found")) {
          throw removeError;
        }
      }

      if (avatarFile) {
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(avatarPath, avatarFile, {
            upsert: true,
            cacheControl: "3600",
            contentType: avatarFile.type,
          });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("avatars").getPublicUrl(avatarPath);
        avatarUrl = data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : "";
      }

      const next = {
        id: user.id,
        display_name: cleanName,
        avatar_url: avatarUrl || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error: saveError } = await supabase
        .from("profiles")
        .upsert(next, { onConflict: "id" })
        .select("display_name, avatar_url, updated_at")
        .single();
      if (saveError) throw saveError;

      await supabase.auth.updateUser({
        data: { display_name: cleanName, avatar_url: avatarUrl || null },
      }).catch(() => {});

      const saved = {
        displayName: String(data?.display_name || cleanName),
        avatarUrl: String(data?.avatar_url || ""),
        updatedAt: String(data?.updated_at || next.updated_at),
      };
      setProfile(saved);
      return saved;
    } catch (saveError) {
      const message = saveError?.message?.startsWith("اكتب") ||
        saveError?.message?.startsWith("اختر") ||
        saveError?.message?.startsWith("حجم")
        ? saveError.message
        : avatarMessage(saveError);
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }, [user?.id, profile.avatarUrl]);

  return { profile, loading, saving, error, saveProfile };
}
