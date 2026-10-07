import { C } from "@/lib/chart";
import type { ChannelId } from "@/lib/types";

export const CHANNEL_SERIES: { key: ChannelId; label: string; color: string }[] = [
  { key: "google_ads", label: "Google Ads", color: C.blue },
  { key: "linkedin_ads", label: "LinkedIn Ads", color: C.violet },
  { key: "review_sites", label: "Capterra / G2", color: C.teal },
  { key: "youtube_ads", label: "YouTube Ads", color: C.pink },
  { key: "meta_ads", label: "Meta Ads", color: C.orange },
  { key: "reddit_ads", label: "Reddit Ads", color: C.neutral },
];

export const LAG_SERIES = [
  { key: "newSelfServe", color: C.blue },
  { key: "dealsCreated", color: C.violet },
  { key: "newEnterpriseArr", color: C.orange },
] as const;
