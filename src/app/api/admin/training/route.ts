import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getWeekdayMondayFirst, isIsoDate, isoDateToUtcMidnight } from "@/lib/training";
import { publishMemberUpdated } from "@/lib/memberEvents";
import {
  sendTrainingScheduleNotifications,
  shouldNotifyForTrainingDatesChange,
} from "@/lib/push/trainingScheduleNotifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIXED_TIME_ZONE = "Europe/Sofia";

async function verifySession(request: NextRequest) {
  const token = request.cookies.get("admin_session")?.value;
  return token ? await verifyAdminToken(token) : null;
}

function getTodayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: FIXED_TIME_ZONE });
}

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schedule = await prisma.trainingSchedule.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  const todayIso = getTodayIso();
  const upcomingDateStrings = (schedule?.trainingDates ?? [])
    .filter((d) => d >= todayIso)
    .sort();

  const [totalMembers, optOutRows] = await Promise.all([
    prisma.member.count(),
    upcomingDateStrings.length > 0
      ? prisma.trainingOptOut.groupBy({
          by: ["trainingDate"],
          where: { trainingDate: { in: upcomingDateStrings.map(isoDateToUtcMidnight) } },
          _count: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const optOutCountByDate = new Map(
    optOutRows.map((row) => [
      row.trainingDate.toISOString().slice(0, 10),
      row._count.id,
    ])
  );

  const upcomingDates = upcomingDateStrings.map((date) => {
    const optOutCount = optOutCountByDate.get(date) ?? 0;
    return {
      date,
      weekday: getWeekdayMondayFirst(date, FIXED_TIME_ZONE),
      attendingCount: totalMembers - optOutCount,
      totalMembers,
    };
  });

  return NextResponse.json({
    schedule: schedule
      ? {
          id: schedule.id,
          trainingWeekdays: schedule.trainingWeekdays,
          trainingTime: schedule.trainingTime,
          trainingWindowDays: schedule.trainingWindowDays,
          isActive: schedule.isActive,
          timeMode: schedule.timeMode,
          trainingDates: schedule.trainingDates,
          trainingDateTimes: schedule.trainingDateTimes,
        }
      : null,
    upcomingDates,
    totalMembers,
  });
}

type TimeMode = "single" | "weekday" | "date";

export async function PUT(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;

  const rawDates = body.trainingDates;
  if (!Array.isArray(rawDates)) {
    return NextResponse.json({ error: "trainingDates must be an array" }, { status: 400 });
  }
  const todayIso = getTodayIso();
  const trainingDates = rawDates.map(String).filter(isIsoDate).filter((d) => d >= todayIso).sort();

  const rawMode = String(body.timeMode ?? "single");
  if (rawMode !== "single" && rawMode !== "weekday" && rawMode !== "date") {
    return NextResponse.json({ error: "Invalid timeMode" }, { status: 400 });
  }
  const timeMode: TimeMode = rawMode;

  let trainingTime: string | null = null;
  if (timeMode === "single" && body.trainingTime) {
    const t = String(body.trainingTime).trim();
    if (/^\d{1,2}:\d{2}$/.test(t)) {
      const [h, m] = t.split(":").map(Number);
      if (h !== undefined && m !== undefined && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        trainingTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      }
    }
  }

  let trainingDateTimes: Record<string, string> | null = null;
  if ((timeMode === "weekday" || timeMode === "date") && body.trainingDateTimes) {
    const raw = body.trainingDateTimes as Record<string, unknown>;
    const validated: Record<string, string> = {};
    for (const [key, val] of Object.entries(raw)) {
      const t = String(val ?? "").trim();
      if (/^\d{1,2}:\d{2}$/.test(t)) {
        const [h, m] = t.split(":").map(Number);
        if (h !== undefined && m !== undefined && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
          validated[key] = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        }
      }
    }
    trainingDateTimes = Object.keys(validated).length > 0 ? validated : null;
  }

  // Derive weekdays from selected dates (for backwards compat with attendance API)
  const trainingWeekdays = [
    ...new Set(trainingDates.map((d) => getWeekdayMondayFirst(d, FIXED_TIME_ZONE))),
  ].sort((a, b) => a - b);

  const existing = await prisma.trainingSchedule.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  const jsonValue = trainingDateTimes ?? undefined;

  const saved = existing
    ? await prisma.trainingSchedule.update({
        where: { id: existing.id },
        data: {
          trainingDates,
          trainingWeekdays,
          timeMode,
          trainingTime,
          trainingDateTimes: jsonValue,
        },
      })
    : await prisma.trainingSchedule.create({
        data: {
          trainingDates,
          trainingWeekdays,
          timeMode,
          trainingTime,
          trainingDateTimes: jsonValue,
          isActive: true,
        },
      });

  // Publish SSE to all active member card codes so member pages live-update
  void prisma.card.findMany({
    where: { isActive: true },
    select: { cardCode: true },
  }).then((cards) => {
    for (const { cardCode } of cards) {
      publishMemberUpdated(cardCode, "training-updated");
    }
  }).catch((err) => console.error("Training SSE publish error:", err));

  // Send push notifications if training dates changed
  const previousDates = existing?.trainingDates ?? [];
  if (shouldNotifyForTrainingDatesChange(previousDates, trainingDates)) {
    void sendTrainingScheduleNotifications({
      previousDates,
      trainingDates,
    }).catch((err) => console.error("Training schedule push error:", err));
  }

  return NextResponse.json({
    success: true,
    schedule: {
      id: saved.id,
      trainingDates: saved.trainingDates,
      trainingWeekdays: saved.trainingWeekdays,
      timeMode: saved.timeMode,
      trainingTime: saved.trainingTime,
      trainingDateTimes: saved.trainingDateTimes,
      isActive: saved.isActive,
    },
  });
}
