'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import './training-calendar.css'

type TimeMode = 'single' | 'weekday' | 'date'

interface TrainingSchedule {
  id: string
  trainingDates: string[]
  trainingTime: string | null
  timeMode: TimeMode
  trainingDateTimes: Record<string, string> | null
  isActive: boolean
}

const WEEKDAY_LONG_BG = ['', 'Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота', 'Неделя']
const WEEKDAY_SHORT_BG = ['', 'Пон', 'Вт', 'Ср', 'Чет', 'Пет', 'Съб', 'Нед']
const TRAINING_WEEKDAY_SHORT_BG = ['Пон', 'Вт', 'Ср', 'Чет', 'Пет', 'Съб', 'Нед']
const MONTH_NAMES_BG = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември']

function getIsoWeekday(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay()
  return day === 0 ? 7 : day
}

function buildMonthsForPicker(selectedDates: string[], todayIso: string) {
  const limit = new Date(`${todayIso}T00:00:00.000Z`)
  limit.setUTCDate(limit.getUTCDate() + 30)
  const limitIso = limit.toISOString().slice(0, 10)

  const monthsNeeded = new Set<string>()
  // Add months covering today through today+30
  const cur = new Date(`${todayIso}T00:00:00.000Z`)
  while (cur <= limit) {
    monthsNeeded.add(`${cur.getUTCFullYear()}-${cur.getUTCMonth() + 1}`)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  // Also include months of already-selected dates (even if outside window)
  for (const d of selectedDates) {
    if (d < todayIso || d > limitIso) continue
    const parts = d.split('-')
    monthsNeeded.add(`${Number(parts[0])}-${Number(parts[1])}`)
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
      return { key: `${year}-${month}`, label: `${MONTH_NAMES_BG[month - 1] ?? ''} ${year}`, cells }
    })
}

function getTodayIso() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Sofia' })
}

export default function TrainingPage() {
  const router = useRouter()
  const todayIso = getTodayIso()

  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [timeMode, setTimeMode] = useState<TimeMode>('single')
  const [singleTime, setSingleTime] = useState('')
  const [weekdayTimes, setWeekdayTimes] = useState<Record<number, string>>({})
  const [dateTimes, setDateTimes] = useState<Record<string, string>>({})

  const checkSession = async () => {
    const res = await fetch('/api/admin/check-session')
    const data = await res.json() as { isAdmin?: boolean }
    if (!data.isAdmin) router.push('/admin/login')
  }

  const fetchSchedule = async () => {
    setScheduleLoading(true)
    try {
      const res = await fetch('/api/admin/training', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json() as { schedule: TrainingSchedule | null }
        if (data.schedule) {
          setSelectedDates((data.schedule.trainingDates ?? []).filter((d) => d >= todayIso))
          setTimeMode(data.schedule.timeMode ?? 'single')
          setSingleTime(data.schedule.trainingTime ?? '')
          if (data.schedule.timeMode === 'weekday' && data.schedule.trainingDateTimes) {
            const map: Record<number, string> = {}
            for (const [k, v] of Object.entries(data.schedule.trainingDateTimes)) {
              map[Number(k)] = v
            }
            setWeekdayTimes(map)
          }
          if (data.schedule.timeMode === 'date' && data.schedule.trainingDateTimes) {
            setDateTimes(data.schedule.trainingDateTimes as Record<string, string>)
          }
        }
      }
    } catch (err) {
      console.error('Schedule fetch error:', err)
    } finally {
      setScheduleLoading(false)
    }
  }

  useEffect(() => {
    void checkSession()
    void fetchSchedule()
  }, [])

  useEffect(() => {
    const es = new EventSource('/api/admin/training/stream')
    es.addEventListener('attendance-update', () => { void fetchSchedule() })
    return () => es.close()
  }, [])

  const limitIso = (() => {
    const d = new Date(`${todayIso}T00:00:00.000Z`)
    d.setUTCDate(d.getUTCDate() + 30)
    return d.toISOString().slice(0, 10)
  })()

  const toggleDate = (date: string) => {
    if (date < todayIso || date > limitIso) return
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date).sort() : [...prev, date].sort()
    )
  }

  const handleTimeModeChange = (mode: TimeMode) => {
    setTimeMode(mode)
    setWeekdayTimes({})
    setDateTimes({})
  }

  const handleSave = async () => {
    setSaveError(null)
    setSaveSuccess(false)

    // Validate times are set
    if (timeMode === 'single') {
      if (!singleTime) {
        setSaveError('Моля, задайте час за тренировките.')
        return
      }
    } else if (timeMode === 'weekday') {
      const missingWeekdays = activeWeekdays.filter((wd) => !weekdayTimes[wd])
      if (missingWeekdays.length > 0) {
        setSaveError('Моля, задайте час за всеки ден от седмицата.')
        return
      }
    } else {
      const missingDates = selectedDates.filter((d) => !dateTimes[d])
      if (missingDates.length > 0) {
        setSaveError('Моля, задайте час за всяка дата.')
        return
      }
    }

    setSaving(true)
    try {
      let trainingDateTimes: Record<string, string> | null = null
      let trainingTime: string | null = null

      if (timeMode === 'single') {
        trainingTime = singleTime || null
      } else if (timeMode === 'weekday') {
        const map: Record<string, string> = {}
        for (const [k, v] of Object.entries(weekdayTimes)) { if (v) map[String(k)] = v }
        trainingDateTimes = Object.keys(map).length > 0 ? map : null
      } else {
        const map: Record<string, string> = {}
        for (const [k, v] of Object.entries(dateTimes)) { if (v) map[k] = v }
        trainingDateTimes = Object.keys(map).length > 0 ? map : null
      }

      const res = await fetch('/api/admin/training', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainingDates: selectedDates, timeMode, trainingTime, trainingDateTimes }),
      })
      if (res.ok) {
        router.push('/admin/members?training=1')
      } else {
        const err = await res.json() as { error?: string }
        setSaveError(err.error ?? 'Грешка при запазване')
      }
    } catch {
      setSaveError('Грешка при запазване')
    } finally {
      setSaving(false)
    }
  }

  const activeWeekdays = [...new Set(selectedDates.map(getIsoWeekday))].sort((a, b) => a - b)

  const inputStyle = {
    padding: '7px 10px', borderRadius: '6px', fontSize: '13px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)',
    color: 'var(--text-primary)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const,
  }

  const calMonths = buildMonthsForPicker(selectedDates.filter((d) => d >= todayIso && d <= limitIso), todayIso)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ maxWidth: '760px', width: '100%' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <button
            onClick={() => router.push('/admin/members')}
            style={{
              background: 'transparent', border: '1px solid var(--border-color)',
              color: 'var(--text-primary)', padding: '6px 12px', borderRadius: '6px',
              cursor: 'pointer', fontSize: '13px',
            }}
          >
            ← Назад
          </button>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-gold-color)', margin: 0 }}>
            Тренировки
          </h1>
        </div>

        <section style={{
          background: 'var(--bg-secondary)', borderRadius: '10px',
          border: '1px solid var(--border-color)', padding: '20px',
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)', textAlign: 'center' }}>
            Настройка на графика
          </h2>

          {scheduleLoading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}><div className="loading" /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Time mode selector — top */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', opacity: 0.85 }}>
                  Начин на задаване на час
                </div>
                <div className="amp-time-mode-options">
                  {([
                    ['single', 'Един час за всички'],
                    ['weekday', 'По ден от седмицата'],
                    ['date', 'По отделна дата'],
                  ] as [TimeMode, string][]).map(([mode, label]) => (
                    <label key={mode} className={`amp-time-mode-option${timeMode === mode ? ' amp-time-mode-option--active' : ''}`}>
                      <input
                        type="radio"
                        name="timeMode"
                        value={mode}
                        checked={timeMode === mode}
                        onChange={() => handleTimeModeChange(mode)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Two-column: calendar left, time inputs right */}
              <div className="amp-training-two-col">

                {/* Left — calendar */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', opacity: 0.85 }}>
                    Изберете дни за тренировка
                    {selectedDates.length > 0 && (
                      <span style={{ marginLeft: '8px', opacity: 0.6, fontWeight: 400 }}>
                        ({selectedDates.length} избрани)
                      </span>
                    )}
                  </div>
                  <div className="amp-training-calendar-wrap">
                    <div className="amp-training-calendar">
                      {calMonths.map((month) => (
                        <div key={month.key} className="amp-training-month">
                          <div className="amp-training-month-title">{month.label}</div>
                          <div className="amp-training-weekdays-row">
                            {TRAINING_WEEKDAY_SHORT_BG.map((wd) => (
                              <span key={`${month.key}-${wd}`} className="amp-training-weekday-cell">{wd}</span>
                            ))}
                          </div>
                          <div className="amp-training-month-grid">
                            {month.cells.map((date, index) => {
                              if (!date) {
                                return <span key={`${month.key}-e-${index}`} className="amp-training-calendar-cell amp-training-calendar-cell--empty" aria-hidden="true" />
                              }
                              const isPast = date < todayIso
                              const isBeyondWindow = date > limitIso
                              const isSelected = selectedDates.includes(date)
                              const dayNumber = date.slice(8, 10)
                              if (isPast || isBeyondWindow) {
                                return (
                                  <span key={date} className="amp-training-calendar-cell amp-training-calendar-cell--disabled">
                                    <span className="amp-training-day-number">{dayNumber}</span>
                                  </span>
                                )
                              }
                              return (
                                <button
                                  key={date}
                                  type="button"
                                  onClick={() => toggleDate(date)}
                                  className={`amp-training-date-btn${isSelected ? ' amp-training-date-btn--picker-selected' : ''}`}
                                >
                                  <span className="amp-training-day-number">{dayNumber}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right — time inputs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-end' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, opacity: 0.85 }}>Час</div>

                  {timeMode === 'single' && (
                    <div style={{ maxWidth: '160px' }}>
                      <input
                        type="time"
                        value={singleTime}
                        onChange={(e) => setSingleTime(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  )}

                  {timeMode === 'weekday' && (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {activeWeekdays.length === 0 ? (
                        <div style={{ fontSize: '12px', opacity: 0.55 }}>Изберете дни от календара.</div>
                      ) : activeWeekdays.map((wd) => (
                        <div key={wd} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, minWidth: '80px' }}>
                            {WEEKDAY_LONG_BG[wd]}
                          </span>
                          <input
                            type="time"
                            value={weekdayTimes[wd] ?? ''}
                            onChange={(e) => setWeekdayTimes((prev) => ({ ...prev, [wd]: e.target.value }))}
                            style={{ ...inputStyle, maxWidth: '110px' }}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {timeMode === 'date' && (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {selectedDates.length === 0 ? (
                        <div style={{ fontSize: '12px', opacity: 0.55 }}>Изберете дни от календара.</div>
                      ) : selectedDates.map((date) => (
                        <div key={date} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, minWidth: '90px' }}>
                            {WEEKDAY_SHORT_BG[getIsoWeekday(date)]} {date.slice(8, 10)}.{date.slice(5, 7)}
                          </span>
                          <input
                            type="time"
                            value={dateTimes[date] ?? ''}
                            onChange={(e) => setDateTimes((prev) => ({ ...prev, [date]: e.target.value }))}
                            style={{ ...inputStyle, maxWidth: '110px' }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {saveError && <div style={{ color: '#ef4444', fontSize: '13px' }}>{saveError}</div>}
              {saveSuccess && <div style={{ color: '#22c55e', fontSize: '13px' }}>Графикът е запазен.</div>}

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  style={{
                    padding: '10px 32px', borderRadius: '6px', fontSize: '14px', fontWeight: 700,
                    background: 'var(--accent-gold-color)', border: 'none', color: '#000',
                    cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Запазване...' : 'Запази'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
