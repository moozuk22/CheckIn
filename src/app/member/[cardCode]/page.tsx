'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'

interface Member {
  id: string
  cardCode: string
  name: string
  visits_total: number
  visits_used: number
  isActive?: boolean
}

export default function MemberPage({ params }: { params: Promise<{ cardCode: string }> }) {
  const resolvedParams = use(params)
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean>(false)
  const [isCheckingIn, setIsCheckingIn] = useState(false)
  const router = useRouter()

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
      } catch (err) {
        console.error('Error fetching data:', err)
      }

      await fetchMember(resolvedParams.cardCode, true)
    }

    fetchData()
  }, [resolvedParams.cardCode])

  useEffect(() => {
    const eventSource = new EventSource(`/api/members/${resolvedParams.cardCode}/events`)

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string }
        if (payload.type === 'check-in' || payload.type === 'reset') {
          fetchMember(resolvedParams.cardCode)
        }
      } catch (err) {
        console.error('SSE parse error:', err)
      }
    }

    return () => {
      eventSource.close()
    }
  }, [resolvedParams.cardCode])

  const remaining = member ? member.visits_total - member.visits_used : 0
  const isExhausted = member ? remaining <= 0 : false

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
          <p className="text-secondary">Зареждане...</p>
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
          <div className="text-gold mb-3" style={{ fontSize: '2.5rem' }}>♦</div>
          <h1 className="member-name">{member ? member.name : 'Не е намерен потребител'}</h1>
          {member?.isActive === false && (
            <div className="badge badge-warning mb-2">Активиране на карта...</div>
          )}
        </div>

        {member && (
          <div className="visit-info mb-6">
            <div className="visit-item">
              <span className="visit-number">{member.visits_total}</span>
              <div className="visit-label">Карта</div>
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

        <div className="mt-6 text-center">
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            Dalida Dance Studio
          </p>
          <p className="text-muted" style={{ fontSize: '0.75rem' }}>
            NFC Check-in System
          </p>
        </div>
      </div>
    </div>
  )
}
