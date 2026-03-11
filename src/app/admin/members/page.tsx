"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

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

interface QuestionAnswer {
  id: string;
  answer: string;
  member: {
    firstName: string;
    secondName: string;
  };
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
    <div className="container p-6 fade-in">
      <div className="flex-col flex items-center text-center mb-8">
        
        <h1 className="text-gold mb-2" style={{ fontSize: '2rem', fontWeight: '600' }}>
          Администраторски панел
        </h1>
      </div>

      <div className="flex justify-center gap-4 mb-8">
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
          onClick={() => router.push("/admin/questions/add")}
          className="btn btn-primary"
        >
          Добави въпрос
        </button>
        <button 
          onClick={handleLogout}
          className="btn btn-secondary"
        >
          Изход
        </button>
      </div>

      {/* View Toggle Buttons */}
      <div className="flex justify-center gap-4 mb-8">
        <button 
          onClick={() => setView('members')}
          style={{
            background: 'none',
            border: 'none',
            color: view === 'members' ? 'var(--accent-gold)' : 'var(--text-secondary)',
            borderBottom: view === 'members' ? '3px solid var(--accent-gold)' : '3px solid transparent',
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
          color: 'var(--accent-gold)', 
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
            borderBottom: view === 'questions' ? '3px solid var(--accent-gold)' : '3px solid transparent',
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
                    <span key={card.id} className="text-gold font-mono">
                      {card.cardCode}{idx < member.cards.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </p>
                <div className="flex flex-wrap gap-1">
                  {member.cards.map((card) => (
                    <span key={card.id} className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      card.isActive 
                        ? 'bg-green-900 text-green-200' 
                        : 'bg-red-900 text-red-200'
                    }`}>
                      {card.cardCode}: {card.isActive ? 'Активна' : 'Неактивна'}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    if (member.cards.length > 0) {
                      router.push(`/member/${member.cards[0].cardCode}`);
                    } else {
                      alert("Този член няма присвоена карта.");
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
                      <div style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--accent-gold)' }}>
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

