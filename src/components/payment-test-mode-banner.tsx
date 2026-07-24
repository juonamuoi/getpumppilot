const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full bg-red-950/60 border-b border-red-800 px-4 py-2 text-center text-xs text-red-200">
        Production checkout is not configured. Complete Stripe go-live to accept real payments.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full bg-amber-950/60 border-b border-amber-800 px-4 py-2 text-center text-xs text-amber-200">
        Payments are in test mode — use card <span className="font-mono">4242 4242 4242 4242</span> with any future date and CVC.
      </div>
    );
  }
  return null;
}
