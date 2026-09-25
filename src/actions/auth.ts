"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/env";
import { safeInternalPath } from "@/lib/auth/safe-redirect";
import {
  actionFail,
  actionOk,
  toUserErrorMessage,
  type ActionResult,
} from "@/lib/errors";
import { signInSchema, signUpSchema } from "@/lib/validations/auth";
import { clearActiveOrganizationCookie } from "@/lib/auth/session";

export async function signUpAction(
  _prev: ActionResult<{ message: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ message: string }>> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return actionFail(
      "validation_error",
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }

  try {
    const supabase = await createClient();
    const siteUrl = getSiteUrl();
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.fullName },
        emailRedirectTo: `${siteUrl}/auth/callback?next=/onboarding`,
      },
    });

    if (error) {
      return actionFail("signup_failed", "Unable to create account.");
    }

    return actionOk({
      message:
        "Check your email to confirm your account before signing in.",
    });
  } catch (error) {
    return actionFail("signup_failed", toUserErrorMessage(error));
  }
}

export async function signInAction(
  _prev: ActionResult<{ redirectTo: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const next = safeInternalPath(String(formData.get("next") ?? ""), "/dashboard");

  if (!parsed.success) {
    return actionFail(
      "validation_error",
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      return actionFail("invalid_credentials", "Invalid email or password.");
    }

    return actionOk({ redirectTo: next });
  } catch (error) {
    return actionFail("signin_failed", toUserErrorMessage(error));
  }
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearActiveOrganizationCookie();
  redirect("/login");
}
