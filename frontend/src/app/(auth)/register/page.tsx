"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PasswordStrengthIndicator } from "@/components/shared";
import { Button, Input } from "@/components/ui";
import { useRedirectIfAuthed } from "@/lib/hooks/useAuth";

const schema = z
  .object({
    name: z.string().min(2, "Vui lòng nhập họ tên"),
    email: z.string().email("Email không hợp lệ"),
    password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự"),
    confirmPassword: z.string(),
    acceptedTerms: z.boolean()
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Mật khẩu xác nhận không khớp"
  })
  .refine((data) => data.acceptedTerms, {
    path: ["acceptedTerms"],
    message: "Bạn cần đồng ý Terms of Service"
  });

type FormValues = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
};

type Toast = { type: "error" | "success"; message: string } | null;

export default function RegisterPage() {
  useRedirectIfAuthed();

  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "", acceptedTerms: false }
  });

  const password = watch("password");
  const passwordChecks = useMemo(
    () => ({
      minLen: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      number: /\d/.test(password)
    }),
    [password]
  );

  const onSubmit = async (values: FormValues) => {
    setToast(null);

    try {
      const response = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });

      if (!response.ok) {
        throw new Error("Register failed");
      }

      setSuccess(true);
      setToast({ type: "success", message: "Đăng ký thành công. Mời bạn đăng nhập." });
      setTimeout(() => router.push("/login"), 900);
    } catch {
      setSuccess(false);
      setToast({ type: "error", message: "Đăng ký thất bại. Vui lòng thử lại." });
    }
  };

  return (
    <div>
      {toast ? (
        <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${toast.type === "error" ? "border-error-500 bg-error-50 text-error-500" : "border-success-500 bg-success-50 text-success-500"}`}>
          {toast.message}
        </div>
      ) : null}

      <form className="space-y-4 rounded-xl border border-border bg-bg-surface p-6 shadow-sm" onSubmit={handleSubmit(onSubmit)}>
        <h1 className="text-2xl font-semibold">Tạo tài khoản</h1>

        <Input label="Full name" autoComplete="name" error={errors.name?.message} {...register("name")} />
        <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />

        <Input
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          error={errors.password?.message}
          iconRight={
            <button type="button" className="text-xs text-text-secondary" onClick={() => setShowPassword((prev) => !prev)}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
          {...register("password")}
        />

        <PasswordStrengthIndicator password={password} />
        <p className="text-xs text-text-secondary">{passwordChecks.minLen ? "✓" : "○"} 8+ chars · {passwordChecks.uppercase ? "✓" : "○"} uppercase · {passwordChecks.number ? "✓" : "○"} number</p>

        <Input
          label="Confirm password"
          type={showConfirmPassword ? "text" : "password"}
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          iconRight={
            <button type="button" className="text-xs text-text-secondary" onClick={() => setShowConfirmPassword((prev) => !prev)}>
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
          {...register("confirmPassword")}
        />

        <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" className="h-4 w-4 rounded border-border" {...register("acceptedTerms")} />
          Tôi đồng ý với Terms of Service
        </label>
        {errors.acceptedTerms?.message ? <p className="-mt-2 text-xs text-error-500">{errors.acceptedTerms.message}</p> : null}

        <Button type="submit" className="w-full" loading={isSubmitting}>
          {success ? <span className="auth-check inline-flex items-center gap-1"><CheckCircle2 size={16} /> Success</span> : "Create account"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-text-secondary">
        Đã có tài khoản? <Link href="/login" className="text-brand-600 hover:underline">Đăng nhập</Link>
      </p>
    </div>
  );
}
