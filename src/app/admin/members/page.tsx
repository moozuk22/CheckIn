"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AdminPushPanel } from "@/components/push/AdminPushPanel";
import { AdminNotificationBell } from "@/components/admin/AdminNotificationBell";

const MODAL_MONTH_NAMES = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември']
const MODAL_WEEKDAY_SHORT = ['Пон', 'Вт', 'Ср', 'Чет', 'Пет', 'Съб', 'Нед']
const MODAL_WEEKDAY_FULL = ['Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота', 'Неделя']

function getModalTodayIso() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Sofia' })
}

function buildModalCalendarMonths(todayIso: string) {
  const limit = new Date(`${todayIso}T00:00:00.000Z`)
  limit.setUTCDate(limit.getUTCDate() + 30)
  const limitIso = limit.toISOString().slice(0, 10)
  const monthsNeeded = new Set<string>()
  const cur = new Date(`${todayIso}T00:00:00.000Z`)
  while (cur <= limit) {
    monthsNeeded.add(`${cur.getUTCFullYear()}-${cur.getUTCMonth() + 1}`)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return [...monthsNeeded]
    .map((key) => {
      const [y, m] = key.split('-').map(Number) as [number, number]
      return { year: y, month: m }
    })
    .sort((a, b) => a.year === b.year ? a.month - b.month : a.year - b.year)
    .map(({ year, month }) => {
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
      const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
      const leadingEmpty = (firstWeekday + 6) % 7
      const cells: Array<string | null> = Array.from({ length: leadingEmpty }, () => null)
      for (let day = 1; day <= daysInMonth; day++) {
        cells.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
      }
      while (cells.length % 7 !== 0) cells.push(null)
      return { key: `${year}-${month}`, label: `${MODAL_MONTH_NAMES[month - 1] ?? ''} ${year}`, cells, limitIso }
    })
}

function resolveModalTime(
  date: string,
  weekday: number,
  schedule: { timeMode: string; trainingTime: string | null; trainingDateTimes: Record<string, string> | null },
): string | null {
  const map = (schedule.trainingDateTimes ?? {}) as Record<string, string>
  if (schedule.timeMode === 'single') return schedule.trainingTime ?? null
  if (schedule.timeMode === 'weekday') return map[String(weekday)] ?? schedule.trainingTime ?? null
  return map[date] ?? schedule.trainingTime ?? null
}

interface Card {
  id: string;
  cardCode: string;
  isActive: boolean;
}

interface Member {
  id: string;
  firstName: string;
  secondName: string;
  visitsTotal: number;
  visitsUsed: number;
  group: "AMATEURS" | "ADVANCED" | null;
  cards: Card[];
}

interface Question {
  id: string;
  text?: string;
  question?: string;
  createdAt: string;
  isActive: boolean;
  answersCount?: number;
}

interface TrainingSchedule {
  id: string;
  timeMode: 'single' | 'weekday' | 'date';
  trainingTime: string | null;
  trainingDateTimes: Record<string, string> | null;
  isActive: boolean;
}

interface UpcomingTrainingDate {
  date: string;
  weekday: number;
  attendingCount: number;
  totalMembers: number;
}

interface QuestionAnswer {
  id: string;
  answer: string;
  member: {
    firstName: string;
    secondName: string;
  };
}

interface AttendanceMember {
  id: string;
  fullName: string;
  cardCode: string | null;
  optedOut: boolean;
}

interface AttendanceDayDetail {
  trainingDate: string;
  weekday: number;
  trainingTime: string | null;
  note: string;
  stats: { total: number; optedOut: number; attending: number };
  members: AttendanceMember[];
}

export default function AdminMembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isMembersLoading, setIsMembersLoading] = useState(true);
  const [isQuestionsLoading, setIsQuestionsLoading] = useState(false);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<Question | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingQuestion, setIsDeletingQuestion] = useState(false);
  const [selectedQuestionAnswers, setSelectedQuestionAnswers] = useState<Question | null>(null);
  const [questionAnswers, setQuestionAnswers] = useState<QuestionAnswer[]>([]);
  const [isLoadingAnswers, setIsLoadingAnswers] = useState(false);
  const [view, setView] = useState<'members' | 'questions'>('members');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [trainingModalGroup, setTrainingModalGroup] = useState<'AMATEURS' | 'ADVANCED'>('AMATEURS');
  const [trainingSchedule, setTrainingSchedule] = useState<TrainingSchedule | null>(null);
  const [upcomingTrainingDates, setUpcomingTrainingDates] = useState<UpcomingTrainingDate[]>([]);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [trainingDayDetail, setTrainingDayDetail] = useState<{ date: string; loading: boolean; data: AttendanceDayDetail | null } | null>(null);
  const trainingDayDetailRef = useRef(trainingDayDetail);
  useEffect(() => { trainingDayDetailRef.current = trainingDayDetail; }, [trainingDayDetail]);
  const router = useRouter();

  const fetchMembers = async (showLoader = true) => {
    if (showLoader) {
      setIsMembersLoading(true);
    }

    try {
      const response = await fetch("/api/admin/members");
      if (response.ok) {
        const data = await response.json();
        setMembers(data);
      }
    } catch (err) {
      console.error("Error fetching members:", err);
    } finally {
      if (showLoader) {
        setIsMembersLoading(false);
      }
    }
  };

  const fetchTrainingData = async (group: 'AMATEURS' | 'ADVANCED', showLoader = true) => {
    if (showLoader) setTrainingLoading(true);
    try {
      const res = await fetch(`/api/admin/training?group=${group}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json() as { schedule: TrainingSchedule | null; upcomingDates: UpcomingTrainingDate[] };
        setTrainingSchedule(data.schedule);
        setUpcomingTrainingDates(data.upcomingDates ?? []);
      }
    } catch (err) {
      console.error('Training schedule fetch error:', err);
    } finally {
      if (showLoader) setTrainingLoading(false);
    }
  };

  const switchTrainingModalGroup = (group: 'AMATEURS' | 'ADVANCED') => {
    setTrainingModalGroup(group);
    void fetchTrainingData(group, true);
  };

  const openTrainingModal = async () => {
    setShowTrainingModal(true);
    await fetchTrainingData(trainingModalGroup, true);
  };

  const refreshDayDetailSilent = async (date: string) => {
    try {
      const res = await fetch(`/api/admin/training/attendance?date=${date}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json() as AttendanceDayDetail;
        setTrainingDayDetail((prev) => prev?.date === date ? { date, loading: false, data } : prev);
      }
    } catch { /* ignore */ }
  };

  const openDayDetail = async (date: string) => {
    setTrainingDayDetail({ date, loading: true, data: null });
    try {
      const res = await fetch(`/api/admin/training/attendance?date=${date}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json() as AttendanceDayDetail;
        setTrainingDayDetail({ date, loading: false, data });
      } else {
        setTrainingDayDetail(null);
      }
    } catch {
      setTrainingDayDetail(null);
    }
  };

  useEffect(() => {
    if (!showTrainingModal) return;

    const es = new EventSource('/api/admin/training/stream');
    es.addEventListener('attendance-update', () => {
      void fetchTrainingData(trainingModalGroup, false);
      const openDate = trainingDayDetailRef.current?.date;
      if (openDate) void refreshDayDetailSilent(openDate);
    });
    return () => es.close();
  }, [showTrainingModal, trainingModalGroup]);

  const fetchQuestions = async (showLoader = true) => {
    if (showLoader) {
      setIsQuestionsLoading(true);
    }

    try {
      const response = await fetch("/api/admin/questions");
      if (response.ok) {
        const data = await response.json();
        setQuestions(data);
      }
    } catch (err) {
      console.error("Error fetching questions:", err);
    } finally {
      if (showLoader) {
        setIsQuestionsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (view === 'members') {
      fetchMembers();
    } else {
      fetchQuestions();
    }
  }, [view]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('training') === '1') {
      const date = params.get('date');
      void (async () => {
        await openTrainingModal();
        if (date) void openDayDetail(date);
      })();
      router.replace('/admin/members');
    }
  }, []);

  useEffect(() => {
    if (view !== "questions") return;

    const eventSource = new EventSource("/api/admin/questions/events");
    eventSource.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string };
        if (payload.type === "questions-updated") {
          await fetchQuestions(false);
        }
      } catch (err) {
        console.error("Admin questions SSE parse error:", err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [view]);

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  };

  const handleDelete = async () => {
    if (!deletingMember) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/members/${deletingMember.id}`, {
        method: "DELETE",
      });
      
      if (response.ok) {
        setMembers(members.filter(m => m.id !== deletingMember.id));
        setDeletingMember(null);
      } else {
        alert("Грешка при изтриване на член.");
      }
    } catch (err) {
      console.error("Error deleting member:", err);
      alert("Грешка при изтриване на член.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!deletingQuestion) return;

    setIsDeletingQuestion(true);
    try {
      const response = await fetch(`/api/admin/questions/${deletingQuestion.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setQuestions(questions.filter((q) => q.id !== deletingQuestion.id));
        setDeletingQuestion(null);
      } else {
        alert("Грешка при изтриване на въпрос.");
      }
    } catch (err) {
      console.error("Error deleting question:", err);
      alert("Грешка при изтриване на въпрос.");
    } finally {
      setIsDeletingQuestion(false);
    }
  };

  const handleViewAnswers = async (question: Question) => {
    setSelectedQuestionAnswers(question);
    setQuestionAnswers([]);
    setIsLoadingAnswers(true);

    try {
      const response = await fetch(`/api/admin/questions/${question.id}/answers`, {
        cache: "no-store",
      });

      if (!response.ok) {
        alert("Грешка при зареждане на отговорите.");
        return;
      }

      const data: { answers: QuestionAnswer[] } = await response.json();
      setQuestionAnswers(data.answers ?? []);
    } catch (err) {
      console.error("Error fetching question answers:", err);
      alert("Грешка при зареждане на отговорите.");
    } finally {
      setIsLoadingAnswers(false);
    }
  };

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredMembers = members.filter((member) => {
    if (!normalizedSearchTerm) return true;

    const fullName = `${member.firstName} ${member.secondName}`.toLowerCase();
    const idMatch = member.id.toLowerCase().includes(normalizedSearchTerm);
    const nameMatch =
      member.firstName.toLowerCase().includes(normalizedSearchTerm) ||
      member.secondName.toLowerCase().includes(normalizedSearchTerm) ||
      fullName.includes(normalizedSearchTerm);
    const cardMatch = member.cards.some((card) =>
      card.cardCode.toLowerCase().includes(normalizedSearchTerm)
    );

    return idMatch || nameMatch || cardMatch;
  });

  return (
    <div className="container p-6 fade-in" style={{ position: 'relative' }}>
      <AdminNotificationBell />
      <div className="flex-col flex items-center text-center mb-8">
        
        <h1 className="text-gold mb-2" style={{ fontSize: '2rem', fontWeight: '600' }}>
          Администраторски панел
        </h1>
      </div>

      <div className="flex justify-center gap-4 mb-8" style={{ flexWrap: "wrap" }}>
        <button
          onClick={() => router.push("/admin/members/add")}
          className="btn btn-primary"
        >
          Добави член
        </button>
        <button
          onClick={() => router.push("/admin/notifications")}
          className="btn btn-primary"
        >
          Изпрати известие
        </button>
        <button
          onClick={() => router.push("/admin/media")}
          className="btn btn-primary"
        >
          Медия библиотека
        </button>
        <button
          onClick={() => router.push("/admin/questions/add")}
          className="btn btn-primary"
        >
          Добави въпрос
        </button>
        <button
          onClick={() => void openTrainingModal()}
          className="btn btn-primary"
        >
          Тренировки
        </button>
        <button 
          onClick={handleLogout}
          className="btn btn-secondary"
        >
          Изход
        </button>
      </div>

      <AdminPushPanel />

      {/* View Toggle Buttons */}
      <div className="flex justify-center gap-4 mb-8">
        <button 
          onClick={() => setView('members')}
          style={{
            background: 'none',
            border: 'none',
            color: view === 'members' ? 'var(--accent-gold)' : 'var(--text-secondary)',
            borderBottom: view === 'members' ? '3px solid var(--accent-gold-color)' : '3px solid transparent',
            fontSize: '18px',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            padding: '12px 24px',
            borderRadius: '8px',
            letterSpacing: '0.5px',
            textShadow: view === 'members' ? '0 0 4px rgba(212, 175, 55, 0.3)' : 'none',
            transform: 'scale(1)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.textShadow = '0 0 6px rgba(212, 175, 55, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.textShadow = view === 'members' ? '0 0 4px rgba(212, 175, 55, 0.3)' : 'none';
          }}
        >
          Членове
        </button>
        <span style={{ 
          color: 'var(--accent-gold-color)', 
          fontSize: '22px', 
          fontWeight: '700', 
          margin: '0 8px',
          verticalAlign: 'middle',
          textShadow: '0 0 6px rgba(212, 175, 55, 0.4)',
          transition: 'all 0.3s ease'
        }}>|</span>
        <button 
          onClick={() => setView('questions')}
          style={{
            background: 'none',
            border: 'none',
            color: view === 'questions' ? 'var(--accent-gold)' : 'var(--text-secondary)',
            borderBottom: view === 'questions' ? '3px solid var(--accent-gold-color)' : '3px solid transparent',
            fontSize: '18px',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            padding: '12px 24px',
            borderRadius: '8px',
            letterSpacing: '0.5px',
            textShadow: view === 'questions' ? '0 0 4px rgba(212, 175, 55, 0.3)' : 'none',
            transform: 'scale(1)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.textShadow = '0 0 6px rgba(212, 175, 55, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.textShadow = view === 'questions' ? '0 0 4px rgba(212, 175, 55, 0.3)' : 'none';
          }}
        >
          Въпроси
        </button>
      </div>

      {/* Members Grid */}
      {view === 'members' && (
        <div className="space-y-6">
          <div className="mb-6 flex justify-center">
            <div style={{ width: "100%", maxWidth: "560px", padding: "20px"}}>
              <div style={{ position: "relative" }}>
              <input
                type="text"
                className="input w-full"
                style={{ paddingRight: "44px" }}
                placeholder="Търси член по име, ID или карта"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchTerm("")}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "28px",
                    height: "28px",
                    borderRadius: "999px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-secondary)",
                    color: "var(--text-secondary)",
                    fontSize: "16px",
                    lineHeight: 1,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  X
                </button>
              )}
            </div>
          </div>
          </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isMembersLoading ? (
            <div
              className="col-span-full flex items-center justify-center"
              style={{ minHeight: "260px" }}
            >
              <div className="loading"></div>
            </div>
          ) : (
            filteredMembers.map((member) => (
            <div key={member.id} className="card">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-gold mb-1" style={{ fontSize: '1.2rem' }}>
                    {member.firstName} {member.secondName}
                  </h3>
                  <p className="text-muted" style={{ fontSize: '0.9rem' }}>ID: {member.id}</p>
                  {member.group && (
                    <span style={{
                      display: 'inline-block',
                      marginTop: '4px',
                      padding: '2px 10px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: member.group === 'ADVANCED' ? '#bbf7d0' : '#bfdbfe',
                      background: member.group === 'ADVANCED' ? 'rgba(22, 101, 52, 0.45)' : 'rgba(30, 64, 175, 0.45)',
                      border: `1px solid ${member.group === 'ADVANCED' ? 'rgba(34, 197, 94, 0.55)' : 'rgba(59, 130, 246, 0.55)'}`,
                    }}>
                      {member.group === 'ADVANCED' ? 'Напреднали' : 'Начинаещи'}
                    </span>
                  )}
                </div>
              </div>

              <div className="visit-info mb-6">
                <div className="visit-item">
                  <span className="visit-number">{member.visitsTotal}</span>
                  <div className="visit-label">Общо</div>
                </div>
                <div className="visit-item">
                  <span className="visit-number">{member.visitsUsed}</span>
                  <div className="visit-label">Използвани</div>
                </div>
                <div className="visit-item">
                  <span className="visit-number text-gold">
                    {member.visitsTotal - member.visitsUsed}
                  </span>
                  <div className="visit-label">Остават</div>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-secondary text-sm mb-2">
                  Карти: {member.cards.length === 0 && <span className="text-muted">няма карти</span>}
                  {member.cards.map((card, idx) => (
                    <span key={card.id} style={{
                      color: card.isActive ? '#4caf50' : '#f44336'
                    }}>
                      {card.cardCode}{idx < member.cards.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </p>
                {member.cards.length > 0 && (
                  <div className="flex gap-4 text-xs text-muted" style={{ marginTop: "8px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ 
                        width: "8px", 
                        height: "8px", 
                        borderRadius: "50%", 
                        backgroundColor: "#4caf50" 
                      }}></span>
                      Активна
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ 
                        width: "8px", 
                        height: "8px", 
                        borderRadius: "50%", 
                        backgroundColor: "#f44336" 
                      }}></span>
                      Неактивна
                    </span>
                  </div>
                )}
                {/* <div className="flex flex-wrap gap-1">
                  {member.cards.map((card) => (
                    <span key={card.id} className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      card.isActive 
                        ? 'bg-green-900 text-green-200' 
                        : 'bg-red-900 text-red-200'
                    }`}>
                      {card.cardCode}: {card.isActive ? 'Активна' : 'Неактивна'}
                    </span>
                  ))}
                </div> */}
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    const activeCard = member.cards.find((card) => card.isActive);
                    if (activeCard) {
                      router.push(`/member/${activeCard.cardCode}`);
                    } else {
                      alert("Този член няма активна карта.");
                    }
                  }}
                  className="btn btn-primary w-full"
                >
                  Виж профил
                </button>
                <button
                  onClick={() => router.push(`/admin/members/${member.id}/edit`)}
                  className="btn btn-secondary w-full"
                >
                  Edit
                </button>
                <button 
                  onClick={() => setDeletingMember(member)}
                  className="btn btn-error w-full"
                >
                  Изтрий член
                </button>
              </div>
            </div>
            ))
          )}
          {!isMembersLoading && filteredMembers.length === 0 && (
            <div className="col-span-full text-center">
              <div className="alert alert-warning">
                <strong>Няма намерени членове</strong>
                <p className="mt-2 mb-0">Все още няма добавени членове в системата.</p>
              </div>
            </div>
          )}
        </div>
        </div>
      )}

      {/* Questions Grid */}
      {view === 'questions' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isQuestionsLoading ? (
            <div
              className="col-span-full flex items-center justify-center"
              style={{ minHeight: "260px" }}
            >
              <div className="loading"></div>
            </div>
          ) : (
            questions.map((question, index) => (
              <div key={question.id || index} className="card">
                <div className="mb-4">
                  <h3 className="text-gold mb-2" style={{ fontSize: '1rem', fontWeight: '600' }}>
                    Въпрос #{questions.length - index}
                  </h3>
                  <p className="text-muted" style={{ fontSize: '0.8rem' }}>
                    {new Date(question.createdAt).toLocaleDateString('bg-BG')}
                  </p>
                  <span
                    style={{
                      display: 'inline-block',
                      marginTop: '8px',
                      padding: '4px 10px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: question.isActive ? '#bbf7d0' : '#fecaca',
                      background: question.isActive ? 'rgba(22, 101, 52, 0.45)' : 'rgba(127, 29, 29, 0.45)',
                      border: `1px solid ${question.isActive ? 'rgba(34, 197, 94, 0.55)' : 'rgba(239, 68, 68, 0.55)'}`,
                    }}
                  >
                    {question.isActive ? 'Активен' : 'Неактивен'}
                  </span>
                </div>
                
                <div style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  padding: '16px',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  lineHeight: '1.4',
                  minHeight: '80px'
                }}>
                  {question.text || question.question}
                </div>

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => handleViewAnswers(question)}
                    className="btn btn-primary w-full"
                  >
                    Виж отговори ({question.answersCount ?? 0})
                  </button>
                  <button
                    onClick={() => router.push(`/admin/questions/${question.id}/edit`)}
                    className="btn btn-secondary w-full"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeletingQuestion(question)}
                    className="btn btn-error w-full"
                  >
                    Изтрий
                  </button>
                </div>
              </div>
            ))
          )}
          {!isQuestionsLoading && questions.length === 0 && (
            <div className="col-span-full text-center">
              <div className="alert alert-warning">
                <strong>Няма намерени въпроси</strong>
                <p className="mt-2 mb-0">Все още няма добавени въпроси в системата.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {deletingMember && (
        <div className="modal-overlay">
          <div className="modal-content fade-in">
            <h3 className="text-gold mb-4">Потвърждение</h3>
            <p className="mb-6">
              Сигурни ли сте, че искате да изтриете член <br />
              <strong>{deletingMember.firstName} {deletingMember.secondName}</strong>?
              <br />
              <span className="text-error" style={{ fontSize: '0.85rem' }}>
                Това действие е необратимо и ще изтрие и свързаната карта.
              </span>
            </p>
            <div className="flex gap-4 justify-center">
              <button 
                onClick={() => setDeletingMember(null)}
                className="btn btn-secondary px-6"
                disabled={isDeleting}
              >
                Отказ
              </button>
              <button 
                onClick={handleDelete}
                className="btn btn-error px-6"
                disabled={isDeleting}
              >
                {isDeleting ? "Изтриване..." : "Изтрий"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingQuestion && (
        <div className="modal-overlay">
          <div className="modal-content fade-in">
            <h3 className="text-gold mb-4">Потвърждение</h3>
            <p className="mb-6">
              Сигурни ли сте, че искате да изтриете този въпрос?
              <br />
              <strong>{deletingQuestion.text || deletingQuestion.question || "Въпрос"}</strong>
              <br />
              <span className="text-error" style={{ fontSize: "0.85rem" }}>
                Това действие е необратимо.
              </span>
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => setDeletingQuestion(null)}
                className="btn btn-secondary px-6"
                disabled={isDeletingQuestion}
              >
                Отказ
              </button>
              <button
                onClick={handleDeleteQuestion}
                className="btn btn-error px-6"
                disabled={isDeletingQuestion}
              >
                {isDeletingQuestion ? "Изтриване..." : "Изтрий"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTrainingModal && (
        <div className="modal-overlay" onClick={() => setShowTrainingModal(false)}>
          <div className="modal-content fade-in" style={{ maxWidth: '520px', width: '100%', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-gold mb-4">Тренировки</h3>

            {/* Group tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', justifyContent: 'center' }}>
              {(['AMATEURS', 'ADVANCED'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => switchTrainingModalGroup(g)}
                  style={{
                    padding: '6px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.2s',
                    background: trainingModalGroup === g ? 'var(--accent-gold-color)' : 'transparent',
                    color: trainingModalGroup === g ? '#000' : 'var(--text-primary)',
                    border: `1px solid ${trainingModalGroup === g ? 'var(--accent-gold-color)' : 'var(--border-color)'}`,
                  }}
                >
                  {g === 'AMATEURS' ? 'Начинаещи' : 'Напреднали'}
                </button>
              ))}
            </div>

            {trainingLoading ? (
              <div className="flex flex-col items-center justify-center" style={{ minHeight: '120px' }}>
                <div className="loading mb-3"></div>
              </div>
            ) : !trainingSchedule ? (
              <div className="alert alert-warning mb-6">Няма настроен график.</div>
            ) : (() => {
                const todayIso = getModalTodayIso()
                const trainingDateSet = new Set(upcomingTrainingDates.map((d) => d.date))
                const weekdayByDate = new Map(upcomingTrainingDates.map((d) => [d.date, d.weekday]))
                const attendanceByDate = new Map(upcomingTrainingDates.map((d) => [d.date, { attending: d.attendingCount, total: d.totalMembers }]))
                const calMonths = buildModalCalendarMonths(todayIso)
                return (
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {upcomingTrainingDates.length === 0 && (
                      <div style={{ fontSize: '13px', opacity: 0.6, marginBottom: '4px' }}>Няма предстоящи тренировки.</div>
                    )}
                    {calMonths.map((month) => (
                      <div key={month.key} style={{
                        border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px',
                        padding: '10px', background: 'rgba(255,255,255,0.02)',
                      }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'rgba(255,255,255,0.95)' }}>
                          {month.label}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '2px', marginBottom: '4px' }}>
                          {MODAL_WEEKDAY_SHORT.map((wd) => (
                            <span key={wd} style={{ textAlign: 'center', fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>{wd}</span>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '2px' }}>
                          {month.cells.map((date, idx) => {
                            if (!date) {
                              return <span key={`e-${idx}`} style={{ aspectRatio: '1/1' }} />
                            }
                            const isPast = date < todayIso
                            const isBeyond = date > month.limitIso
                            const isTraining = trainingDateSet.has(date)
                            const weekday = weekdayByDate.get(date) ?? 0
                            const time = isTraining ? resolveModalTime(date, weekday, trainingSchedule) : null
                            const dayNum = date.slice(8, 10)

                            if (isPast || isBeyond) {
                              return (
                                <span key={date} style={{
                                  aspectRatio: '1/1', borderRadius: '5px', display: 'inline-flex',
                                  alignItems: 'center', justifyContent: 'center',
                                  fontSize: '9px', fontWeight: 700,
                                  color: 'rgba(255,255,255,0.25)',
                                  background: 'rgba(255,255,255,0.02)',
                                  border: '1px solid rgba(255,255,255,0.06)',
                                }}>{dayNum}</span>
                              )
                            }

                            if (isTraining) {
                              const att = attendanceByDate.get(date)
                              return (
                                <button key={date} type="button" onClick={() => void openDayDetail(date)} style={{
                                  aspectRatio: '1/1', borderRadius: '5px', display: 'inline-flex',
                                  flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                  gap: '1px', padding: '2px 1px',
                                  border: '1px solid rgba(212,175,55,0.7)',
                                  background: 'rgba(212,175,55,0.18)',
                                  color: 'var(--accent-gold-color, #d4af37)',
                                  cursor: 'pointer',
                                }}>
                                  <span style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1, color: '#f5d97a' }}>{dayNum}</span>
                                  {time && <span style={{ fontSize: '9px', fontWeight: 700, lineHeight: 1, color: '#ffffff' }}>{time}</span>}
                                  {att && <span style={{ fontSize: '8px', fontWeight: 700, lineHeight: 1, color: 'rgba(255,255,255,0.75)' }}>{att.attending}/{att.total}</span>}
                                </button>
                              )
                            }

                            return (
                              <span key={date} style={{
                                aspectRatio: '1/1', borderRadius: '5px', display: 'inline-flex',
                                alignItems: 'center', justifyContent: 'center',
                                fontSize: '9px', fontWeight: 700,
                                color: 'rgba(255,255,255,0.7)',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                              }}>{dayNum}</span>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}

            <div className="flex gap-4 justify-center" style={{ marginTop: '32px' }}>
              <button
                onClick={() => setShowTrainingModal(false)}
                className="btn btn-secondary px-6"
              >
                Затвори
              </button>
              <button
                onClick={() => { setShowTrainingModal(false); router.push('/admin/training'); }}
                className="btn btn-primary px-6"
              >
                Редактирай
              </button>
            </div>
          </div>
        </div>
      )}

      {trainingDayDetail && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1100 }}
          onClick={() => setTrainingDayDetail(null)}
        >
          <div
            className="modal-content fade-in"
            style={{ maxWidth: '420px', width: '100%', maxHeight: '80vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            {trainingDayDetail.loading ? (
              <div className="flex flex-col items-center justify-center" style={{ minHeight: '120px' }}>
                <div className="loading mb-3"></div>
              </div>
            ) : trainingDayDetail.data ? (() => {
              const d = trainingDayDetail.data;
              const [y, m, day] = d.trainingDate.split('-').map(Number) as [number, number, number];
              const monthName = MODAL_MONTH_NAMES[(m ?? 1) - 1] ?? '';
              const weekdayName = MODAL_WEEKDAY_FULL[(d.weekday ?? 1) - 1] ?? '';
              return (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#f5d97a', marginBottom: '4px' }}>
                      {weekdayName}, {day} {monthName} {y}
                    </div>
                    {d.trainingTime && (
                      <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.75)', marginBottom: '4px' }}>
                        <span style={{ opacity: 0.6 }}>Час </span>{d.trainingTime}
                      </div>
                    )}
                    <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
                      Присъстват: <span style={{ color: '#f5d97a' }}>{d.stats.attending}</span>
                      <span style={{ opacity: 0.5, margin: '0 4px' }}>/</span>
                      <span style={{ opacity: 0.7 }}>{d.stats.total}</span>
                    </div>
                    {d.note && (
                      <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' }}>
                        {d.note}
                      </div>
                    )}
                  </div>

                  <div style={{
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    overflow: 'auto',
                    maxHeight: '340px',
                    background: 'rgba(255,255,255,0.02)',
                  }}>
                    {d.members.map((member, idx) => (
                      <div key={member.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderBottom: idx < d.members.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                      }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                          {member.fullName}
                        </span>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: '999px',
                          color: member.optedOut ? '#ff8f8f' : '#f5d97a',
                          background: member.optedOut ? 'rgba(255,107,107,0.12)' : 'rgba(212,175,55,0.12)',
                          border: `1px solid ${member.optedOut ? 'rgba(255,107,107,0.35)' : 'rgba(212,175,55,0.35)'}`,
                          whiteSpace: 'nowrap',
                        }}>
                          {member.optedOut ? 'Отсъства' : 'Присъства'}
                        </span>
                      </div>
                    ))}
                    {d.members.length === 0 && (
                      <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5, fontSize: '13px' }}>
                        Няма членове.
                      </div>
                    )}
                  </div>

                  <div className="flex justify-center" style={{ marginTop: '20px' }}>
                    <button
                      onClick={() => setTrainingDayDetail(null)}
                      className="btn btn-secondary px-6"
                    >
                      Затвори
                    </button>
                  </div>
                </>
              );
            })() : (
              <div style={{ textAlign: 'center', padding: '20px', opacity: 0.6 }}>
                Грешка при зареждане.
              </div>
            )}
          </div>
        </div>
      )}

      {selectedQuestionAnswers && (
        <div className="modal-overlay">
          <div className="modal-content fade-in" style={{ maxWidth: '600px', maxHeight: '80vh', overflow: 'auto' }}>
            <h3 className="text-gold mb-4">Отговори за въпрос</h3>
            <div className="mb-4" style={{ 
              background: 'var(--bg-secondary)', 
              padding: '16px', 
              borderRadius: '8px',
              border: '1px solid var(--border-color)'
            }}>
              <p style={{ fontSize: '16px', lineHeight: '1.5', color: 'var(--text-primary)' }}>
                {selectedQuestionAnswers.text || selectedQuestionAnswers.question || "Въпрос"}
              </p>
            </div>
            
            <div className="mb-6">
              <h4 style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>
                {questionAnswers.length} отговора:
              </h4>
              
              {isLoadingAnswers ? (
                <div className="flex flex-col items-center justify-center" style={{ minHeight: '140px' }}>
                  <div className="loading mb-3"></div>
                  <p className="text-secondary">Зареждане на отговорите...</p>
                </div>
              ) : questionAnswers.length === 0 ? (
                <div className="alert alert-warning">
                  Все още няма отговори за този въпрос.
                </div>
              ) : (
                <div style={{ 
                  maxHeight: '300px', 
                  overflow: 'auto',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  background: 'var(--bg-secondary)'
                }}>
                  {questionAnswers.map((item: QuestionAnswer, index: number) => (
                    <div key={item.id} style={{ 
                      padding: '12px 16px',
                      borderBottom: index < questionAnswers.length - 1 ? '1px solid var(--border-color)' : 'none',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word'
                    }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--accent-gold-color)' }}>
                        {item.member.firstName && item.member.secondName 
                          ? `${item.member.firstName} ${item.member.secondName}` 
                          : item.member.firstName || item.member.secondName}
                      </div>
                      <div style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>{item.answer}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-center mt-4">
              <button
                onClick={() => setSelectedQuestionAnswers(null)}
                className="btn btn-secondary px-6"
              >
                Затвори
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

