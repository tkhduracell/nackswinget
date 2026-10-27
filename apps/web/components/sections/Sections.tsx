import { Calendar } from "@/components/calendar/Calendar";
import type { ReactNode } from "react";
import type { CalendarFeed, Section } from "@/lib/content/types";
import { PostList } from "./PostList";
import { SectionList, type SectionSlots } from "./SectionBody";

export interface SectionEnv {
  feeds: CalendarFeed[];
  siteUrl: string;
  siteName: string;
  /** Stable prefix for element ids (calendars on the same page). */
  idPrefix: string;
}

/** Server renderer: the pure SectionList plus the data-backed sections. */
export function Sections({ sections, env, prefix = "s", heroAside }: { sections: Section[]; env: SectionEnv; prefix?: string; heroAside?: ReactNode }) {
  const slots: SectionSlots = {
    calendar: (section, index) => <Calendar section={section} feeds={env.feeds} site={{ siteUrl: env.siteUrl, siteName: env.siteName }} id={`${env.idPrefix}-cal-${index}`} />,
    postList: (section) => <PostList section={section} />,
    heroAside: () => heroAside,
  };
  return <SectionList sections={sections} slots={slots} prefix={prefix} />;
}
