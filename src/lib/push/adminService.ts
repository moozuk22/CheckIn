import webpush from "web-push";
import { prisma } from "@/lib/db";
import { getVapidConfig } from "@/lib/push/vapid";
import type { BrowserPushSubscription, PushNotificationPayload } from "@/lib/push/types";

const MIN_AGE_FOR_404_DEACTIVATION_MS = 24 * 60 * 60 * 1000;
let isWebPushConfigured = false;

function ensureWebPushConfigured() {
  if (isWebPushConfigured) return;
  const vapid = getVapidConfig();
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  isWebPushConfigured = true;
}

function getPushErrorStatusCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const e = error as { statusCode?: number };
  return typeof e.statusCode === "number" ? e.statusCode : null;
}

function shouldDeactivate(statusCode: number | null, createdAt: Date) {
  if (statusCode === 410) return true;
  if (statusCode === 404) return Date.now() - createdAt.getTime() >= MIN_AGE_FOR_404_DEACTIVATION_MS;
  return false;
}

export async function saveAdminPushSubscription(input: {
  subscription: BrowserPushSubscription;
  userAgent?: string | null;
  device?: string | null;
}) {
  return prisma.adminPushSubscription.upsert({
    where: { endpoint: input.subscription.endpoint },
    update: {
      p256dh: input.subscription.keys.p256dh,
      auth: input.subscription.keys.auth,
      userAgent: input.userAgent ?? undefined,
      device: input.device ?? undefined,
      isActive: true,
    },
    create: {
      endpoint: input.subscription.endpoint,
      p256dh: input.subscription.keys.p256dh,
      auth: input.subscription.keys.auth,
      userAgent: input.userAgent ?? undefined,
      device: input.device ?? undefined,
    },
  });
}

export async function deactivateAdminPushSubscription(endpoint: string) {
  return prisma.adminPushSubscription.updateMany({
    where: { endpoint },
    data: { isActive: false },
  });
}

export async function isAdminPushSubscriptionActive(endpoint: string) {
  const row = await prisma.adminPushSubscription.findUnique({
    where: { endpoint },
    select: { isActive: true },
  });
  return Boolean(row?.isActive);
}

export interface SendAdminPushResult {
  total: number;
  sent: number;
  failed: number;
  deactivated: number;
}

export async function sendPushToAdmins(
  payload: PushNotificationPayload,
): Promise<SendAdminPushResult> {
  const subscriptions = await prisma.adminPushSubscription.findMany({
    where: { isActive: true },
    select: { id: true, endpoint: true, p256dh: true, auth: true, createdAt: true },
  });

  if (subscriptions.length === 0) return { total: 0, sent: 0, failed: 0, deactivated: 0 };

  ensureWebPushConfigured();

  let sent = 0, failed = 0, deactivated = 0;
  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode = getPushErrorStatusCode(error);
        if (shouldDeactivate(statusCode, sub.createdAt)) {
          deactivated += 1;
          await prisma.adminPushSubscription.update({ where: { id: sub.id }, data: { isActive: false } });
        }
        console.error("Admin push delivery error:", error);
      }
    }),
  );

  return { total: subscriptions.length, sent, failed, deactivated };
}
