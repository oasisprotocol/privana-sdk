# Privana SDK Preview

Next.js app that showcases the Privana SDK features.

## Environment

Create `apps/preview/.env.local`:

```bash
# Public MoonPay key — `pk_test_*` is the sandbox key (test-mode currencies,
# no real charges). `pk_live_*` switches to production. Required by the
# /on-ramp route; the widget crashes at render if missing.
NEXT_PUBLIC_MOONPAY_API_KEY=pk_test_...
```
