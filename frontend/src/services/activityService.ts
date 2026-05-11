
function getUserId(): string | null {
  return localStorage.getItem("userId");
}

export const activityService = {
  log(action: string, details?: string): void {
    const userId = getUserId();
    if (!userId) return;
    fetch("/api/activity/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, details }),
    }).catch(() => {});
  },
};

export const searchHistoryService = {
  record(term: string): void {
    const userId = getUserId();
    if (!userId) return;
    fetch("/api/search/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, term }),
    }).catch(() => {});
  },
};
