'use client'

import { useState, useEffect } from 'react'

interface Member {
  id: number
  name: string
  visits_total: number
  visits_used: number
}

export default function AdminMembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean>(true) // Mock admin check
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    // Mock data - в реалност тук ще има API call
    const mockMembers: Member[] = [
      { id: 1, name: 'Anna Petrova', visits_total: 8, visits_used: 4 },
      { id: 2, name: 'Maria Ivanova', visits_total: 10, visits_used: 10 },
      { id: 3, name: 'Elena Georgieva', visits_total: 5, visits_used: 2 },
      { id: 4, name: 'Sofia Hristova', visits_total: 12, visits_used: 0 },
      { id: 5, name: 'Viktoria Popova', visits_total: 8, visits_used: 8 }
    ]

    setTimeout(() => {
      setMembers(mockMembers)
      setLoading(false)
    }, 500)
  }, [])

  const handleCheckIn = (memberId: number) => {
    const member = members.find(m => m.id === memberId)
    if (!member) return

    const remaining = member.visits_total - member.visits_used
    
    if (remaining <= 0) {
      setMessage({
        type: 'error',
        text: `Картата на ${member.name} е изчерпана! Няма оставащи посещения.`
      })
      setTimeout(() => setMessage(null), 3000)
      return
    }

    // Mock API call за check-in
    setMembers(prevMembers => 
      prevMembers.map(m => 
        m.id === memberId 
          ? { ...m, visits_used: m.visits_used + 1 }
          : m
      )
    )

    setSelectedMember(member)
    setMessage({
      type: 'success',
      text: `✓ Check-in успешен за ${member.name}!`
    })
    setTimeout(() => setMessage(null), 3000)
  }

  const getRemaining = (member: Member) => member.visits_total - member.visits_used
  const isExhausted = (member: Member) => getRemaining(member) <= 0

  if (!isAdmin) {
    return (
      <div className="container flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="alert alert-error">
          <h3 className="mb-2">Достъп отказан</h3>
          <p>Нямате администраторски права за достъп до тази страница.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="text-center">
          <div className="loading mb-4"></div>
          <p className="text-secondary">Зареждане на членове...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container p-6 fade-in">
      <div className="text-center mb-6">
        <div className="text-gold mb-3" style={{ fontSize: '2.5rem' }}>♦</div>
        <h1>Администраторски панел</h1>
        <p className="text-secondary mt-2">Управление на посещенията на членове</p>
      </div>

      {message && (
        <div className={`alert alert-${message.type} slide-up mb-8`}>
          {message.text}
        </div>
      )}

      <div className="stats-grid mb-6">
        <div className="stat-card">
          <div className="stat-number">{members.length}</div>
          <div className="stat-label">Общо членове</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">
            {members.reduce((sum, m) => sum + getRemaining(m), 0)}
          </div>
          <div className="stat-label">Оставащи посещения</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">
            {members.filter(m => isExhausted(m)).length}
          </div>
          <div className="stat-label">Изчерпани карти</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {members.map((member) => {
          const remaining = getRemaining(member)
          const exhausted = isExhausted(member)
          
          return (
            <div key={member.id} className="card">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-gold mb-1">{member.name}</h3>
                  <p className="text-muted" style={{ fontSize: '0.9rem' }}>ID: {member.id}</p>
                </div>
                <div className="text-gold" style={{ fontSize: '1.5rem' }}>♦</div>
              </div>

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
                  <span className={`visit-number ${exhausted ? 'text-error' : 'text-gold'}`}>
                    {remaining}
                  </span>
                  <div className="visit-label">Остават</div>
                </div>
              </div>

              {exhausted ? (
                <div className="alert alert-warning">
                  <strong>Картата е изчерпана</strong>
                  <p className="mt-1 mb-0" style={{ fontSize: '0.9rem' }}>
                    Няма оставащи посещения
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => handleCheckIn(member.id)}
                  className="btn btn-primary w-full"
                >
                  CHECK IN
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="text-center mt-8">
        <p className="text-muted" style={{ fontSize: '0.85rem' }}>
          Dalida Dance Studio Admin Panel
        </p>
        <p className="text-muted" style={{ fontSize: '0.75rem' }}>
          NFC Check-in System v1.0
        </p>
      </div>
    </div>
  )
}