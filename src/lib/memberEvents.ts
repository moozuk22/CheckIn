type MemberEvent = {
  type: "check-in" | "reset" | "questions-updated" | "notification-created" | "training-updated";
  cardCode: string;
  timestamp: number;
};

type MemberSubscriber = (event: MemberEvent) => void;
type QuestionUpdatesSubscriber = (event: { type: "questions-updated"; timestamp: number }) => void;

const subscribersByCardCode = new Map<string, Set<MemberSubscriber>>();
const questionUpdatesSubscribers = new Set<QuestionUpdatesSubscriber>();

export function subscribeMemberEvents(
  cardCode: string,
  subscriber: MemberSubscriber
) {
  if (!subscribersByCardCode.has(cardCode)) {
    subscribersByCardCode.set(cardCode, new Set());
  }

  const set = subscribersByCardCode.get(cardCode)!;
  set.add(subscriber);

  return () => {
    const currentSet = subscribersByCardCode.get(cardCode);
    if (!currentSet) return;
    currentSet.delete(subscriber);
    if (currentSet.size === 0) {
      subscribersByCardCode.delete(cardCode);
    }
  };
}

export function publishMemberUpdated(
  cardCode: string,
  type: "check-in" | "reset" | "notification-created" | "training-updated"
) {
  const set = subscribersByCardCode.get(cardCode);
  if (!set || set.size === 0) return;

  const event: MemberEvent = {
    type,
    cardCode,
    timestamp: Date.now(),
  };

  for (const subscriber of set) {
    try {
      subscriber(event);
    } catch (error) {
      console.error("Member event subscriber error:", error);
    }
  }
}

export function publishQuestionsUpdated() {
  const eventTimestamp = Date.now();

  for (const [cardCode, set] of subscribersByCardCode.entries()) {
    if (!set || set.size === 0) continue;

    const event: MemberEvent = {
      type: "questions-updated",
      cardCode,
      timestamp: eventTimestamp,
    };

    for (const subscriber of set) {
      try {
        subscriber(event);
      } catch (error) {
        console.error("Member event subscriber error:", error);
      }
    }
  }

  const questionEvent = { type: "questions-updated" as const, timestamp: eventTimestamp };
  for (const subscriber of questionUpdatesSubscribers) {
    try {
      subscriber(questionEvent);
    } catch (error) {
      console.error("Question update subscriber error:", error);
    }
  }
}

export function subscribeQuestionsUpdated(subscriber: QuestionUpdatesSubscriber) {
  questionUpdatesSubscribers.add(subscriber);

  return () => {
    questionUpdatesSubscribers.delete(subscriber);
  };
}
