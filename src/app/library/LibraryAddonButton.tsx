"use client";

import { PayButton } from "@/app/renew/PayButton";
import { startLibraryAddonPayment } from "@/app/renew/actions";

/**
 * Buys or renews the borrowing add-on.
 *
 * Reuses the renewal PayButton wholesale, including its hard-won fix for
 * submitting the hidden checkout form only once React has committed it. The
 * action takes no fields -- the price comes from app_settings inside the RPC,
 * so there is nothing for this component to state or get wrong.
 */
export function LibraryAddonButton({ isRenewal }: { isRenewal: boolean }) {
  return (
    <PayButton
      action={startLibraryAddonPayment}
      fields={{}}
      label={isRenewal ? "Renew borrowing" : "Add borrowing"}
    />
  );
}
