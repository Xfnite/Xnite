import RankingView from "@/components/Ranking/page";
import { getCombinedRankingsAction } from "@/app/actions/ranking";

export const dynamic = "force-dynamic";

export default async function RankingRoute() {
  const data = await getCombinedRankingsAction();

  return (
    <RankingView
      labellerData={data.labeller}
      referrerData={data.referrer}
      sessionUserRole={data.sessionUserRole}
    />
  );
}
