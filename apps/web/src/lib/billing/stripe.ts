import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY não configurada.");
  }
  // API version pinned for stable webhook/event shapes (must match stripe package types)
  _stripe = new Stripe(key, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });
  return _stripe;
}

export function getAppUrl(): string {
  const url = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (url) return url.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://plutao-os.vercel.app";
}
