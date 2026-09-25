"use client";

import type { FormEvent } from "react";

export function confirmSubmit(message: string) {
  return (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  };
}
