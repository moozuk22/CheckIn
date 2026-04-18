import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publishTrainingAttendanceUpdated } from "@/lib/trainingAttendanceEvents";
import { sendPushToAdmins } from "@/lib/push/adminService";
import {
  getConfiguredTrainingDates,
  getWeekdayMondayFirst,
  isIsoDate,
  isoDateToUtcMidnight,
  normalizeTrainingTime,
  utcDateToIsoDate,
} from "@/lib/training";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIXED_TIME_ZONE = "Europe/Sofia";
const TRAINING_SELECTION_WINDOW_DAYS = 30;

const OPT_OUT_REASON_LABELS_BG = {
  injury: "Контузия",
  sick: "Болен",
  other: "Друго",
} as const;

type OptOutReasonCode = keyof typeof OPT_OUT_REASON_LABELS_BG;

function formatBgDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString("bg-BG", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
  });
}

function safeNormalizeTrainingTime(raw: unknown): string | null {
  try {
    return normalizeTrainingTime(raw);
  } catch {
    return null;
  }
}

function parseOptOutReason(
  rawCode: unknown,
  rawText: unknown,
): { code: OptOutReasonCode; text: string | null } | { error: string } {
  const code = String(rawCode ?? "").trim().toLowerCase();
  if (code !== "injury" && code !== "sick" && code !== "other") {
    return { error: "Invalid opt-out reason." };
  }

  const text = String(rawText ?? "").trim();
  if (code === "other") {
    if (text.length === 0) {
      return { error: "Reason text is required when reason is 'other'." };
    }
    if (text.length > 200) {
      return { error: "Reason text must be at most 200 characters." };
    }
    return { code, text };
  }

  return { code, text: null };
}

function resolveTimeForDate(
  date: string,
  timeMode: string,
  trainingTime: string | null,
  trainingDateTimes: unknown,
): string | null {
  const timesMap = (trainingDateTimes ?? {}) as Record<string, string>;
  if (timeMode === "weekday") {
    const weekday = getWeekdayMondayFirst(date, FIXED_TIME_ZONE);
    return safeNormalizeTrainingTime(timesMap[String(weekday)] ?? trainingTime);
  }
  if (timeMode === "date") {
    return safeNormalizeTrainingTime(timesMap[date] ?? trainingTime);
  }
  return safeNormalizeTrainingTime(trainingTime);
}

async function getMemberTrainingContext(cardCode: string) {
  const normalizedCardCode = cardCode.trim().toUpperCase();
  const card = await prisma.card.findFirst({
    where: { cardCode: normalizedCardCode, isActive: true },
    select: {
      cardCode: true,
      memberId: true,
      member: {
        select: {
          id: true,
          firstName: true,
          secondName: true,
        },
      },
    },
  });

  if (!card?.member) {
    return null;
  }

  const schedule = await prisma.trainingSchedule.findFirst({
    where: { isActive: true },
    select: {
      trainingWeekdays: true,
      trainingTime: true,
      trainingWindowDays: true,
      timeMode: true,
      trainingDates: true,
      trainingDateTimes: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!schedule) {
    return {
      cardCode: card.cardCode,
      memberId: card.memberId,
      memberName: `${card.member.firstName} ${card.member.secondName}`,
      trainingWeekdays: [] as number[],
      trainingWindowDays: TRAINING_SELECTION_WINDOW_DAYS,
      upcomingDates: [] as string[],
      schedule: null,
    };
  }

  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: FIXED_TIME_ZONE });

  let upcomingDates: string[];
  if (schedule.trainingDates && schedule.trainingDates.length > 0) {
    upcomingDates = schedule.trainingDates.filter((d) => d >= todayIso).sort();
  } else {
    const trainingWeekdays = schedule.trainingWeekdays
      .filter((v) => Number.isInteger(v) && v >= 1 && v <= 7)
      .sort((a, b) => a - b);
    upcomingDates = getConfiguredTrainingDates({
      weekdays: trainingWeekdays,
      windowDays: schedule.trainingWindowDays,
      timeZone: FIXED_TIME_ZONE,
      maxDays: TRAINING_SELECTION_WINDOW_DAYS,
    });
  }

  return {
    cardCode: card.cardCode,
    memberId: card.memberId,
    memberName: `${card.member.firstName} ${card.member.secondName}`,
    trainingWeekdays: schedule.trainingWeekdays,
    trainingWindowDays: schedule.trainingWindowDays,
    upcomingDates,
    schedule,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cardCode: string }> },
) {
  const { cardCode } = await params;
  const context = await getMemberTrainingContext(cardCode);

  if (!context) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (context.upcomingDates.length === 0) {
    return NextResponse.json({
      cardCode: context.cardCode,
      trainingWeekdays: context.trainingWeekdays,
      trainingWindowDays: context.trainingWindowDays,
      dates: [],
    });
  }

  const trainingDatesAsUtc = context.upcomingDates.map((d) => isoDateToUtcMidnight(d));
  const [optOutRows, noteRows] = await Promise.all([
    prisma.trainingOptOut.findMany({
      where: {
        memberId: context.memberId,
        trainingDate: { in: trainingDatesAsUtc },
      },
      select: { trainingDate: true, reasonCode: true, reasonText: true },
    }),
    prisma.trainingNote.findMany({
      where: { trainingDate: { in: trainingDatesAsUtc } },
      select: { trainingDate: true, note: true },
    }),
  ]);

  const optedOutByDate = new Map(
    optOutRows.map((item) => [
      utcDateToIsoDate(item.trainingDate),
      { reasonCode: item.reasonCode, reasonText: item.reasonText },
    ] as const),
  );
  const noteByDate = new Map(
    noteRows
      .map((item) => [utcDateToIsoDate(item.trainingDate), item.note?.trim() ?? ""] as const)
      .filter(([, note]) => note.length > 0),
  );

  return NextResponse.json({
    cardCode: context.cardCode,
    trainingWeekdays: context.trainingWeekdays,
    trainingWindowDays: context.trainingWindowDays,
    dates: context.upcomingDates.map((date) => ({
      date,
      weekday: getWeekdayMondayFirst(date, FIXED_TIME_ZONE),
      optedOut: optedOutByDate.has(date),
      optOutReasonCode: optedOutByDate.get(date)?.reasonCode ?? null,
      optOutReasonText: optedOutByDate.get(date)?.reasonText ?? null,
      trainingTime: context.schedule
        ? resolveTimeForDate(
            date,
            context.schedule.timeMode,
            context.schedule.trainingTime,
            context.schedule.trainingDateTimes,
          ) ?? ""
        : "",
      note: noteByDate.get(date) ?? "",
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ cardCode: string }> },
) {
  const { cardCode } = await params;
  const context = await getMemberTrainingContext(cardCode);

  if (!context) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const trainingDate = String((body as { trainingDate?: unknown }).trainingDate ?? "").trim();
  const parsedReason = parseOptOutReason(
    (body as { reasonCode?: unknown }).reasonCode,
    (body as { reasonText?: unknown }).reasonText,
  );

  if (!isIsoDate(trainingDate)) {
    return NextResponse.json({ error: "Invalid trainingDate" }, { status: 400 });
  }
  if (!context.upcomingDates.includes(trainingDate)) {
    return NextResponse.json({ error: "Date is outside configured training window" }, { status: 400 });
  }
  if ("error" in parsedReason) {
    return NextResponse.json({ error: parsedReason.error }, { status: 400 });
  }

  await prisma.trainingOptOut.upsert({
    where: {
      memberId_trainingDate: {
        memberId: context.memberId,
        trainingDate: isoDateToUtcMidnight(trainingDate),
      },
    },
    update: { reasonCode: parsedReason.code, reasonText: parsedReason.text },
    create: {
      memberId: context.memberId,
      trainingDate: isoDateToUtcMidnight(trainingDate),
      reasonCode: parsedReason.code,
      reasonText: parsedReason.text,
    },
  });

  publishTrainingAttendanceUpdated(trainingDate);

  void sendPushToAdmins({
    title: "Отсъствие от тренировка",
    body: `${context.memberName} ще отсъства на ${formatBgDate(trainingDate)}.`,
    url: `/admin/members?training=1&date=${trainingDate}`,
    icon: "/logo.png",
    badge: "/logo.png",
    tag: `training-opt-out-${context.memberId}-${trainingDate}`,
  }).catch((err) => console.error("Admin push (opt-out) error:", err));

  return NextResponse.json({
    success: true,
    trainingDate,
    optedOut: true,
    reasonCode: parsedReason.code,
    reasonText: parsedReason.text,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ cardCode: string }> },
) {
  const { cardCode } = await params;
  const context = await getMemberTrainingContext(cardCode);

  if (!context) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const trainingDate = String((body as { trainingDate?: unknown }).trainingDate ?? "").trim();

  if (!isIsoDate(trainingDate)) {
    return NextResponse.json({ error: "Invalid trainingDate" }, { status: 400 });
  }

  await prisma.trainingOptOut.deleteMany({
    where: {
      memberId: context.memberId,
      trainingDate: isoDateToUtcMidnight(trainingDate),
    },
  });

  publishTrainingAttendanceUpdated(trainingDate);

  void sendPushToAdmins({
    title: "Потвърдено присъствие",
    body: `${context.memberName} ще присъства на тренировката на ${formatBgDate(trainingDate)}.`,
    url: `/admin/members?training=1&date=${trainingDate}`,
    icon: "/logo.png",
    badge: "/logo.png",
    tag: `training-opt-in-${context.memberId}-${trainingDate}`,
  }).catch((err) => console.error("Admin push (opt-in) error:", err));

  return NextResponse.json({ success: true, trainingDate, optedOut: false });
}
