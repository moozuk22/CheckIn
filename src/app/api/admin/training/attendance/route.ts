import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminToken } from "@/lib/adminAuth";
import { publishMemberUpdated } from "@/lib/memberEvents";
import { publishTrainingAttendanceUpdated } from "@/lib/trainingAttendanceEvents";
import { sendPushToMember } from "@/lib/push/service";
import type { PushNotificationPayload } from "@/lib/push/types";
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

function safeNormalizeTrainingTime(raw: unknown): string | null {
  try {
    return normalizeTrainingTime(raw);
  } catch {
    return null;
  }
}

async function verifySession(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  return token ? await verifyAdminToken(token) : null;
}

async function getActiveSchedule() {
  return prisma.trainingSchedule.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    select: {
      trainingWeekdays: true,
      trainingTime: true,
      trainingWindowDays: true,
      timeMode: true,
      trainingDates: true,
      trainingDateTimes: true,
    },
  });
}

function formatBgDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString("bg-BG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedDate = request.nextUrl.searchParams.get("date")?.trim() ?? "";
  if (requestedDate && !isIsoDate(requestedDate)) {
    return NextResponse.json({ error: "Invalid date query parameter" }, { status: 400 });
  }

  const schedule = await getActiveSchedule();
  if (!schedule) {
    return NextResponse.json({
      trainingDate: "",
      weekday: 0,
      trainingTime: null,
      note: "",
      stats: { total: 0, optedOut: 0, attending: 0 },
      members: [],
      upcomingDates: [],
    });
  }

  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: FIXED_TIME_ZONE });
  let upcomingDates: string[];
  if (schedule.trainingDates && schedule.trainingDates.length > 0) {
    upcomingDates = schedule.trainingDates.filter((d) => d >= todayIso).sort();
  } else {
    upcomingDates = getConfiguredTrainingDates({
      weekdays: schedule.trainingWeekdays,
      windowDays: schedule.trainingWindowDays,
      timeZone: FIXED_TIME_ZONE,
      maxDays: TRAINING_SELECTION_WINDOW_DAYS,
    });
  }

  const trainingDate =
    requestedDate && upcomingDates.includes(requestedDate)
      ? requestedDate
      : upcomingDates[0] || "";

  if (!trainingDate) {
    return NextResponse.json({
      trainingDate: "",
      weekday: 0,
      trainingTime: safeNormalizeTrainingTime(schedule.trainingTime),
      note: "",
      stats: { total: 0, optedOut: 0, attending: 0 },
      members: [],
      upcomingDates: [],
    });
  }

  const members = await prisma.member.findMany({
    select: {
      id: true,
      firstName: true,
      secondName: true,
      cards: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { cardCode: true },
      },
    },
    orderBy: [{ firstName: "asc" }, { secondName: "asc" }],
  });

  const memberIds = members.map((m) => m.id);
  const trainingDateAsDate = isoDateToUtcMidnight(trainingDate);
  const upcomingDatesAsDate = upcomingDates.map((d) => isoDateToUtcMidnight(d));

  const [allOptOuts, note] = await Promise.all([
    memberIds.length > 0
      ? prisma.trainingOptOut.findMany({
          where: {
            memberId: { in: memberIds },
            trainingDate: { in: upcomingDatesAsDate },
          },
          select: { memberId: true, trainingDate: true },
        })
      : Promise.resolve([]),
    prisma.trainingNote.findUnique({
      where: { trainingDate: trainingDateAsDate },
      select: { note: true },
    }),
  ]);

  const optedOutCountByDate = new Map<string, number>();
  const selectedDateOptedOutSet = new Set<string>();
  for (const item of allOptOuts) {
    const dateIso = utcDateToIsoDate(item.trainingDate);
    optedOutCountByDate.set(dateIso, (optedOutCountByDate.get(dateIso) ?? 0) + 1);
    if (dateIso === trainingDate) {
      selectedDateOptedOutSet.add(item.memberId);
    }
  }

  const membersWithStatus = members.map((m) => ({
    id: m.id,
    fullName: `${m.firstName} ${m.secondName}`,
    cardCode: m.cards[0]?.cardCode ?? null,
    optedOut: selectedDateOptedOutSet.has(m.id),
  }));

  const activeSchedule = schedule!;
  function resolveTime(date: string): string | null {
    const timesMap = (activeSchedule.trainingDateTimes ?? {}) as Record<string, string>;
    if (activeSchedule.timeMode === "weekday") {
      const wd = getWeekdayMondayFirst(date, FIXED_TIME_ZONE);
      return safeNormalizeTrainingTime(timesMap[String(wd)] ?? activeSchedule.trainingTime);
    }
    if (activeSchedule.timeMode === "date") {
      return safeNormalizeTrainingTime(timesMap[date] ?? activeSchedule.trainingTime);
    }
    return safeNormalizeTrainingTime(activeSchedule.trainingTime);
  }

  const trainingTime = resolveTime(trainingDate);

  return NextResponse.json({
    trainingDate,
    weekday: getWeekdayMondayFirst(trainingDate, FIXED_TIME_ZONE),
    trainingTime,
    note: note?.note ?? "",
    stats: {
      total: membersWithStatus.length,
      optedOut: membersWithStatus.filter((m) => m.optedOut).length,
      attending: membersWithStatus.filter((m) => !m.optedOut).length,
    },
    members: membersWithStatus,
    upcomingDates: upcomingDates.map((date) => ({
      date,
      weekday: getWeekdayMondayFirst(date, FIXED_TIME_ZONE),
      trainingTime: resolveTime(date),
      stats: {
        total: membersWithStatus.length,
        optedOut: optedOutCountByDate.get(date) ?? 0,
        attending: Math.max(0, membersWithStatus.length - (optedOutCountByDate.get(date) ?? 0)),
      },
    })),
  });
}

export async function PUT(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const trainingDate = String((body as { trainingDate?: unknown }).trainingDate ?? "").trim();
  const noteRaw = (body as { note?: unknown }).note;
  const note = noteRaw === null || noteRaw === undefined ? "" : String(noteRaw).trim();

  if (!isIsoDate(trainingDate)) {
    return NextResponse.json({ error: "Invalid trainingDate" }, { status: 400 });
  }

  const schedule = await getActiveSchedule();
  if (!schedule) {
    return NextResponse.json({ error: "No active training schedule" }, { status: 404 });
  }

  const upcomingDates = getConfiguredTrainingDates({
    weekdays: schedule.trainingWeekdays,
    windowDays: schedule.trainingWindowDays,
    timeZone: FIXED_TIME_ZONE,
    maxDays: TRAINING_SELECTION_WINDOW_DAYS,
  });

  if (!upcomingDates.includes(trainingDate)) {
    return NextResponse.json({ error: "Date is outside configured training window" }, { status: 400 });
  }

  const trainingDateAsDate = isoDateToUtcMidnight(trainingDate);

  const allMembers = await prisma.member.findMany({
    select: { cards: { where: { isActive: true }, select: { cardCode: true } } },
  });
  const affectedCardCodes = Array.from(
    new Set(
      allMembers
        .flatMap((m) => m.cards.map((c) => c.cardCode.trim().toUpperCase()))
        .filter((c) => c.length > 0),
    ),
  );

  if (!note) {
    await prisma.trainingNote.deleteMany({ where: { trainingDate: trainingDateAsDate } });
    for (const cardCode of affectedCardCodes) {
      publishMemberUpdated(cardCode, "training-updated");
    }
    publishTrainingAttendanceUpdated(trainingDate);
    return NextResponse.json({ success: true, trainingDate, note: "" });
  }

  if (note.length > 1000) {
    return NextResponse.json({ error: "Note is too long (max 1000 chars)" }, { status: 400 });
  }

  const saved = await prisma.trainingNote.upsert({
    where: { trainingDate: trainingDateAsDate },
    update: { note, updatedAt: new Date() },
    create: { trainingDate: trainingDateAsDate, note },
    select: { trainingDate: true, note: true },
  });

  for (const cardCode of affectedCardCodes) {
    publishMemberUpdated(cardCode, "training-updated");
  }
  publishTrainingAttendanceUpdated(trainingDate);

  return NextResponse.json({
    success: true,
    trainingDate: utcDateToIsoDate(saved.trainingDate),
    note: saved.note ?? "",
  });
}

export async function PATCH(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const memberId = String((body as { memberId?: unknown }).memberId ?? "").trim();
  const trainingDate = String((body as { trainingDate?: unknown }).trainingDate ?? "").trim();
  const optedOut = (body as { optedOut?: unknown }).optedOut;

  if (!memberId) {
    return NextResponse.json({ error: "Missing memberId" }, { status: 400 });
  }
  if (!isIsoDate(trainingDate)) {
    return NextResponse.json({ error: "Invalid trainingDate" }, { status: 400 });
  }
  if (typeof optedOut !== "boolean") {
    return NextResponse.json({ error: "optedOut must be a boolean" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      firstName: true,
      secondName: true,
      cards: { where: { isActive: true }, select: { cardCode: true } },
    },
  });
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const trainingDateAsDate = isoDateToUtcMidnight(trainingDate);

  if (optedOut) {
    await prisma.trainingOptOut.upsert({
      where: { memberId_trainingDate: { memberId: member.id, trainingDate: trainingDateAsDate } },
      update: { reasonCode: "other", reasonText: "Промяна направена от администратор" },
      create: {
        memberId: member.id,
        trainingDate: trainingDateAsDate,
        reasonCode: "other",
        reasonText: "Промяна направена от администратор",
      },
    });
  } else {
    await prisma.trainingOptOut.deleteMany({
      where: { memberId: member.id, trainingDate: trainingDateAsDate },
    });
  }

  const formattedDate = formatBgDate(trainingDate);
  const firstCardCode = member.cards[0]?.cardCode ?? null;
  const memberPayload: PushNotificationPayload = {
    title: "Промяна в присъствието",
    body: optedOut
      ? `Администраторът е отбелязал отсъствие за тренировка на ${formattedDate}.`
      : `Администраторът е потвърдил присъствие за тренировка на ${formattedDate}.`,
    url: firstCardCode ? `/member/${encodeURIComponent(firstCardCode)}?training=1` : "/",
    icon: "/logo.png",
    badge: "/logo.png",
    tag: "training-attendance-updated",
    data: { type: "training_reminder", trainingDate },
  };

  try {
    await sendPushToMember(member.id, memberPayload);
  } catch (error) {
    console.error("Member push send error (admin attendance change):", error);
  }

  for (const { cardCode } of member.cards) {
    publishMemberUpdated(cardCode, "training-updated");
  }
  publishTrainingAttendanceUpdated(trainingDate);

  return NextResponse.json({ success: true, memberId: member.id, trainingDate, optedOut });
}
