// 来場セッションの「人数」と「滞在時間」を集計する純粋ロジック。サイネージの「前回のテクノバ」
// 表示に使う。Workers 安全（時刻は呼び出し側が epoch ms で渡す前提で、Date/Intl にも依存しない）。
//
// 重要: sessions は (participantId, eventId) に一意制約が無く、退館→再入館で同一人物が
// 同イベントに複数行を持つ（週末の昼休み運用など）。来場「人数」はユニーク参加者で数え、
// 平均滞在は同一人物の複数区間を合算してから1人あたりで平均する。

export interface Stay {
  participantId: string;
  checkedInAt: number; // epoch ms
  checkedOutAt: number | null; // epoch ms（未退館は null）
}

export interface VisitSummary {
  count: number; // ユニーク来場者数（人）
  averageStayMinutes: number | null; // 退館済み区間がある人の、1人あたり平均滞在（分・四捨五入）
}

export const summarizeStays = (stays: Stay[]): VisitSummary => {
  const participants = new Set<string>();
  // participantId → 合計滞在 ms（退館済み かつ 退館>=入館 の区間のみ合算）。
  const totalByParticipant = new Map<string, number>();

  for (const s of stays) {
    participants.add(s.participantId);
    if (s.checkedOutAt !== null && s.checkedOutAt >= s.checkedInAt) {
      const prev = totalByParticipant.get(s.participantId) ?? 0;
      totalByParticipant.set(s.participantId, prev + (s.checkedOutAt - s.checkedInAt));
    }
  }

  const totals = [...totalByParticipant.values()];
  if (totals.length === 0) return { count: participants.size, averageStayMinutes: null };
  const avgMs = totals.reduce((sum, d) => sum + d, 0) / totals.length;
  return { count: participants.size, averageStayMinutes: Math.round(avgMs / 60_000) };
};
