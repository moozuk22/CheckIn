"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type NotificationType = "training_reminder" | "trainer_message";

interface MemberOption {
  id: string;
  firstName: string;
  secondName: string;
}

function formatMemberLabel(member: MemberOption) {
  return `${member.firstName} ${member.secondName}`.trim();
}

function isValid24HourTime(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export default function AdminNotificationsPage() {
  const router = useRouter();
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [rawResponse, setRawResponse] = useState<string>("");

  const [type, setType] = useState<NotificationType>("trainer_message");
  const [broadcast, setBroadcast] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [trainingDate, setTrainingDate] = useState("");
  const [trainingTime, setTrainingTime] = useState("");
  const [trainerMessage, setTrainerMessage] = useState("");

  useEffect(() => {
    const loadMembers = async () => {
      try {
        const response = await fetch("/api/admin/members", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Неуспешно зареждане на членове");
        }

        const payload = (await response.json()) as MemberOption[];
        setMembers(payload);
      } catch (error) {
        console.error("Members load error:", error);
        setErrorMessage("Неуспешно зареждане на членове.");
      } finally {
        setIsLoadingMembers(false);
      }
    };

    void loadMembers();
  }, []);

  const isTrainingReminder = type === "training_reminder";
  const isTrainerMessage = type === "trainer_message";

  const selectedMember = useMemo(
    () => members.find((member) => member.id === memberId) ?? null,
    [memberId, members]
  );

  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) {
      return members.slice(0, 20);
    }

    return members
      .filter((member) => {
        const fullName = formatMemberLabel(member).toLowerCase();
        return fullName.includes(query) || member.id.toLowerCase().includes(query);
      })
      .slice(0, 20);
  }, [memberQuery, members]);

  const canSubmit = useMemo(() => {
    if (isLoadingMembers || isSending) {
      return false;
    }
    if (!broadcast && !memberId) {
      return false;
    }
    if (isTrainerMessage && trainerMessage.trim() === "") {
      return false;
    }
    return true;
  }, [broadcast, isLoadingMembers, isSending, isTrainerMessage, memberId, trainerMessage]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setRawResponse("");
    setIsSending(true);

    try {
      const requestBody: Record<string, unknown> = {
        type,
        broadcast,
      };

      if (!broadcast) {
        requestBody.memberId = memberId;
      }

      if (isTrainingReminder && trainingTime.trim() && !isValid24HourTime(trainingTime.trim())) {
        throw new Error("Невалиден час. Използвайте 24-часов формат HH:mm.");
      }

      if (isTrainingReminder && trainingDate.trim()) {
        requestBody.trainingDate =
          trainingTime.trim() !== ""
            ? `${trainingDate.trim()} ${trainingTime.trim()}`
            : trainingDate.trim();
      }
      if (isTrainerMessage && trainerMessage.trim()) {
        requestBody.trainerMessage = trainerMessage.trim();
      }

      const response = await fetch("/api/admin/notifications/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const payload = await response.json().catch(() => ({}));
      setRawResponse(JSON.stringify(payload, null, 2));

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Неуспешно изпращане на известие."
        );
      }

      setSuccessMessage("Известието е изпратено.");
    } catch (error) {
      console.error("Manual notification send error:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Неуспешно изпращане на известие."
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="container p-6 fade-in">
      <div className="flex justify-between items-center mb-6" style={{ gap: "12px", flexWrap: "wrap" }}>
        <h1 className="text-gold" style={{ fontSize: "2rem", fontWeight: 600 }}>
          Ръчни известия
        </h1>
        <button type="button" className="btn btn-secondary" onClick={() => router.push("/admin/members")}>
          Назад към админ
        </button>
      </div>

      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: "720px", margin: "0 auto" }}>
        <div className="mb-4">
          <label htmlFor="notificationType" className="text-secondary" style={{ display: "block", marginBottom: "8px" }}>
            Тип на известието
          </label>
          <select
            id="notificationType"
            className="input w-full"
            value={type}
            onChange={(event) => setType(event.target.value as NotificationType)}
          >
            <option value="trainer_message">Съобщение от треньор</option>
            <option value="training_reminder">Напомняне за тренировка</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="text-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <input type="checkbox" checked={broadcast} onChange={(event) => setBroadcast(event.target.checked)} />
            Изпрати до всички
          </label>
        </div>

        {!broadcast && (
          <div className="mb-4">
            <label htmlFor="memberSearch" className="text-secondary" style={{ display: "block", marginBottom: "8px" }}>
              Член
            </label>
            <input
              id="memberSearch"
              className="input w-full"
              placeholder="Търси по име или ID"
              value={memberQuery}
              onChange={(event) => setMemberQuery(event.target.value)}
              disabled={isLoadingMembers}
            />

            <div
              style={{
                marginTop: "8px",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                maxHeight: "220px",
                overflowY: "auto",
                background: "var(--bg-secondary)",
              }}
            >
              {filteredMembers.length === 0 && (
                  <div style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>
                  Няма намерени членове.
                </div>
              )}
              {filteredMembers.map((member, index) => {
                const isSelected = member.id === memberId;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => {
                      setMemberId(member.id);
                      setMemberQuery(formatMemberLabel(member));
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "none",
                      borderBottom:
                        index < filteredMembers.length - 1 ? "1px solid var(--border-color)" : "none",
                      cursor: "pointer",
                      background: isSelected ? "rgba(212, 175, 55, 0.16)" : "transparent",
                      color: "var(--text-primary)",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{formatMemberLabel(member)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isTrainingReminder && (
          <div className="mb-4">
            <label htmlFor="trainingDate" className="text-secondary" style={{ display: "block", marginBottom: "8px" }}>
              Ден и час на тренировката
            </label>
            <div className="flex gap-3" style={{ flexWrap: "wrap" }}>
              <input
                id="trainingDate"
                type="date"
                className="input"
                style={{ flex: "1 1 220px" }}
                value={trainingDate}
                onChange={(event) => setTrainingDate(event.target.value)}
              />
              <input
                id="trainingTime"
                type="time"
                className="input"
                style={{ flex: "1 1 160px" }}
                step={60}
                value={trainingTime}
                onChange={(event) => setTrainingTime(event.target.value)}
              />
            </div>
          </div>
        )}

        {isTrainerMessage && (
          <div className="mb-4">
            <label htmlFor="trainerMessage" className="text-secondary" style={{ display: "block", marginBottom: "8px" }}>
              Съобщение
            </label>
            <textarea
              id="trainerMessage"
              className="input w-full"
              style={{ minHeight: "120px", resize: "vertical" }}
              value={trainerMessage}
              onChange={(event) => setTrainerMessage(event.target.value)}
            />
          </div>
        )}

        {successMessage && <div className="alert alert-success mb-4">{successMessage}</div>}
        {errorMessage && <div className="alert alert-error mb-4">{errorMessage}</div>}

        <div className="flex gap-3" style={{ flexWrap: "wrap" }}>
          <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
            {isSending ? "Изпращане..." : "Изпрати известие"}
          </button>
        </div>
      </form>

      {rawResponse && (
        <div className="card mt-6" style={{ maxWidth: "720px", margin: "24px auto 0" }}>
          <h3 className="text-gold mb-3" style={{ fontSize: "1rem" }}>
            API отговор
          </h3>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{rawResponse}</pre>
        </div>
      )}
    </div>
  );
}
