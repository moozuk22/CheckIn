import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publishTrainingAttendanceUpdated } from "@/lib/trainingAttendanceEvents";
import { publishAdminNotificationCreated } from "@/lib/adminNotificationEvents";
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
type MemberOptInRow = { trainingDate: Date };
type MemberNoteRow = { trainingDate: Date; note: string | null };

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
          group: true,
        },
      },
    },
  });

  if (!card?.member) {
    return null;
  }

  const memberGroup = card.member.group;
  if (!memberGroup) {
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

  const schedule = await prisma.trainingSchedule.findFirst({
    where: { isActive: true, group: memberGroup },
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
  const [optInRows, noteRows]: [MemberOptInRow[], MemberNoteRow[]] = await Promise.all([
    prisma.trainingOptIn.findMany({
      where: {
        memberId: context.memberId,
        trainingDate: { in: trainingDatesAsUtc },
      },
      select: { trainingDate: true },
    }),
    prisma.trainingNote.findMany({
      where: { trainingDate: { in: trainingDatesAsUtc } },
      select: { trainingDate: true, note: true },
    }),
  ]);

  const optInDates = new Set(optInRows.map((item) => utcDateToIsoDate(item.trainingDate)));
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
      optedOut: !optInDates.has(date),
      optOutReasonCode: null,
      optOutReasonText: null,
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

  if (!isIsoDate(trainingDate)) {
    return NextResponse.json({ error: "Invalid trainingDate" }, { status: 400 });
  }
  if (!context.upcomingDates.includes(trainingDate)) {
    return NextResponse.json({ error: "Date is outside configured training window" }, { status: 400 });
  }

  await prisma.trainingOptIn.upsert({
    where: {
      memberId_trainingDate: {
        memberId: context.memberId,
        trainingDate: isoDateToUtcMidnight(trainingDate),
      },
    },
    update: {},
    create: {
      memberId: context.memberId,
      trainingDate: isoDateToUtcMidnight(trainingDate),
    },
  });

  publishTrainingAttendanceUpdated(trainingDate);

  await prisma.adminNotification.create({
    data: {
      type: "training_opt_in",
      title: "Потвърдено присъствие",
      body: `${context.memberName} ще присъства на тренировката на ${formatBgDate(trainingDate)}.`,
    },
  });
  publishAdminNotificationCreated();

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

  await prisma.trainingOptIn.deleteMany({
    where: {
      memberId: context.memberId,
      trainingDate: isoDateToUtcMidnight(trainingDate),
    },
  });

  publishTrainingAttendanceUpdated(trainingDate);

  await prisma.adminNotification.create({
    data: {
      type: "training_opt_out",
      title: "Отсъствие от тренировка",
      body: `${context.memberName} ще отсъства на ${formatBgDate(trainingDate)}.`,
    },
  });
  publishAdminNotificationCreated();

  void sendPushToAdmins({
    title: "Отсъствие от тренировка",
    body: `${context.memberName} ще отсъства на ${formatBgDate(trainingDate)}.`,
    url: `/admin/members?training=1&date=${trainingDate}`,
    icon: "/logo.png",
    badge: "/logo.png",
    tag: `training-opt-out-${context.memberId}-${trainingDate}`,
  }).catch((err) => console.error("Admin push (opt-out) error:", err));

  return NextResponse.json({ success: true, trainingDate, optedOut: true });
}
