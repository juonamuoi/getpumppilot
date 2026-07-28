/**
 * Waitlist emails.
 *
 * The send helper is only present once the project's transactional email
 * templates are scaffolded (which requires a verified sender domain). Until
 * then these functions no-op so signups never fail because of email setup.
 */

type Sender = (
  template: string,
  to: string,
  opts: { templateData?: Record<string, unknown>; idempotencyKey?: string },
) => Promise<{ sent: boolean; reason?: string }>;

async function getSender(): Promise<Sender | null> {
  try {
    const mod = await import("@/lib/email-templates/send-email");
    return (mod as unknown as { sendTemplateEmail: Sender }).sendTemplateEmail;
  } catch {
    return null;
  }
}

export async function sendWaitlistConfirmation(email: string, id: string) {
  const send = await getSender();
  if (!send) return false;
  const res = await send("waitlist-confirmation", email, {
    templateData: { email },
    idempotencyKey: `waitlist-confirm-${id}`,
  });
  return res.sent;
}

export async function sendWaitlistFollowUp(email: string, id: string) {
  const send = await getSender();
  if (!send) return false;
  const res = await send("waitlist-follow-up", email, {
    templateData: { email },
    idempotencyKey: `waitlist-followup-${id}`,
  });
  return res.sent;
}
