"use client";

import { useLanguage } from "./LanguageProvider";

import { InputHTMLAttributes, useId, useState } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput({ className = "", id, ...props }: PasswordInputProps) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id || generatedId;
  const label = visible ? t("Nascondi password") : t("Mostra password");

  return (
    <span className={`password-field ${className}`}>
      <input {...props} id={inputId} type={visible ? "text" : "password"} />
      <button type="button" className="password-toggle" aria-label={t(label)} title={t(label)}
        aria-controls={inputId} aria-pressed={visible} disabled={props.disabled}
        onClick={() => setVisible(value => !value)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="m3 3 18 18" />}
        </svg>
      </button>
    </span>
  );
}
