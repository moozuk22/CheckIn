import { prisma } from "@/lib/db";
import { saveMemberNotificationHistory } from "@/lib/push/history";
import { sendPushToMember } from "@/lib/push/service";
import type { PushNotificationPayload } from "@/lib/push/types";

const MEMBER_PROCESSING_CONCURRENCY = 4;

export interface TrainingScheduleNotificationSummary {
  targetedMembers: number;
  total: number;
  sent: number;
  failed: number;
  deactivated: number;
  historySaved: number;
}

function areSameDates(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function getTodayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Sofia" });
}

export function shouldNotifyForTrainingDatesChange(
  previousDates: string[],
  nextDates: string[],
) {
  const today = getTodayIso();
  const prevFuture = [...previousDates].filter((d) => d >= today).sort();
  const nextFuture = [...nextDates].filter((d) => d >= today).sort();
  if (nextFuture.length === 0) return false;
  return !areSameDates(prevFuture, nextFuture);
}

export async function sendTrainingScheduleNotifications(input: {
  previousDates: string[];
  trainingDates: string[];
}): Promise<TrainingScheduleNotificationSummary> {
  if (input.trainingDates.length === 0) {
    return { targetedMembers: 0, total: 0, sent: 0, failed: 0, deactivated: 0, historySaved: 0 };
  }

  const members = await prisma.member.findMany({
    select: {
      id: true,
      cards: {
        where: { isActive: true },
        select: { cardCode: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const summary: TrainingScheduleNotificationSummary = {
    targetedMembers: members.length,
    total: 0,
    sent: 0,
    failed: 0,
    deactivated: 0,
    historySaved: 0,
  };

  if (members.length === 0) return summary;

  const today = getTodayIso();
  const payloadTemplate = buildTrainingSchedulePayload({
    previousDates: input.previousDates.filter((d) => d >= today),
    nextDates: input.trainingDates.filter((d) => d >= today),
  });

  for (let index = 0; index < members.length; index += MEMBER_PROCESSING_CONCURRENCY) {
    const batch = members.slice(index, index + MEMBER_PROCESSING_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (member) => {
        const payload: PushNotificationPayload = {
          ...payloadTemplate,
          url: member.cards[0] ? `/member/${member.cards[0].cardCode}?training=1` : "/",
        };

        let historySaved = 0;
        try {
          await saveMemberNotificationHistory(member.id, "training_reminder", payload);
          historySaved = 1;
        } catch (error) {
          console.error("Training schedule notification history save failed:", error);
        }

        try {
          const push = await sendPushToMember(member.id, payload);
          return { ...push, historySaved };
        } catch (error) {
          console.error("Training schedule push send failed:", error);
          return { total: 0, sent: 0, failed: 1, deactivated: 0, historySaved };
        }
      }),
    );

    for (const result of results) {
      summary.total += result.total;
      summary.sent += result.sent;
      summary.failed += result.failed;
      summary.deactivated += result.deactivated;
      summary.historySaved += result.historySaved;
    }
  }

  return summary;
}

function uniqueSortedDates(dates: string[]) {
  return Array.from(new Set(dates.map((v) => String(v ?? "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function formatBgDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("bg-BG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateList(dates: string[]) {
  return dates.map(formatBgDate).join(", ");
}

function formatPeriodFromDates(dates: string[]) {
  if (dates.length === 0) return "";
  const sorted = uniqueSortedDates(dates);
  if (sorted.length === 1) return formatBgDate(sorted[0]!);
  return `${formatBgDate(sorted[0]!)} - ${formatBgDate(sorted[sorted.length - 1]!)}`;
}

function diffDates(previousDates: string[], nextDates: string[]) {
  const prev = uniqueSortedDates(previousDates);
  const next = uniqueSortedDates(nextDates);
  const nextSet = new Set(next);
  const prevSet = new Set(prev);
  return {
    prev,
    next,
    removed: prev.filter((d) => !nextSet.has(d)),
    added: next.filter((d) => !prevSet.has(d)),
  };
}

function buildTrainingScheduleMessage(previousDates: string[], nextDates: string[]) {
  const { prev, next, removed, added } = diffDates(previousDates, nextDates);
  const previousLast = prev[prev.length - 1] ?? "";
  const onlyExtendedAfterPreviousPeriod =
    prev.length > 0 &&
    removed.length === 0 &&
    added.length > 0 &&
    added.every((date) => date > previousLast);

  if (prev.length === 0 || onlyExtendedAfterPreviousPeriod) {
    const period = formatPeriodFromDates(prev.length === 0 ? next : added);
    return `Насрочен тренировъчен график за периода ${period}`;
  }

  const changePeriod = formatPeriodFromDates(uniqueSortedDates([...prev, ...next]));
  const base = `Промяна в тренировъчния график за периода ${changePeriod}`;

  if (removed.length > 0 && added.length > 0 && removed.length === added.length) {
    if (removed.length === 1) {
      return `${base}, тренировката на ${formatBgDate(removed[0]!)} беше преместена на ${formatBgDate(added[0]!)}`;
    }
    return `${base}, тренировките на ${formatDateList(removed)} бяха преместени на ${formatDateList(added)}`;
  }

  if (removed.length > 0 && added.length > 0) {
    return `${base}, добавени тренировки: ${formatDateList(added)}; отменени тренировки: ${formatDateList(removed)}`;
  }

  if (added.length > 0) {
    if (added.length === 1) return `${base}, добавена тренировка на ${formatBgDate(added[0]!)}`;
    return `${base}, добавени тренировки: ${formatDateList(added)}`;
  }

  if (removed.length > 0) {
    if (removed.length === 1) return `${base}, отменена тренировка на ${formatBgDate(removed[0]!)}`;
    return `${base}, отменени тренировки: ${formatDateList(removed)}`;
  }

  return `${base}.`;
}

function buildTrainingSchedulePayload(input: {
  previousDates: string[];
  nextDates: string[];
}): PushNotificationPayload {
  return {
    title: "Тренировъчен график",
    body: buildTrainingScheduleMessage(input.previousDates, input.nextDates),
    icon: "/logo.png",
    badge: "/logo.png",
    tag: "training-schedule-updated",
    data: { type: "training_reminder" },
  };
}
