type MemberEvent = {
  type: "check-in" | "reset" | "question-created";
  cardCode: string;
  timestamp: number;
};

type MemberSubscriber = (event: MemberEvent) => void;

const subscribersByCardCode = new Map<string, Set<MemberSubscriber>>();

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
  type: "check-in" | "reset"
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
      type: "question-created",
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
}
