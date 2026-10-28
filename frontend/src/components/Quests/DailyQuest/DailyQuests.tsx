import React, { useState } from "react";
import QuestCard from "./QuestCard";
import QuestSectionHeader from "../QuestSectionHeader";

export interface DailyQuestType {
  id: string;
  title: string;
  description: string;
  target: string;
  xp: number;
  complete: boolean;
  claimed: boolean;
}

interface DailyQuestsProps {
  localDailyQuests: DailyQuestType[];
  expandedQuestId: string | null;
  toggleQuest: (id: string) => void;
  handleCompletedClick: (questId: string, xp: number) => void;
}

export default function DailyQuests({
  localDailyQuests,
  expandedQuestId,
  toggleQuest,
  handleCompletedClick,
}: DailyQuestsProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!localDailyQuests || localDailyQuests.length === 0) return null;

  const completedCount = localDailyQuests.filter((q) => q.complete).length;

  return (
    <div>
      <QuestSectionHeader
        title="Daily Quests"
        completed={completedCount}
        total={localDailyQuests.length}
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed((v) => !v)}
      />

      {!isCollapsed && (
      <div className="space-y-0">
        {localDailyQuests.map((quest) => (
          <QuestCard
            key={quest.id}
            quest={quest}
            isExpanded={expandedQuestId === quest.id}
            onHeaderClick={() => {
              if (quest.complete && !quest.claimed) {
                handleCompletedClick(quest.id, quest.xp);
              } else {
                toggleQuest(quest.id);
              }
            }}
          />
        ))}
      </div>
      )}
    </div>
  );
}
