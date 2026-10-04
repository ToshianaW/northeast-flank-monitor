/**
 * General context for /historical: Russia, Belarus and Ukraine, August 2020 – 24 February 2022.
 *
 * Compiled from the linked sources, in our own words. Not part of the historical event record and
 * not reviewed through the event workflow. Each date and claim was confirmed on the linked page,
 * fetched through the collector's HttpClient (robots.txt, rate limits) on 2026-10-03. Sources are
 * limited to outlets whose robots.txt allows our fetcher and whose terms were checked (OSW, NATO,
 * the Kremlin, LB.ua). Claims from government sources are worded as that government's statement.
 * Descriptions are neutral and past tense: no predictions, no phase labels, nothing about the present.
 */

export type TimelineSource = {
  name: string;
  url: string;
  /** A government's own website (shown as a state source). */
  state?: boolean;
};

export type TimelineMilestone = {
  /** YYYY-MM-DD */
  date: string;
  /** One neutral sentence in our own words. */
  text: string;
  /** Whose claim the entry reports, when it rests on a government's statement. */
  claim?: string;
  sources: TimelineSource[];
};

export type TimelineStretch = {
  id: string;
  label: string;
  /** YYYY-MM, inclusive */
  from: string;
  /** YYYY-MM, inclusive */
  to: string;
  /** Optional date line for the band, instead of the month span (e.g. "21-24 Feb 2022"). */
  dateLabel?: string;
  milestones: TimelineMilestone[];
};

export const PRELUDE_TIMELINE: TimelineStretch[] = [
  {
    id: "belarus-election-crisis",
    label: "Belarus election crisis",
    from: "2020-08",
    to: "2020-12",
    milestones: [
      {
        date: "2020-08-09",
        text: "Belarus held a presidential election in which the Central Election Commission declared Alyaksandr Lukashenka the winner with about 80% of the vote, and protests that followed in Minsk and other cities were dispersed by security forces.",
        sources: [
          { name: "OSW (Centre for Eastern Studies): Mass protests in Belarus", url: "https://www.osw.waw.pl/en/publikacje/analyses/2020-08-10/mass-protests-belarus" },
        ],
      },
      {
        date: "2020-09-14",
        text: "Vladimir Putin met Alyaksandr Lukashenka in Sochi, and Russia's loan to Belarus was raised from US$1 billion to US$1.5 billion.",
        sources: [
          { name: "OSW (Centre for Eastern Studies): Putin and Lukashenka met in Sochi", url: "https://www.osw.waw.pl/en/publikacje/analyses/2020-09-15/putin-and-lukashenka-met-sochi-no-settlement-has-been-reached" },
        ],
      },
    ],
  },
  {
    id: "spring-2021",
    label: "Spring 2021",
    from: "2021-03",
    to: "2021-04",
    milestones: [
      {
        date: "2021-04-22",
        text: "Russia's defence minister Sergei Shoigu announced that units in the readiness test near Ukraine would begin withdrawing to their permanent bases on 23 April; OSW assessed that most of the forces, about 90%, stayed near Ukraine's borders and in Crimea.",
        claim: "Russian government (the withdrawal announcement)",
        sources: [
          { name: "OSW (Centre for Eastern Studies): Troops withdrawing? Russian forces still on Ukraine's borders", url: "https://www.osw.waw.pl/en/publikacje/analyses/2021-04-28/troops-withdrawing-russian-forces-still-ukraines-borders" },
        ],
      },
    ],
  },
  {
    id: "belarus-west-tension-zapad",
    label: "Belarus–West tension and Zapad-2021",
    from: "2021-05",
    to: "2021-09",
    milestones: [
      {
        date: "2021-05-23",
        text: "Belarusian authorities forced a Ryanair flight from Athens to Vilnius to land in Minsk, escorted by a fighter jet, citing a bomb threat, and arrested the opposition blogger Raman Pratasievich and his partner.",
        sources: [
          { name: "OSW (Centre for Eastern Studies): Pratasievich kidnapped: Lukashenka's brutal game", url: "https://www.osw.waw.pl/en/publikacje/analyses/2021-05-24/pratasievich-kidnapped-lukashenkas-brutal-game" },
        ],
      },
      {
        date: "2021-05-28",
        claim: "Russian government (Kremlin transcript)",
        text: "Putin hosted Lukashenka for talks in Sochi; in the Kremlin's transcript Lukashenka described recent events as \"an outburst of emotions\", Putin agreed, and Lukashenka spoke about the diverted plane.",
        sources: [
          { name: "President of Russia (Kremlin): Meeting with President of Belarus Alexander Lukashenko", url: "http://en.kremlin.ru/events/president/news/65699", state: true },
        ],
      },
      {
        date: "2021-09-10",
        claim: "Russian government",
        text: "The Kremlin said the joint Russian–Belarusian Zapad-2021 exercises were held from 10 to 16 September at training grounds in Russia, in the Baltic Sea and in Belarus, involving up to 200,000 personnel.",
        sources: [
          { name: "President of Russia (Kremlin): Zapad 2021 military exercises (13 September 2021)", url: "http://www.en.kremlin.ru/events/president/news/66675", state: true },
        ],
      },
    ],
  },
  {
    id: "second-buildup-demands",
    label: "Second buildup and demands",
    from: "2021-10",
    to: "2022-01",
    milestones: [
      {
        date: "2021-11-09",
        text: "OSW reports that, amid a migrant crisis, Lithuania's parliament approved a state of emergency along Lithuania's border with Belarus, in force from midnight on 9–10 November.",
        sources: [
          { name: "OSW (Centre for Eastern Studies): Lithuania's reactions to the escalating migration crisis", url: "https://www.osw.waw.pl/en/publikacje/analyses/2021-11-10/lithuanias-reactions-to-escalating-migration-crisis" },
        ],
      },
      {
        date: "2021-11-11",
        text: "Ukraine's President Volodymyr Zelenskyy said Russia had amassed \"almost 100,000 troops on our border\".",
        sources: [
          { name: "LB.ua: Scoop of the day: Zelenskyy acknowledges Russian military buildup", url: "https://en.lb.ua/news/2021/11/11/9100_scoop_day_zelenskyy.html" },
        ],
      },
      {
        date: "2021-12-17",
        text: "Russia's foreign ministry published draft agreements with the US and NATO, including a demand that NATO not expand eastwards; NATO replied in writing on 26 January 2022, saying it would not compromise on the fundamental principles of Euro-Atlantic security.",
        sources: [
          { name: "OSW (Centre for Eastern Studies): Russia's blackmail of the West", url: "https://www.osw.waw.pl/en/publikacje/analyses/2021-12-20/russias-blackmail-west" },
          { name: "NATO: NATO conveys written proposals to Russia (26 January 2022)", url: "https://www.nato.int/cps/en/natohq/news_191252.htm" },
        ],
      },
      {
        date: "2022-01-18",
        text: "OSW reports that units of Russia's Eastern Military District, sent west after a readiness test on 14 January, were heading to Belarus ahead of the Allied Resolve 2022 exercises, and began arriving there the next day.",
        sources: [
          { name: "OSW (Centre for Eastern Studies): Russia demonstrates its power in Belarus and on the oceans worldwide", url: "https://www.osw.waw.pl/en/publikacje/analyses/2022-01-24/russia-demonstrates-its-power-belarus-and-oceans-worldwide" },
        ],
      },
    ],
  },
  {
    id: "february-2022",
    label: "February 2022",
    from: "2022-02",
    to: "2022-02",
    dateLabel: "21-24 Feb 2022",
    milestones: [
      {
        date: "2022-02-21",
        claim: "Russian government",
        text: "Putin announced Russia's recognition of the independence of the separatist-held Donetsk and Luhansk \"people's republics\" in eastern Ukraine.",
        sources: [
          { name: "President of Russia (Kremlin): Address of 21 February 2022", url: "http://en.kremlin.ru/events/president/news/67828", state: true },
        ],
      },
      {
        date: "2022-02-24",
        claim: "Russian government (the term \"special military operation\")",
        text: "Russia invaded Ukraine, as NATO described it, after Putin announced what he called a \"special military operation\".",
        sources: [
          { name: "NATO: NATO Allies condemn Russia's invasion of Ukraine in the strongest possible terms", url: "https://www.nato.int/cps/en/natohq/news_192406.htm" },
          { name: "President of Russia (Kremlin): Address of 24 February 2022", url: "http://en.kremlin.ru/events/president/news/67843", state: true },
        ],
      },
    ],
  },
];
