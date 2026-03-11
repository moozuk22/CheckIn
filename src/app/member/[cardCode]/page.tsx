'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { PushNotificationsPanel } from '@/components/push/PushNotificationsPanel'

interface Member {
  id: string
  cardCode: string
  name: string
  visits_total: number
  visits_used: number
  isActive?: boolean
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
  const router = useRouter()

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
        setIsAdmin(sessionData.isAdmin)

        if (!sessionData.isAdmin) {
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
      } catch (err) {
        console.error('Error fetching data:', err)
      }

      await fetchMember(resolvedParams.cardCode, true)
    }

    fetchData()
  }, [resolvedParams.cardCode])

  useEffect(() => {
    const eventSource = new EventSource(`/api/members/${resolvedParams.cardCode}/events`)

    eventSource.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string }
        if (payload.type === 'check-in' || payload.type === 'reset') {
          await fetchMember(resolvedParams.cardCode)
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
        void refreshQuestions()
      }
    }

    const onFocus = () => {
      void refreshQuestions()
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [isAdmin])

  const remaining = member ? member.visits_total - member.visits_used : 0
  const isExhausted = member ? remaining <= 0 : false

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

        {!isAdmin && questions.length > 0 && (
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
              color: 'var(--accent-gold)'
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
    </div>
  )
}
