'use client'

import { useState, useEffect, use, useRef, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PushNotificationsPanel } from '@/components/push/PushNotificationsPanel'
import './training-calendar.css'

interface Member {
  id: string
  cardCode: string
  name: string
  visits_total: number
  visits_used: number
  isActive?: boolean
  notifications?: MemberNotification[]
  unread_notifications?: number
}

interface MemberNotification {
  id: string
  type: string
  title: string
  body: string
  url?: string | null
  sentAt: string
  readAt?: string | null
}

interface Question {
  id: string
  text: string
}

interface MemberAnswer {
  questionId: string
  answer: string
}

export default function MemberPage({ params }: { params: Promise<{ cardCode: string }> }) {
  const resolvedParams = use(params)
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean>(false)
  const [isCheckingIn, setIsCheckingIn] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [savingAnswers, setSavingAnswers] = useState<Record<string, boolean>>({})
  const [answerStatus, setAnswerStatus] = useState<Record<string, string>>({})
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)

  // Training states
  interface TrainingDate {
    date: string
    weekday: number
    optedOut: boolean
    optOutReasonCode: string | null
    optOutReasonText: string | null
    trainingTime: string
    note: string
  }
  const [trainingDates, setTrainingDates] = useState<TrainingDate[]>([])
  const [trainingLoading, setTrainingLoading] = useState(false)
  const [trainingOptOutPending, setTrainingOptOutPending] = useState<Record<string, boolean>>({})
  const [trainingDetailsDate, setTrainingDetailsDate] = useState<string | null>(null)

  const [trainingModalOpen, setTrainingModalOpen] = useState(false)

  // Partner Modal States
  const [sportDepotModalOpen, setSportDepotModalOpen] = useState(false)
  const [idbModalOpen, setIdbModalOpen] = useState(false)
  const [nikoModalOpen, setNikoModalOpen] = useState(false)
  const [dalidaModalOpen, setDalidaModalOpen] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [idbCodeCopied, setIdbCodeCopied] = useState(false)
  const [nikoCodeCopied, setNikoCodeCopied] = useState(false)
  const [dalidaCodeCopied, setDalidaCodeCopied] = useState(false)
  const [allDiscountsModalOpen, setAllDiscountsModalOpen] = useState(false)

  const notificationsDropdownRef = useRef<HTMLDivElement | null>(null)
  const hasHandledPushOpenRef = useRef(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const TRAINING_WEEKDAY_SHORT_BG = ['Пон', 'Вт', 'Ср', 'Чет', 'Пет', 'Съб', 'Нед']
  const MONTH_NAMES_BG_FULL = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември']
  const todayDateKey = new Date().toISOString().slice(0, 10)

  function buildTrainingCalendarMonths(dates: TrainingDate[]) {
    const monthMap = new Map<string, { year: number; month: number }>()
    for (const item of dates) {
      const [yearStr, monthStr] = item.date.split('-')
      const year = Number.parseInt(yearStr ?? '', 10)
      const month = Number.parseInt(monthStr ?? '', 10)
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) continue
      monthMap.set(`${year}-${month}`, { year, month })
    }
    return [...monthMap.values()]
      .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year))
      .map(({ year, month }) => {
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
        const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
        const leadingEmptyDays = (firstWeekday + 6) % 7
        const cells: Array<string | null> = Array.from({ length: leadingEmptyDays }, () => null)
        for (let day = 1; day <= daysInMonth; day += 1) {
          cells.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
        }
        while (cells.length % 7 !== 0) cells.push(null)
        return { key: `${year}-${month}`, label: `${MONTH_NAMES_BG_FULL[month - 1] ?? ''} ${year}`, cells }
      })
  }

  const fetchTraining = async (cardCode: string) => {
    try {
      const res = await fetch(`/api/members/${cardCode}/training`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json() as { dates?: TrainingDate[] }
        setTrainingDates(data.dates ?? [])
      }
    } catch (err) {
      console.error('Training fetch error:', err)
    }
  }

  const refreshQuestions = async () => {
    try {
      const questionsRes = await fetch('/api/questions', { cache: 'no-store' })
      if (questionsRes.ok) {
        const questionsData: Question[] = await questionsRes.json()
        setQuestions(questionsData)
      }
    } catch (err) {
      console.error('Questions refresh error:', err)
    }
  }

  const fetchMember = async (cardCode: string, shouldSetLoading = false) => {
    if (shouldSetLoading) {
      setLoading(true)
    }

    try {
      const memberRes = await fetch(`/api/members/${cardCode}`, { cache: 'no-store' })
      if (memberRes.ok) {
        const data = await memberRes.json()
        setMember(data)
        setError(null)
      } else if (memberRes.status === 404) {
        setMember(null)
        setError(null)
      } else {
        setMember(null)
        setError('Грешка при зареждане на потребителя')
      }
    } catch (err) {
      console.error('Error fetching member:', err)
      setMember(null)
      setError('Грешка при зареждане на потребителя')
    } finally {
      if (shouldSetLoading) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const sessionRes = await fetch('/api/admin/check-session')
        const sessionData = await sessionRes.json()
        const isAdminRole = sessionData.role === 'ADMIN'
        setIsAdmin(isAdminRole)

        if (!isAdminRole) {
          const answersRes = await fetch(`/api/members/${resolvedParams.cardCode}/answers`, { cache: 'no-store' })
          await refreshQuestions()

          if (answersRes.ok) {
            const answersData: { answers: MemberAnswer[] } = await answersRes.json()
            const answersMap = Object.fromEntries(
              answersData.answers.map((item) => [item.questionId, item.answer])
            ) as Record<string, string>
            setAnswers(answersMap)
          }
        } else {
          setQuestions([])
          setAnswers({})
          setAnswerStatus({})
        }

        await fetchMember(resolvedParams.cardCode, true)
        if (!isAdminRole) {
          setTrainingLoading(true)
          await fetchTraining(resolvedParams.cardCode)
          setTrainingLoading(false)
        }
      } catch (err) {
        console.error('Error fetching data:', err)
      }
    }

    fetchData()
  }, [resolvedParams.cardCode])

  useEffect(() => {
    const eventSource = new EventSource(`/api/members/${resolvedParams.cardCode}/events`)

    eventSource.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string }
        if (
          payload.type === 'check-in' ||
          payload.type === 'reset' ||
          payload.type === 'notification-created'
        ) {
          await fetchMember(resolvedParams.cardCode)
        }
        if (payload.type === 'training-updated' && !isAdmin) {
          await fetchTraining(resolvedParams.cardCode)
        }
        if ((payload.type === 'questions-updated' || payload.type === 'question-created') && !isAdmin) {
          await refreshQuestions()
        }
      } catch (err) {
        console.error('SSE parse error:', err)
      }
    }

    return () => {
      eventSource.close()
    }
  }, [resolvedParams.cardCode, isAdmin])

  useEffect(() => {
    if (isAdmin) return

    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'questions_updated_at') return
      void refreshQuestions()
    }

    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [isAdmin])

  useEffect(() => {
    if (isAdmin) return

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchMember(resolvedParams.cardCode)
        void refreshQuestions()
      }
    }

    const onFocus = () => {
      void fetchMember(resolvedParams.cardCode)
      void refreshQuestions()
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [isAdmin])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (
        isNotificationsOpen &&
        notificationsDropdownRef.current &&
        !notificationsDropdownRef.current.contains(event.target as Node)
      ) {
        setIsNotificationsOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [isNotificationsOpen])

  const remaining = member ? member.visits_total - member.visits_used : 0
  const isExhausted = member ? remaining <= 0 : false
  const unreadCount = Number(member?.unread_notifications ?? 0)
  const formatNotificationTime = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return value
    }

    return new Intl.DateTimeFormat('bg-BG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date)
  }

  const markNotificationsAsRead = useCallback(async () => {
    if (!member || !member.unread_notifications || member.unread_notifications <= 0) return

    try {
      await fetch(`/api/members/${resolvedParams.cardCode}/notifications/read`, {
        method: 'POST',
      })
      setMember((prev) => {
        if (!prev) return prev
        const nowIso = new Date().toISOString()
        return {
          ...prev,
          unread_notifications: 0,
          notifications: prev.notifications?.map((notification) =>
            notification.readAt ? notification : { ...notification, readAt: nowIso }
          ),
        }
      })
    } catch (err) {
      console.error('Mark notifications read error:', err)
    }
  }, [member, resolvedParams.cardCode])

  useEffect(() => {
    const shouldAutoOpenNotifications =
      searchParams.get('openNotifications') === '1' && searchParams.get('source') === 'push'

    if (!shouldAutoOpenNotifications || !member || isAdmin) {
      hasHandledPushOpenRef.current = false
      return
    }

    if (hasHandledPushOpenRef.current) return
    hasHandledPushOpenRef.current = true

    setIsNotificationsOpen(true)
    void markNotificationsAsRead()

    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete('openNotifications')
    nextParams.delete('source')
    const nextQuery = nextParams.toString()
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
  }, [searchParams, member, isAdmin, pathname, router, markNotificationsAsRead])

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  const handleSaveAnswer = async (questionId: string) => {
    const currentAnswer = (answers[questionId] ?? '').trim()
    if (!currentAnswer) {
      setAnswerStatus((prev) => ({ ...prev, [questionId]: 'Моля, въведете отговор.' }))
      return
    }

    setSavingAnswers((prev) => ({ ...prev, [questionId]: true }))
    setAnswerStatus((prev) => ({ ...prev, [questionId]: '' }))

    try {
      const response = await fetch(`/api/members/${resolvedParams.cardCode}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId,
          answer: currentAnswer,
        }),
      })

      if (response.ok) {
        setAnswerStatus((prev) => ({ ...prev, [questionId]: 'Запазено.' }))
      } else {
        setAnswerStatus((prev) => ({ ...prev, [questionId]: 'Грешка при запазване.' }))
      }
    } catch (err) {
      console.error('Save answer error:', err)
      setAnswerStatus((prev) => ({ ...prev, [questionId]: 'Грешка при запазване.' }))
    } finally {
      setSavingAnswers((prev) => ({ ...prev, [questionId]: false }))
    }
  }

  const handleTrainingOptOut = async (date: string) => {
    setTrainingOptOutPending((prev) => ({ ...prev, [date]: true }))
    try {
      const res = await fetch(`/api/members/${resolvedParams.cardCode}/training`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainingDate: date, reasonCode: 'sick' }),
      })
      if (res.ok) {
        await fetchTraining(resolvedParams.cardCode)
        setTrainingDetailsDate(null)
      }
    } catch (err) {
      console.error('Training opt-out error:', err)
    } finally {
      setTrainingOptOutPending((prev) => ({ ...prev, [date]: false }))
    }
  }

  const handleTrainingOptIn = async (date: string) => {
    setTrainingOptOutPending((prev) => ({ ...prev, [date]: true }))
    try {
      const res = await fetch(`/api/members/${resolvedParams.cardCode}/training`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainingDate: date }),
      })
      if (res.ok) {
        await fetchTraining(resolvedParams.cardCode)
        setTrainingDetailsDate(null)
      }
    } catch (err) {
      console.error('Training opt-in error:', err)
    } finally {
      setTrainingOptOutPending((prev) => ({ ...prev, [date]: false }))
    }
  }

  const handleCheckIn = async () => {
    if (!member || isExhausted || isCheckingIn) return

    setIsCheckingIn(true)
    try {
      const response = await fetch(`/api/members/${resolvedParams.cardCode}/check-in`, {
        method: 'POST',
      })

      if (response.ok) {
        const updatedMember = await response.json()
        setMember(updatedMember)
      } else {
        setError('Грешка при чекиране')
      }
    } catch (err) {
      console.error('Check-in error:', err)
      setError('Грешка при чекиране')
    } finally {
      setIsCheckingIn(false)
    }
  }

  const handleReset = async () => {
    if (!member || !isExhausted) return

    try {
      const response = await fetch(`/api/members/${resolvedParams.cardCode}/reset`, {
        method: 'POST',
      })

      if (response.ok) {
        const updatedMember = await response.json()
        setMember(updatedMember)
      } else {
        setError('Грешка при нулиране')
      }
    } catch (err) {
      console.error('Reset error:', err)
      setError('Грешка при нулиране')
    }
  }

  const handleAdminLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' })
      setIsAdmin(false)
    } catch (err) {
      console.error('Logout error:', err)
      setIsAdmin(false)
    }
  }

  const handleGoToAdmin = () => {
    router.push('/admin/members')
  }

  const handleGoToLogin = () => {
    router.push(`/admin/login?memberCardCode=${encodeURIComponent(resolvedParams.cardCode)}`)
  }

  if (loading) {
    return (
      <div className="container flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="text-center">
          <div className="loading mb-4"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="alert alert-error">
          <h3 className="mb-2">Грешка</h3>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container flex flex-col items-center justify-center fade-in" style={{ minHeight: '100vh' }}>
      {!isAdmin && (
        <div className="flex justify-center mb-4" style={{ maxWidth: '420px', width: '100%' }}>
          <button
            onClick={handleGoToLogin}
            className="btn btn-secondary px-6"
            style={{ cursor: 'pointer' }}
          >
            Админ вход
          </button>
        </div>
      )}

      {isAdmin && member && (
        <div className="flex justify-center mb-4" style={{ maxWidth: '420px', width: '100%' }}>
          <button
            onClick={handleGoToAdmin}
            className="btn btn-secondary px-6"
            style={{ cursor: 'pointer' }}
          >
            ← Админ панел
          </button>
        </div>
      )}

      <div className="member-card" style={{ maxWidth: '420px', width: '100%' }}>
        {member && !isAdmin && (
          <div ref={notificationsDropdownRef} style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => {
                setIsNotificationsOpen((prev) => {
                  const next = !prev
                  if (next) {
                    void markNotificationsAsRead()
                  }
                  return next
                })
              }}
              aria-label="Toggle notifications"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '999px',
                padding: 0,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '10px',
                cursor: 'pointer',
                border: 'none',
                background: 'var(--accent-gold-color)',
                color: '#fff',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 4.5C9.51472 4.5 7.5 6.51472 7.5 9V12.2143C7.5 13.1375 7.18026 14.0322 6.59512 14.7462L5.5 16.0833H18.5L17.4049 14.7462C16.8197 14.0322 16.5 13.1375 16.5 12.2143V9C16.5 6.51472 14.4853 4.5 12 4.5Z"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="18" r="1.2" fill="#FFFFFF" />
              </svg>
              {unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-3px',
                    minWidth: '18px',
                    height: '18px',
                    borderRadius: '999px',
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    border: '1px solid rgba(0,0,0,0.25)',
                  }}
                >
                  {Math.min(unreadCount, 99)}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '50px',
                  right: 0,
                  width: '320px',
                  maxWidth: '100%',
                  maxHeight: '300px',
                  overflow: 'auto',
                  zIndex: 20,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
                  padding: '12px',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: 'var(--accent-gold-color)' }}>
                  Известия
                </div>
                {member.notifications && member.notifications.length > 0 ? (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {member.notifications.map((notification) => (
                      <div
                        key={notification.id}
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          padding: '8px',
                          background: 'rgba(255,255,255,0.02)'
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '13px' }}>{notification.title}</div>
                        <div style={{ fontSize: '12px', opacity: 0.95 }}>{notification.body}</div>
                        <div style={{ fontSize: '10px', opacity: 0.75, marginTop: '6px' }}>
                          {formatNotificationTime(notification.sentAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', opacity: 0.75 }}>
                    Няма скорошни известия
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="text-center mb-6">
          <img
            src="/logo.png"
            alt="Logo"
            className="mb-3 mx-auto"
            style={{ width: '100px', height: '100px', objectFit: 'contain' }}
          />
          <h1 className="member-name">{member ? member.name : 'Не е намерен потребител'}</h1>
          {member?.isActive === false && (
            <div className="badge badge-warning mb-2">Активиране на карта...</div>
          )}
        </div>

        {member && (
          <div className="visit-info mb-6">
            <div className="visit-item">
              <span className="visit-number">{member.visits_total}</span>
              <div className="visit-label">Общо</div>
            </div>
            <div className="visit-item">
              <span className="visit-number">{member.visits_used}</span>
              <div className="visit-label">Използвани</div>
            </div>
            <div className="visit-item">
              <span className={`visit-number ${isExhausted ? 'text-error' : 'text-gold'}`}>
                {remaining}
              </span>
              <div className="visit-label">Остават</div>
            </div>
          </div>
        )}

        {member && isExhausted && (
          <div className="alert alert-warning mb-6">
            <strong>Картата е изчерпана</strong>
            <p className="mt-2 mb-0">Няма оставащи посещения. Моля, свържете се с администратор.</p>
          </div>
        )}

        {member && !isAdmin && (
          <PushNotificationsPanel cardCode={resolvedParams.cardCode} />
        )}

        {/* Partner Discount Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px', width: '100%' }}>
          {/* Sport Depot */}
          <button
            className="sd-discount-btn"
            style={{ marginTop: 0 }}
            onClick={() => setSportDepotModalOpen(true)}
            type="button"
            aria-label="Absolute Teamsport отстъпка"
          >
            <div className="sd-discount-logo-wrap">
              <img src="/sd-logo.png" alt="Sport Depot" className="sd-discount-logo" />
            </div>
            <span className="sd-discount-label">Sport Depot</span>
            <span className="sd-discount-badge">-10%</span>
          </button>

          <button 
            onClick={() => setAllDiscountsModalOpen(true)} 
            style={{ 
              background: "rgba(255,255,255,0.05)", 
              border: "1px solid rgba(255,255,255,0.1)", 
              color: "rgba(255,255,255,0.8)", 
              padding: "12px", 
              borderRadius: "10px", 
              marginTop: "2px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
              transition: "all 0.2s ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              e.currentTarget.style.transform = "scale(1.01)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            Виж всички оферти
          </button>
        </div>

        {member && !isAdmin && questions.length > 0 && (
          <div className="mb-6" style={{
            background: 'var(--bg-secondary)',
            borderRadius: '8px',
            padding: '16px',
            border: '1px solid var(--border-color)',
            maxHeight: '50vh',
            overflow: 'auto'
          }}>
            <h3 style={{
              fontSize: '1rem',
              fontWeight: '600',
              marginBottom: '12px',
              color: 'var(--accent-gold-color)'
            }}>
              Въпроси:
            </h3>
            <div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <div className="loading mb-4"></div>
                </div>
              ) : (
                questions.map((question, index) => {
                  if (index % 2 === 0 && index > 0) {
                    return (
                      <div key={question.id} style={{
                        marginBottom: '12px',
                        paddingBottom: '12px',
                        borderBottom: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        lineHeight: '1.4'
                      }}>
                        <div style={{ marginBottom: '8px' }}>{question.text}</div>
                        <textarea
                          value={answers[question.id] ?? ''}
                          onChange={(event) => handleAnswerChange(question.id, event.target.value)}
                          placeholder="Вашият отговор"
                          style={{
                            width: '100%',
                            minHeight: '80px',
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            padding: '8px 10px',
                            color: 'var(--text-primary)',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            fontSize: '14px',
                            lineHeight: '1.4'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveAnswer(question.id)}
                          disabled={savingAnswers[question.id] === true}
                          className="btn btn-secondary"
                          style={{
                            marginTop: '8px',
                            cursor: savingAnswers[question.id] ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {savingAnswers[question.id] ? 'Saving...' : 'Запази'}
                        </button>
                        {answerStatus[question.id] && (
                          <div style={{ marginTop: '6px', fontSize: '12px', opacity: 0.85 }}>
                            {answerStatus[question.id]}
                          </div>
                        )}
                      </div>
                    );
                  } else if (index === questions.length - 1) {
                    return (
                      <div key={question.id} style={{
                        marginBottom: '0',
                        paddingBottom: '0',
                        borderBottom: 'none',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        lineHeight: '1.4'
                      }}>
                        <div style={{ marginBottom: '8px' }}>{question.text}</div>
                        <textarea
                          value={answers[question.id] ?? ''}
                          onChange={(event) => handleAnswerChange(question.id, event.target.value)}
                          placeholder="Вашият отговор"
                          style={{
                            width: '100%',
                            minHeight: '80px',
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            padding: '8px 10px',
                            color: 'var(--text-primary)',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            fontSize: '14px',
                            lineHeight: '1.4'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveAnswer(question.id)}
                          disabled={savingAnswers[question.id] === true}
                          className="btn btn-secondary"
                          style={{
                            marginTop: '8px',
                            cursor: savingAnswers[question.id] ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {savingAnswers[question.id] ? 'Saving...' : 'Запази'}
                        </button>
                        {answerStatus[question.id] && (
                          <div style={{ marginTop: '6px', fontSize: '12px', opacity: 0.85 }}>
                            {answerStatus[question.id]}
                          </div>
                        )}
                      </div>
                    );
                  } else {
                    return (
                      <div key={question.id} style={{
                        marginBottom: '12px',
                        paddingBottom: '12px',
                        borderBottom: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        lineHeight: '1.4'
                      }}>
                        <div style={{ marginBottom: '8px' }}>{question.text}</div>
                        <textarea
                          value={answers[question.id] ?? ''}
                          onChange={(event) => handleAnswerChange(question.id, event.target.value)}
                          placeholder="Вашият отговор"
                          style={{
                            width: '100%',
                            minHeight: '80px',
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            padding: '8px 10px',
                            color: 'var(--text-primary)',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            fontSize: '14px',
                            lineHeight: '1.4'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveAnswer(question.id)}
                          disabled={savingAnswers[question.id] === true}
                          className="btn btn-secondary"
                          style={{
                            marginTop: '8px',
                            cursor: savingAnswers[question.id] ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {savingAnswers[question.id] ? 'Saving...' : 'Запази'}
                        </button>
                        {answerStatus[question.id] && (
                          <div style={{ marginTop: '6px', fontSize: '12px', opacity: 0.85 }}>
                            {answerStatus[question.id]}
                          </div>
                        )}
                      </div>
                    );
                  }
                })
              )}
            </div>
          </div>
        )}



        {member && !isAdmin && (
          <button
            type="button"
            onClick={() => setTrainingModalOpen(true)}
            className="btn btn-primary w-full mb-6"
            style={{ cursor: 'pointer', marginTop: '32px' }}
          >
            Тренировки
          </button>
        )}

        {isAdmin && member && (
          <div className="space-y-4 mb-6">
            <button
              onClick={handleCheckIn}
              disabled={isExhausted || isCheckingIn}
              className="btn btn-primary w-full"
              style={{
                cursor: (isExhausted || isCheckingIn) ? 'not-allowed' : 'pointer',
                opacity: isCheckingIn ? 0.7 : 1,
              }}
            >
              {isCheckingIn ? 'Checking In...' : 'Check In'}
            </button>
            <button
              onClick={handleReset}
              disabled={!isExhausted}
              className="btn btn-outline w-full"
              style={{
                cursor: !isExhausted ? 'not-allowed' : 'pointer',
                border: '1px solid var(--gold)',
                color: 'var(--gold)',
                background: 'transparent',
                padding: '0.75rem',
                borderRadius: 'var(--radius)',
                opacity: !isExhausted ? 0.5 : 1,
              }}
            >
              Reset
            </button>
          </div>
        )}

        {isAdmin && (
          <button
            onClick={handleAdminLogout}
            className="btn btn-secondary w-full mb-6"
            style={{ cursor: 'pointer' }}
          >
            Изход от администраторски режим
          </button>
        )}
      </div>

      {/* Training modal */}
      {trainingModalOpen && (
        <div className="modal-overlay" onClick={() => { setTrainingModalOpen(false); setTrainingDetailsDate(null) }}>
          <div className="modal-content fade-in" style={{ maxWidth: '420px', maxHeight: '85vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 className="text-gold" style={{ margin: 0 }}>Тренировъчен график</h3>
              <button
                type="button"
                onClick={() => { setTrainingModalOpen(false); setTrainingDetailsDate(null) }}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '4px',
                }}
                aria-label="Затвори"
              >×</button>
            </div>

            {trainingLoading ? (
              <div style={{ textAlign: 'center', padding: '24px' }}><div className="loading" /></div>
            ) : trainingDates.length === 0 ? (
              <p className="training-empty">Няма настроени тренировъчни дни.</p>
            ) : (() => {
              const trainingByDate = new Map(trainingDates.map((td) => [td.date, td]))
              const calendarMonths = buildTrainingCalendarMonths(trainingDates)
              return (
                <>
                  <div className="training-calendar">
                    {calendarMonths.map((month) => (
                      <section key={month.key} className="training-calendar-month">
                        <h4 className="training-calendar-month-title">{month.label}</h4>
                        <div className="training-calendar-weekdays">
                          {TRAINING_WEEKDAY_SHORT_BG.map((wd) => (
                            <span key={`${month.key}-${wd}`} className="training-calendar-weekday">{wd}</span>
                          ))}
                        </div>
                        <div className="training-calendar-grid">
                          {month.cells.map((cellDate, index) => {
                            if (!cellDate) {
                              return <span key={`${month.key}-empty-${index}`} className="training-calendar-cell training-calendar-cell--empty" aria-hidden="true" />
                            }
                            const td = trainingByDate.get(cellDate)
                            const dayNumber = cellDate.slice(8, 10)
                            const isToday = cellDate === todayDateKey
                            if (!td) {
                              return (
                                <span key={cellDate} className={`training-calendar-cell training-calendar-cell--off${isToday ? ' training-calendar-cell--today' : ''}`}>
                                  <span className="training-calendar-day-number">{dayNumber}</span>
                                </span>
                              )
                            }
                            const isSaving = trainingOptOutPending[cellDate] === true
                            return (
                              <button
                                key={cellDate}
                                type="button"
                                className={`training-calendar-cell training-calendar-cell--training${td.optedOut ? ' training-calendar-cell--opted-out' : ''}${isToday ? ' training-calendar-cell--today' : ''}`}
                                onClick={() => setTrainingDetailsDate(cellDate === trainingDetailsDate ? null : cellDate)}
                                disabled={isSaving}
                              >
                                <span className="training-calendar-day-number">{dayNumber}</span>
                                {td.trainingTime && <span className="training-calendar-time">{td.trainingTime}</span>}
                                {isSaving && <span className="training-calendar-mark">...</span>}
                              </button>
                            )
                          })}
                        </div>
                      </section>
                    ))}
                  </div>

                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Training day action modal */}
      {trainingModalOpen && trainingDetailsDate && (() => {
        const td = trainingDates.find((d) => d.date === trainingDetailsDate) ?? null
        if (!td) return null
        const isPending = trainingOptOutPending[trainingDetailsDate] === true
        return (
          <div
            className="modal-overlay"
            style={{ zIndex: 1100 }}
            onClick={() => setTrainingDetailsDate(null)}
          >
            <div
              className="modal-content fade-in"
              style={{ maxWidth: '300px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: '#fff' }}>
                    {new Date(`${td.date}T12:00:00.000Z`).toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </div>
                  {td.trainingTime && (
                    <div style={{ fontSize: '13px', opacity: 0.75, marginTop: '2px' }}>
                      <span style={{ opacity: 0.6 }}>Час </span>{td.trainingTime}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setTrainingDetailsDate(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '4px' }}
                  aria-label="Затвори"
                >×</button>
              </div>
              {td.note && (
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.4 }}>{td.note}</p>
              )}
              {td.optedOut ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleTrainingOptIn(td.date)}
                  style={{
                    width: '100%', padding: '10px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                    background: 'rgba(212,175,55,0.18)', border: '1px solid rgba(212,175,55,0.55)',
                    color: 'var(--accent-gold-color, #d4af37)', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.6 : 1,
                  }}
                >
                  {isPending ? 'Запазване...' : 'Присъствам'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleTrainingOptOut(td.date)}
                  style={{
                    width: '100%', padding: '10px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                    background: 'rgba(255,107,107,0.15)', border: '1px solid rgba(255,107,107,0.4)',
                    color: '#ff8f8f', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.6 : 1,
                  }}
                >
                  {isPending ? 'Запазване...' : 'Отсъствам'}
                </button>
              )}
            </div>
          </div>
        )
      })()}

      {/* Sport Depot discount modal */}
      {sportDepotModalOpen && (
        <div className="sd-overlay" onClick={() => setSportDepotModalOpen(false)}>
          <div className="sd-modal" onClick={(e) => e.stopPropagation()}>
            <button className="sd-modal-close" onClick={() => setSportDepotModalOpen(false)} aria-label="Затвори">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>

            <div className="sd-modal-header">
              <img src="/sd-logo.png" alt="Absolute Teamsport" className="sd-modal-logo" />
              <div className="sd-modal-title-wrap">
                <p className="sd-modal-eyebrow" style={{ color: "rgba(224, 53, 53, 0.9)" }}>Партньорска програма</p>
                <h2 className="sd-modal-title">Вашата клубна отстъпка</h2>
              </div>
            </div>

            <div className="sd-modal-divider" style={{ background: "linear-gradient(to right, transparent, rgba(224, 53, 53, 0.3), transparent)" }} />

            <div className="sd-highlights">
              <div className="sd-highlight">
                <span className="sd-highlight-value" style={{ color: "#f44336" }}>-10%</span>
                <span className="sd-highlight-label">на редовна цена</span>
              </div>
              <div className="sd-highlight" style={{ background: "rgba(200, 30, 30, 0.1)", borderColor: "rgba(200, 30, 30, 0.28)" }}>
                <span className="sd-highlight-value" style={{ color: "#f87171" }}>-5%</span>
                <span className="sd-highlight-label">на намалени (онлайн)</span>
              </div>
            </div>

            <button
              className={`sd-code-row${codeCopied ? " sd-code-row--copied" : ""}`}
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText("ATS_MYTEAM").then(() => {
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 2000);
                });
              }}
              aria-label="Копирай код ATS_MYTEAM"
            >
              <span className="sd-code-lbl">{codeCopied ? "Копирано!" : "Код:"}</span>
              <span className="sd-code">{codeCopied ? "✓" : "ATS_MYTEAM"}</span>
              {!codeCopied && (
                <svg className="sd-copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
            <p className="sd-validity">Валиден: 2026</p>

            <div className="sd-qr-wrap">
              <img src="/QR.png" alt="QR код за отстъпка" className="sd-qr" />
              <p className="sd-qr-hint">Покажи QR кода на касата или въведи кода онлайн на{" "}<a href="https://www.absolute-teamsport.bg" target="_blank" rel="noopener noreferrer" className="sd-store-link">absolute-teamsport.bg</a></p>
            </div>

            <div className="sd-modal-divider" style={{ background: "linear-gradient(to right, transparent, rgba(224, 53, 53, 0.3), transparent)" }} />

            <div className="sd-terms">
              <p className="sd-terms-title">Условия</p>
              <ul className="sd-terms-list">
                <li>Важи в магазини <strong>ABSOLUTE TEAMSPORT</strong> и онлайн</li>
                <li>Не може да се комбинира с промоции или ваучери</li>
                <li>Не важи за артикули на ПФК „Левски", външни артикули с удължен срок и ваучери за подарък</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Innline Dragon Body discount modal */}
      {idbModalOpen && (
        <div className="sd-overlay" onClick={() => setIdbModalOpen(false)}>
          <div className="idb-modal" onClick={(e) => e.stopPropagation()}>
            <button className="sd-modal-close" onClick={() => setIdbModalOpen(false)} aria-label="Затвори">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>

            <div className="sd-modal-header" style={{ marginBottom: "16px" }}>
              <img src="/idb-logo.svg" alt="Innline Dragon Body" className="sd-modal-logo" style={{ transform: "scale(1.2)" }} />
              <div className="sd-modal-title-wrap">
                <p className="sd-modal-eyebrow" style={{ color: "#eab126" }}>Партньорска програма</p>
                <h2 className="sd-modal-title">Innline Dragon Body</h2>
              </div>
            </div>

            <div className="sd-modal-divider" style={{ background: "linear-gradient(to right, transparent, rgba(234, 177, 38, 0.3), transparent)" }} />

            <div className="sd-highlights">
              <div className="idb-highlight">
                <span className="idb-highlight-value">-10%</span>
                <span className="sd-highlight-label">на всички процедури</span>
              </div>
              <div className="idb-highlight" style={{ background: "rgba(234, 177, 38, 0.05)", borderColor: "rgba(234, 177, 38, 0.15)" }}>
                <span className="idb-highlight-value" style={{ opacity: 0.8 }}>-5%</span>
                <span className="sd-highlight-label">за втори пакет</span>
              </div>
            </div>

            <button
              className={`sd-code-row${idbCodeCopied ? " sd-code-row--copied" : ""}`}
              style={idbCodeCopied ? { borderColor: "#eab126", background: "rgba(234, 177, 38, 0.12)" } : {}}
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText("IDB_MYTEAM").then(() => {
                  setIdbCodeCopied(true);
                  setTimeout(() => setIdbCodeCopied(false), 2000);
                });
              }}
            >
              <span className="sd-code-lbl" style={idbCodeCopied ? { color: "#eab126" } : {}}>{idbCodeCopied ? "Копирано!" : "Код:"}</span>
              <span className="idb-code" style={{ color: "#eab126" }}>{idbCodeCopied ? "✓" : "IDB_MYTEAM"}</span>
              {!idbCodeCopied && (
                <svg className="sd-copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              )}
            </button>
            <p className="sd-validity">Валиден: 2026</p>

            <div className="sd-qr-wrap">
              <p className="sd-qr-hint">Посетете ги онлайн на{" "}<a href="https://innlinedragonbody.com" target="_blank" rel="noopener noreferrer" className="sd-store-link" style={{ color: "#eab126" }}>innlinedragonbody.com</a></p>
            </div>

            <div className="sd-modal-divider" style={{ background: "linear-gradient(to right, transparent, rgba(234, 177, 38, 0.3), transparent)" }} />

            <div className="sd-terms">
              <p className="sd-terms-title">Условия</p>
              <ul className="sd-terms-list">
                <li>Важи за всички услуги на <strong>Innline Dragon Body</strong></li>
                <li>Не може да се комбинира с други активни промоции</li>
                <li>Важи при представяне на промоционалния код на място</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Mebeli Niko discount modal */}
      {nikoModalOpen && (
        <div className="sd-overlay" onClick={() => setNikoModalOpen(false)}>
          <div className="niko-modal" onClick={(e) => e.stopPropagation()}>
            <button className="sd-modal-close" onClick={() => setNikoModalOpen(false)} aria-label="Затвори">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>

            <div className="sd-modal-header" style={{ marginBottom: "16px" }}>
              <img src="/niko-logo.png" alt="Mebeli Niko" className="sd-modal-logo" />
              <div className="sd-modal-title-wrap">
                <p className="sd-modal-eyebrow" style={{ color: "#0054a6" }}>Партньорска програма</p>
                <h2 className="sd-modal-title">Мебели NIKO</h2>
              </div>
            </div>

            <div className="sd-modal-divider" style={{ background: "linear-gradient(to right, transparent, rgba(0, 84, 166, 0.3), transparent)" }} />

            <div className="sd-highlights">
              <div className="niko-highlight">
                <span className="niko-highlight-value" style={{ color: "#3b82f6" }}>-10%</span>
                <span className="sd-highlight-label">на редовна цена</span>
              </div>
              <div className="niko-highlight" style={{ background: "rgba(0, 84, 166, 0.08)", borderColor: "rgba(0, 84, 166, 0.2)" }}>
                <span className="niko-highlight-value" style={{ color: "#93c5fd", opacity: 0.8 }}>-5%</span>
                <span className="sd-highlight-label">на специални артикули</span>
              </div>
            </div>

            <button
              className={`sd-code-row${nikoCodeCopied ? " sd-code-row--copied" : ""}`}
              style={nikoCodeCopied ? { borderColor: "#0054a6", background: "rgba(0, 84, 166, 0.12)" } : {}}
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText("NIKO_MYTEAM").then(() => {
                  setNikoCodeCopied(true);
                  setTimeout(() => setNikoCodeCopied(false), 2000);
                });
              }}
            >
              <span className="sd-code-lbl" style={nikoCodeCopied ? { color: "#0054a6" } : {}}>{nikoCodeCopied ? "Копирано!" : "Код:"}</span>
              <span className="niko-code" style={{ color: "#3b82f6" }}>{nikoCodeCopied ? "✓" : "NIKO_MYTEAM"}</span>
              {!nikoCodeCopied && (
                <svg className="sd-copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              )}
            </button>
            <p className="sd-validity">Валиден: 2026</p>

            <div className="sd-qr-wrap">
              <p className="sd-qr-hint">Разгледайте каталога им на{" "}<a href="https://mebeliniko.bg" target="_blank" rel="noopener noreferrer" className="sd-store-link" style={{ color: "#3b82f6" }}>mebeliniko.bg</a></p>
            </div>

            <div className="sd-modal-divider" style={{ background: "linear-gradient(to right, transparent, rgba(0, 84, 166, 0.3), transparent)" }} />

            <div className="sd-terms">
              <p className="sd-terms-title">Условия</p>
              <ul className="sd-terms-list">
                <li>Важи за всички налични артикули в <strong>Мебели NIKO</strong></li>
                <li>Не може да се комбинира с други талони или отстъпки</li>
                <li>Прилага се при поръчка онлайн или в шоурум</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Dalida Dance discount modal */}
      {dalidaModalOpen && (
        <div className="sd-overlay" onClick={() => setDalidaModalOpen(false)}>
          <div className="dalida-modal" onClick={(e) => e.stopPropagation()}>
            <button className="sd-modal-close" onClick={() => setDalidaModalOpen(false)} aria-label="Затвори">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>

            <div className="sd-modal-header" style={{ marginBottom: "16px" }}>
              <img src="/logo.png" alt="Dalida Dance" className="sd-modal-logo" style={{ transform: "scale(1.2)" }} />
              <div className="sd-modal-title-wrap">
                <p className="sd-modal-eyebrow" style={{ color: "var(--accent-gold-color)" }}>Партньорска програма</p>
                <h2 className="sd-modal-title">Dalida Dance</h2>
              </div>
            </div>

            <div className="sd-modal-divider" style={{ background: "linear-gradient(to right, transparent, var(--accent-gold-color), transparent)", opacity: 0.3 }} />

            <div className="sd-highlights">
              <div className="dalida-highlight" style={{ width: '100%', padding: '24px 16px' }}>
                <span className="dalida-highlight-value" style={{ fontSize: '32px' }}>10% – 30%</span>
                <span className="sd-highlight-label" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>
                  отстъпка за шоу програми и събития
                </span>
              </div>
            </div>

            <button
              className={`sd-code-row${dalidaCodeCopied ? " sd-code-row--copied" : ""}`}
              style={dalidaCodeCopied ? { borderColor: "var(--accent-gold-color)", background: "rgba(212, 175, 55, 0.12)" } : {}}
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText("DALIDA_MYTEAM").then(() => {
                  setDalidaCodeCopied(true);
                  setTimeout(() => setDalidaCodeCopied(false), 2000);
                });
              }}
            >
              <span className="sd-code-lbl" style={dalidaCodeCopied ? { color: "var(--accent-gold-color)" } : {}}>{dalidaCodeCopied ? "Копирано!" : "Код:"}</span>
              <span className="dalida-code" style={{ color: "var(--accent-gold-color)" }}>{dalidaCodeCopied ? "✓" : "DALIDA_MYTEAM"}</span>
              {!dalidaCodeCopied && (
                <svg className="sd-copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              )}
            </button>
            <p className="sd-validity">Валиден: 2026</p>

            <div className="sd-qr-wrap">
              <p className="sd-qr-hint">Посетете ги онлайн на{" "}<a href="https://dalidadance.com" target="_blank" rel="noopener noreferrer" className="sd-store-link" style={{ color: "var(--accent-gold-color)" }}>dalidadance.com</a></p>
            </div>

            <div className="sd-modal-divider" style={{ background: "linear-gradient(to right, transparent, var(--accent-gold-color), transparent)", opacity: 0.3 }} />

            <div className="sd-terms">
              <p className="sd-terms-title">Условия</p>
              <ul className="sd-terms-list">
                <li>Отстъпката важи за всички <strong>шоу програми</strong></li>
                <li>Необходима е предварителна резервация</li>
                <li>Важи при представяне на промоционалния код</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* All Discounts Modal */}
      {allDiscountsModalOpen && (
        <div className="sd-overlay" onClick={() => setAllDiscountsModalOpen(false)}>
          <div className="sd-modal" onClick={(e) => e.stopPropagation()} style={{ padding: "24px 20px" }}>
            <button className="sd-modal-close" onClick={() => setAllDiscountsModalOpen(false)} aria-label="Затвори">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>

            <div className="sd-modal-header" style={{ marginBottom: "16px" }}>
              <div className="sd-modal-title-wrap">
                <p className="sd-modal-eyebrow" style={{ color: "var(--accent-gold-color, #e03535)" }}>Партньорска програма</p>
                <h2 className="sd-modal-title">Всички оферти</h2>
              </div>
            </div>

            <div className="sd-modal-divider" style={{ background: "linear-gradient(to right, transparent, var(--accent-gold-color, rgba(224, 53, 53, 0.3)), transparent)" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", maxHeight: "60vh", paddingRight: "4px" }}>
              {/* Sport Depot */}
              <button
                className="sd-discount-btn"
                style={{ marginTop: 0 }}
                onClick={() => { setAllDiscountsModalOpen(false); setSportDepotModalOpen(true); }}
                type="button"
                aria-label="Absolute Teamsport отстъпка"
              >
                <div className="sd-discount-logo-wrap">
                  <img src="/sd-logo.png" alt="Sport Depot" className="sd-discount-logo" />
                </div>
                <span className="sd-discount-label">Sport Depot</span>
                <span className="sd-discount-badge">-10%</span>
              </button>

              {/* Dalida Dance */}
              <button
                className="dalida-discount-btn"
                style={{ marginTop: 0 }}
                onClick={() => { setAllDiscountsModalOpen(false); setDalidaModalOpen(true); }}
                type="button"
                aria-label="Dalida Dance отстъпка"
              >
                <div className="sd-discount-logo-wrap">
                  <img src="/logo.png" alt="Dalida Dance" className="sd-discount-logo dalida-logo-fix" />
                </div>
                <span className="sd-discount-label">Dalida Dance</span>
                <span className="sd-discount-badge dalida-discount-badge">10-30%</span>
              </button>

              {/* Innline Dragon Body */}
              <button
                className="idb-discount-btn"
                style={{ marginTop: 0 }}
                onClick={() => { setAllDiscountsModalOpen(false); setIdbModalOpen(true); }}
                type="button"
                aria-label="Innline Dragon Body отстъпка"
              >
                <div className="sd-discount-logo-wrap">
                  <img src="/idb-logo.svg" alt="Innline Dragon Body" className="sd-discount-logo idb-logo-fix" />
                </div>
                <span className="sd-discount-label">Innline Dragon Body</span>
                <span className="sd-discount-badge">-10%</span>
              </button>

              {/* Mebeli Niko */}
              <button
                className="niko-discount-btn"
                style={{ marginTop: 0 }}
                onClick={() => { setAllDiscountsModalOpen(false); setNikoModalOpen(true); }}
                type="button"
                aria-label="Mebeli Niko отстъпка"
              >
                <div className="sd-discount-logo-wrap">
                  <img src="/niko-logo.png" alt="Mebeli Niko" className="sd-discount-logo niko-logo-fix" />
                </div>
                <span className="sd-discount-label">Мебели Нико</span>
                <span className="sd-discount-badge">-10%</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
