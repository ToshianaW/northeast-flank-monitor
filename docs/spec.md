Northeast Flank Monitor

Complete Product, Methodology, Architecture, and Visual Design Specification

⸻

1. Project Overview

I want to build an open-source OSINT monitoring website called:

Northeast Flank Monitor

The site should monitor military activity, exercises, readiness changes, official alerts, force movements, air activity, border incidents, logistics indicators, and relevant geopolitical developments across NATO’s northeastern flank.

Primary focus:

* Kaliningrad Oblast
* Western Belarus
* Suwałki corridor
* Lithuania
* Poland
* Latvia
* Estonia
* Baltic Sea region
* Relevant areas of western Russia when activity materially affects the Baltic theater

The site should update on a 24-hour cycle.

The core purpose is NOT to predict war.

The purpose is to answer:

Is the military baseline in the Northeast Flank changing over time?

The site should make it possible to distinguish:

* routine military activity
* elevated readiness
* temporary exercises
* sustained readiness cycles
* force accumulation
* incomplete post-exercise reset
* changes in military posture

The project should be:

* open-source
* transparent
* non-sensational
* source-driven
* analytically neutral
* reproducible
* historically comparative
* usable by researchers, journalists, students, OSINT communities, and analysts

⸻

2. Core Analytical Philosophy

The project should be built around observable military behavior rather than assumptions about intent.

Do NOT make claims such as:

* war is imminent
* invasion is likely
* Russia will attack NATO
* NATO is preparing to attack Russia

unless such language is directly attributed to a credible source.

The site should monitor what actors are actually doing.

Examples:

* exercise frequency
* exercise geography
* readiness inspections
* mobilization
* reserve activation
* troop movements
* unit rotations
* equipment movements
* air activity
* logistics
* rail activity
* engineering activity
* airfield preparation
* command-and-control activity
* air defense activity
* electronic warfare
* border incidents
* NATO reinforcement
* Russian-Belarusian military integration
* whether forces return after exercises
* whether equipment remains
* whether temporary infrastructure remains
* whether new exercises replace previous ones

The site’s central analytical distinction should be:

Similarity is not trajectory.

Current activity may resemble historical activity without meaning the same outcome will follow.

⸻

3. The Core Question

Every major page and analytical feature should ultimately help answer:

Is the regional military baseline changing?

That means the site should not merely report:

“An exercise occurred.”

It should try to answer:

* Was this exercise routine?
* Was it larger than normal?
* Was it geographically significant?
* Did units return afterward?
* Did equipment remain?
* Was another exercise launched immediately afterward?
* Did the same infrastructure remain active?
* Did external forces enter the theater?
* Did the theater fully return to baseline?

⸻

4. Post-Exercise Reset

This should be a major analytical concept throughout the site.

For each significant exercise, track:

* Did personnel return to permanent bases?
* Did equipment return?
* Was temporary infrastructure removed?
* Were airfields returned to normal activity?
* Did ammunition/logistics support disappear?
* Did another formation replace the previous one?
* Did Russian personnel remain in Belarus?
* Did the exercise roll directly into another readiness event?
* Did the overall theater return to its prior baseline?

Possible reset statuses:

FULL_RESET
PERSONNEL_RETURNED
EQUIPMENT_STATUS_UNKNOWN
PARTIAL_RESET
RESIDUAL_ACTIVITY
INCOMPLETE_RESET
CONTINUED_DEPLOYMENT
UNKNOWN

Important:

“Troops returned” does not automatically mean “the theater reset.”

The system should be capable of distinguishing those concepts.

⸻

5. Historical Comparison Framework

One of the defining features of Northeast Flank Monitor should be historical comparison.

The initial historical dataset should focus on:

August 2020 – February 2022

The most important comparison period should be:

Late 2020 – February 2021

This is the period before the obvious March-April 2021 Russian force concentration near Ukraine.

This earlier environment included:

* frequent Russian-Belarusian exercises
* recurring readiness checks
* simultaneous activity in Belarus, Kaliningrad, and western Russia
* command-and-control work
* increasing Russian-Belarusian military integration
* Zapad-2021 preparation
* air-defense integration
* repeated rotations
* exercise-heavy military activity
* theater conditioning without yet having massive abnormal force concentration

The site should distinguish several historical phases.

⸻

6. Historical Phase Model

Phase 0 — Baseline

Routine military activity.

Examples:

* scheduled exercises
* normal unit rotations
* expected readiness checks
* standard air activity

⸻

Phase 1 — Elevated Readiness / Theater Conditioning

Approximate historical analogue:

Late 2020 – February 2021

Characteristics:

* more frequent exercises
* increased readiness checks
* repeated rotations
* command work
* mobilization practice
* border defense exercises
* integration
* air-defense activity
* peacetime-to-wartime transition drills

This is the primary early historical analogue for current monitoring.

⸻

Phase 2 — Observable Abnormal Force Generation

Approximate historical analogue:

March–April 2021

Characteristics:

* large formations physically moving toward theater
* armor concentrations
* artillery concentrations
* airborne forces
* logistics infrastructure
* field support
* rail movement
* expanded staging areas

⸻

Phase 3 — Forward Positioning / Incomplete Reset

Approximate period:

Spring–Autumn 2021

Characteristics:

* personnel returning but equipment remaining
* persistent infrastructure
* increased logistics
* Zapad preparations
* deployments into Belarus
* recurring activity
* posture not fully returning to earlier baseline

⸻

Phase 4 — Operational Buildup

Approximate period:

Late 2021 – February 2022

Characteristics:

* large-scale force concentration
* Russian forces entering Belarus in strength
* field camps
* aviation
* air defense
* artillery
* command posts
* logistics
* support infrastructure
* operational assembly

The website should NEVER assume that current activity is automatically progressing through these phases.

These phases should exist as a historical analytical framework only.

⸻

7. Geographic Scope

Belarus

Primary monitoring areas:

* Grodno / Hrodna Oblast
* Brest Oblast
* Western Operational Command
* training grounds near NATO borders
* airfields
* rail corridors
* territorial defense
* mobilization
* reserve activity
* Russian military presence
* joint Russian-Belarusian activity

⸻

Kaliningrad Oblast

Monitor:

* Baltic Fleet
* ground formations
* air-defense systems
* missile forces
* aviation
* Iskander-related activity
* electronic warfare
* naval activity
* military rail movements
* infrastructure
* reinforcement from mainland Russia
* changes in force posture

⸻

Lithuania

Monitor:

* Lithuanian Armed Forces
* Lithuanian Ministry of National Defence
* NATO forces
* German brigade
* U.S. rotational forces
* Baltic Air Policing
* exercises
* mobilization
* territorial defense
* airspace incidents
* border activity

⸻

Poland

Monitor:

* Polish Armed Forces
* Ministry of National Defence
* Operational Command
* northeastern Poland
* Suwałki corridor
* exercises
* NATO deployments
* U.S. forces
* border security
* mobilization/readiness activity

⸻

Latvia and Estonia

Monitor:

* national armed forces
* NATO deployments
* air defense
* exercises
* border incidents
* readiness changes
* Russian military activity affecting their territory

⸻

Western Russia

Track only when relevant to the Baltic / Belarus theater.

Examples:

* Russian formations moving west
* Western Military District / successor command activity
* rail deployments
* aviation movements
* logistics support
* reinforcements toward Belarus or Kaliningrad

⸻

8. Website Structure

Primary navigation:

LATEST
MAP
EXERCISES
AIR ACTIVITY
HISTORICAL COMPARE
ARCHIVE
SOURCES
METHODOLOGY
ABOUT

⸻

9. Homepage

The homepage should immediately answer:

What changed during the last 24 hours?

The site should feel like an intelligence-monitoring platform rather than a newspaper homepage.

Do NOT use a large marketing hero.

⸻

10. Homepage Layout

Suggested desktop layout:

┌─────────────────────────────────────────────────────────────┐
│ NORTHEAST FLANK MONITOR               Updated 12:00 UTC    │
│ Open-source monitoring of NATO's northeastern flank         │
│                                                             │
│ Latest | Map | Exercises | Compare | Archive | Methodology  │
└─────────────────────────────────────────────────────────────┘
┌──────────────────────────────┬──────────────────────────────┐
│ REGIONAL ACTIVITY            │ 24-HOUR SNAPSHOT             │
│                              │                              │
│        ELEVATED              │  8 verified events           │
│        42 / 100              │  3 active exercises          │
│                              │  0 external deployments      │
│ ↑ +3 from yesterday          │  Reset status: NORMAL        │
└──────────────────────────────┴──────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                   LIVE REGIONAL MAP                         │
│                                                             │
│ Kaliningrad   Suwałki   Hrodna   Brest   Lithuania         │
│                                                             │
│             [interactive event markers]                     │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────┬───────────────────────────┐
│ LATEST VERIFIED EVENTS          │ HISTORICAL SIGNAL         │
│                                 │                           │
│ 11:42  Lithuania                │ CURRENT ANALOGUE          │
│ Air-policing interception       │                           │
│                                 │ Jan–Feb 2021              │
│ 09:20  Belarus                  │ readiness environment     │
│ Readiness inspection            │                           │
│                                 │ Similarities              │
│ 07:15  Poland                   │ ● exercise density        │
│ Exercise activity               │ ● readiness activity      │
│                                 │                           │
│                                 │ Differences               │
│                                 │ ○ no force buildup        │
│                                 │ ○ reset still occurring   │
└─────────────────────────────────┴───────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ ACTIVE EXERCISES                                            │
└─────────────────────────────────────────────────────────────┘
┌──────────────────────────────┬──────────────────────────────┐
│ ACTIVITY TREND — 30 DAYS     │ POST-EXERCISE RESET         │
└──────────────────────────────┴──────────────────────────────┘

⸻

11. Regional Activity Panel

Example:

REGIONAL ACTIVITY
ELEVATED
42 / 100
↑ 3 points · 24h

Directly beneath:

Measures observable military activity. Not a forecast of conflict.

This should be visually prominent but not alarmist.

⸻

12. 24-Hour Snapshot

Possible fields:

VERIFIED EVENTS          8
ACTIVE EXERCISES         3
NEW EXTERNAL DEPLOYMENTS 0
BORDER INCIDENTS         1
POST-EXERCISE RESET      NORMAL

The visual style should resemble a compact intelligence status panel.

⸻

13. Interactive Regional Map

The map should be one of the main visual elements.

Recommended technology:

MapLibre + OpenStreetMap

Initial viewport:

* Kaliningrad
* Lithuania
* northeastern Poland
* western Belarus
* Latvia

Markers should support:

* exercise
* readiness check
* air incident
* mobilization
* troop movement
* equipment movement
* border incident
* logistics
* NATO deployment
* Russian deployment
* infrastructure activity

Clicking a marker should open a preview.

Example:

WESTERN OPERATIONAL COMMAND
Hrodna Oblast · Belarus
30 SEP 2026
READINESS CHECK
Confidence: HIGH
View event →

Avoid unnecessarily precise current operational locations.

Use publicly reported or appropriately generalized locations.

⸻

14. Latest Verified Events

Use compact log-style entries rather than giant news cards.

Example:

11:42 UTC                    LITHUANIA
AIR ACTIVITY
NATO aircraft intercepted Russian military aircraft
travelling between mainland Russia and Kaliningrad.
SOURCE
Lithuanian MOD
CONFIDENCE
CONFIRMED
View event →

Use thin separators.

The site should feel like an analytical monitoring feed.

⸻

15. Historical Signal Panel

This should be a signature homepage feature.

Example:

CURRENT HISTORICAL ANALOGUE
JAN–FEB 2021
Pre-concentration readiness environment
SIMILARITIES
● elevated exercise activity
● readiness inspections
● western Belarus activity
● Kaliningrad activity
DIFFERENCES
○ no major external Russian deployment
○ exercise units currently resetting
○ no comparable logistics accumulation
VIEW 2021 ↔ 2026 COMPARISON →

Important:

Do not imply that historical resemblance equals a predicted outcome.

⸻

16. Daily Digest

Generate one digest every 24 hours.

Suggested structure:

01 OCT 2026
NORTHEAST FLANK DAILY DIGEST
Executive Summary
Belarus
Kaliningrad
NATO Northeast Flank
Air Activity
Border / Hybrid Activity
Post-Exercise Assessment
Historical Context
Contradictions & Unverified Reporting

Every major factual claim should retain its underlying source.

⸻

17. Exercise Tracker

Create a dedicated page and database for exercises.

Fields:

exercise_name
actor
countries
location
participating_units
estimated_personnel
equipment
announced_start_date
announced_end_date
observed_start_date
observed_end_date
exercise_status
exercise_objectives
source
post_exercise_reset

Exercise statuses:

ANNOUNCED
UPCOMING
ACTIVE
CONCLUDING
CONCLUDED
EXTENDED
UNCLEAR

⸻

18. Post-Exercise Reset Widget

Create a reusable visual component.

Example:

POST-EXERCISE RESET
Western Operational Command
15–18 September
PERSONNEL
✓ Returned
EQUIPMENT
? Not independently verified
TEMPORARY INFRASTRUCTURE
✓ Removed
FOLLOW-ON ACTIVITY
● Continued readiness inspections
OVERALL RESET
PARTIAL / NORMAL / INCOMPLETE

This should become a recognizable feature of the site.

⸻

19. Air Activity Page

This page should track:

* Baltic Air Policing interceptions
* Russian military aircraft
* origin/destination
* aircraft type
* transponder status
* flight-plan status
* communications status
* NATO interception
* Kaliningrad-related aviation
* trends over time

Lithuanian official weekly reporting is a particularly useful structured source.

Possible charts:

* intercepts by week
* aircraft type
* flights involving Kaliningrad
* monthly activity trend

⸻

20. Activity Timeline

Create a 30-day activity timeline.

Users should be able to toggle:

Exercises
Readiness
Mobilization
Deployments
Air Activity
Logistics
Border Incidents
Engineering
Command Activity

The purpose is to visually identify whether events are:

* isolated
* clustered
* continuous
* increasing
* decreasing
* returning to baseline

⸻

21. Historical Compare Page

Page title:

Historical Compare

Subtitle:

Compare observable military indicators across different periods.

Default comparison:

JAN–FEB 2021
vs.
SEP–OCT 2026

Display two synchronized timelines.

Example:

JAN 2021                         OCT 2026
Belarus readiness check   │     Belarus readiness check
Kaliningrad exercise      │     Western Belarus exercise
Russian-Belarus drill     │     Mobilization inspection
Zapad planning            │     NATO readiness activity

⸻

22. Historical Indicator Matrix

Example:

                          JAN 2021       OCT 2026
Exercise tempo             HIGH            HIGH
Mobilization               PRESENT         PRESENT
External Russian forces    LIMITED         NONE CONFIRMED
Logistics accumulation     LOW             BASELINE
Post-exercise residue      UNCLEAR         LOW
Joint integration          RISING          MODERATE
Air activity               ELEVATED        ELEVATED

Use descriptive categories rather than predictive scores.

⸻

23. Activity Index

Create a:

Northeast Flank Activity Index

Important:

This is NOT a probability-of-war score.

Permanent disclaimer:

The Northeast Flank Activity Index measures observable military activity and force posture. It does not estimate the probability of conflict or predict political intent.

Potential dimensions:

* Exercise Tempo
* Mobilization Activity
* External Deployments
* Residual Posture
* Logistics
* Air Activity
* Command Integration
* Border Incidents
* NATO Posture

The scoring formula must be publicly documented and open-source.

Do not introduce this until enough historical and contemporary data exists to create a defensible baseline.

⸻

24. Event Data Model

Create a structured event schema.

Suggested fields:

event_id
event_date
reported_date
headline
summary
actor
country
region
location_name
latitude
longitude
event_type
event_subtype
exercise_name
exercise_status
unit_name
unit_type
unit_home_location
personnel_estimate
equipment_type
equipment_quantity
activity_description
source_name
source_url
source_type
source_country
source_language
source_reliability
confidence_level
first_reported
last_updated
announced_start_date
announced_end_date
observed_start_date
observed_end_date
personnel_return_status
equipment_return_status
infrastructure_status
follow_on_activity
historical_analogue
historical_notes
ai_generated_summary
human_reviewed
created_at
updated_at

⸻

25. Event Taxonomy

Use a controlled taxonomy.

Initial categories:

EXERCISE
READINESS_CHECK
MOBILIZATION
TROOP_MOVEMENT
EQUIPMENT_MOVEMENT
RAIL_ACTIVITY
LOGISTICS
AIR_ACTIVITY
NAVAL_ACTIVITY
AIR_DEFENSE
MISSILE_ACTIVITY
ENGINEERING
AIRFIELD_ACTIVITY
COMMAND_CONTROL
ELECTRONIC_WARFARE
BORDER_INCIDENT
AIRSPACE_VIOLATION
DRONE_ACTIVITY
NATO_REINFORCEMENT
RUSSIAN_DEPLOYMENT
BELARUSIAN_DEPLOYMENT
INFRASTRUCTURE
OFFICIAL_WARNING
POLITICAL_SIGNALING

⸻

26. Source Hierarchy

Sources should be clearly labeled.

Do not treat all sources equally.

⸻

Tier 1 — Official Primary Sources

Examples:

Lithuania

* Ministry of National Defence
* Lithuanian Armed Forces
* State Border Guard Service
* VSD threat assessments

Poland

* Ministry of National Defence
* Polish Armed Forces Operational Command
* Government Security Centre
* Border Guard

Latvia / Estonia

* defense ministries
* armed forces
* border authorities
* national intelligence threat assessments

NATO

* NATO
* SHAPE
* Allied Air Command
* NATO battlegroups

Russia / Belarus

Also collect:

* Russian Ministry of Defence
* Belarusian Ministry of Defence
* Baltic Fleet
* official regional statements

These should be clearly labeled:

State / official source

Their claims should not automatically be treated as independently verified.

⸻

27. Tier 2 — Independent Analytical Sources

Examples:

* OSW
* iSANS
* ISW
* RUSI
* IISS
* CSIS
* CEPA
* Chatham House

⸻

28. Tier 3 — Major Journalism

Examples:

* Reuters
* AP
* BBC
* major Baltic outlets
* major Polish outlets
* major Lithuanian outlets

⸻

29. Tier 4 — OSINT

Use vetted accounts and communities only.

Prefer OSINT supported by:

* imagery
* geolocation
* satellite evidence
* flight tracking
* rail tracking
* reproducible public evidence

Do NOT automatically publish anonymous Telegram, Discord, Reddit, or X claims as verified facts.

Use them as leads.

⸻

30. AI-Assisted Daily Workflow

Use Claude through the Anthropic API.

The system should run once every 24 hours.

The general process:

COLLECT
↓
NORMALIZE
↓
EXTRACT EVENTS
↓
DEDUPLICATE
↓
CROSS-CHECK
↓
DETECT CONTRADICTIONS
↓
CLASSIFY SOURCE
↓
ASSESS CONFIDENCE
↓
COMPARE HISTORICALLY
↓
HUMAN REVIEW
↓
PUBLISH
↓
GENERATE DAILY DIGEST

⸻

31. Step 1 — Collection

Collect material published during the previous 24 hours.

Possible methods:

* RSS
* APIs
* permitted scraping
* official feeds
* manually curated source lists

Store the raw source text and metadata.

⸻

32. Step 2 — Event Extraction

Claude should extract candidate events into structured JSON.

Example:

{
  "date": "2026-10-01",
  "actor": "Belarus",
  "location": "Grodno Oblast",
  "category": "READINESS_CHECK",
  "units": ["Western Operational Command"],
  "activity": [
    "command and control",
    "mobilization",
    "air defense"
  ],
  "exercise_status": "ongoing",
  "return_status": "unknown",
  "source_type": "official",
  "confidence": "high"
}

⸻

33. Step 3 — Deduplication

Multiple outlets may report the same event.

The system should identify likely duplicate reporting and attach multiple sources to one event rather than create multiple events.

⸻

34. Step 4 — Contradiction Detection

Claude should identify conflicting reports.

Example:

Source A:

Exercise concluded September 18.

Source B:

Exercise activity continued September 19.

The system should:

* flag the discrepancy
* preserve both sources
* avoid forcing an unsupported conclusion
* send the event to review

⸻

35. Step 5 — Source Classification

Claude should label the source as:

OFFICIAL_GOVERNMENT
OFFICIAL_MILITARY
INDEPENDENT_ANALYSIS
ESTABLISHED_MEDIA
OSINT
UNKNOWN

⸻

36. Step 6 — Confidence Assessment

Suggested labels:

CONFIRMED

Supported by multiple reliable sources or strong primary evidence.

HIGH CONFIDENCE

Strong primary source or multiple partial confirmations.

MODERATE CONFIDENCE

Credible but incomplete evidence.

UNVERIFIED

Insufficient independent confirmation.

Do not present speculative claims as established facts.

⸻

37. Step 7 — Historical Comparison

Claude should compare current events against the historical database.

Questions:

* Was similar activity recorded in January-February 2021?
* Is the current activity within the established 2026 baseline?
* Is exercise frequency increasing?
* Are external Russian forces appearing?
* Is Russian participation in Belarus increasing?
* Are exercises chaining together?
* Is equipment remaining?
* Is logistics infrastructure expanding?
* Is the post-exercise baseline ratcheting upward?

Example output:

Similar readiness activity occurred in January 2021 during simultaneous exercises across Belarus, Kaliningrad and western Russia. However, unlike the later March-April 2021 phase, no comparable external Russian force concentration is currently verified.

⸻

38. Step 8 — Human Review

For the MVP, AI should NOT automatically publish everything.

Create an admin moderation dashboard.

Each candidate event goes into:

Pending Review

Admin actions:

* approve
* edit
* reject
* merge
* attach additional source
* change confidence
* adjust category
* update reset status
* add historical context

Only approved events become public.

Automation can increase later.

⸻

39. Daily Digest Generation

After event review, Claude should generate a daily digest.

The digest should follow a consistent structure.

Tone:

* analytical
* neutral
* restrained
* factual
* non-sensational

Avoid language such as:

* WWIII
* invasion imminent
* attack likely
* war is coming

unless directly quoting a credible source.

⸻

40. Public AI Methodology Disclosure

The site should openly disclose AI usage.

Suggested wording:

Digests are compiled every 24 hours with AI assistance under a fixed procedure involving collection of recent reporting, structured event extraction, deduplication, contradiction detection, source classification, historical comparison, and editorial review.

Also state:

AI does not independently determine whether claims are true. Source provenance and supporting evidence remain attached to every published event.

And:

Historical comparisons identify similarities and differences in observable activity. They are not forecasts of future political or military outcomes.

⸻

41. Open Methodology

Create a public methodology page explaining:

* monitored sources
* data collection
* event selection
* event taxonomy
* Claude’s role
* human review
* duplicate handling
* contradiction handling
* source hierarchy
* confidence labels
* reset methodology
* Activity Index methodology
* historical comparison methodology
* known limitations

⸻

42. Open-Source Principles

Repository should be public.

Potential licenses:

* MIT
* Apache 2.0

Possible structure:

/apps
  /web
  /admin
/packages
  /database
  /ui
  /shared
/workers
  /collector
  /extractor
  /deduplication
  /digest
  /historical-comparison
/data
  /sources
  /taxonomy
  /historical
/docs
  methodology.md
  scoring.md
  sources.md
  contributing.md

⸻

43. Recommended Tech Stack

Frontend:

Next.js

Language:

TypeScript

UI:

Tailwind CSS + shadcn/ui

Database:

PostgreSQL

Database hosting:

Supabase or Neon

Geospatial:

PostGIS

Maps:

MapLibre + OpenStreetMap

AI:

Anthropic Claude API

Workers:

Python

Scheduling:

* GitHub Actions
* Supabase scheduled functions
* server cron
* another reliable scheduler

Hosting:

Vercel

⸻

44. 24-Hour Update Cycle

The project should update every 24 hours.

Example:

00:00 UTC
Begin source collection
00:10–00:30
Normalize and process new documents
00:30
Run event extraction
00:40
Deduplication
00:50
Contradiction detection
01:00
Historical comparison
01:10
Populate moderation queue
After approval
Publish new events
Then
Generate daily digest
Update activity metrics
Update map
Update historical comparison

Exact timing can change.

The important point is one reliable daily cycle.

⸻

45. Visual Design Direction

The site should take inspiration from the information-dense and research-oriented nature of Baltic Monitor.

However:

Do NOT copy Baltic Monitor’s:

* page structure exactly
* visual identity
* typography
* component design
* card design
* branding
* article layout

The site should feel clearly original.

Baltic Monitor feels primarily like a text-forward analytical publication.

Northeast Flank Monitor should feel more like:

an open-source geopolitical intelligence dashboard

⸻

46. Visual Personality

The visual personality should be:

* analytical
* modern
* cyber-inspired
* credible
* restrained
* data-driven
* slightly futuristic
* professional

It should NOT feel like:

* a gaming UI
* military simulator
* crypto dashboard
* Hollywood hacker terminal
* generic SaaS analytics dashboard
* alarmist war tracker

Think:

professional intelligence workstation

⸻

47. Core Color Palette

Use this palette:

--teal-blue: #00738b;
--slate-indigo: #455378;
--forest-green: #0f633f;
--operational-teal: #008574;
--deep-navy: #1a1e4f;

Recommended supporting colors:

--background-dark: #0b1020;
--surface-dark: #11172a;
--surface-raised: #171d33;
--text-primary: #f4f7fb;
--text-secondary: #aeb8c8;
--text-muted: #748096;
--border: rgba(130, 160, 185, 0.18);

⸻

48. Color Use

#1a1e4f

Use for:

* deep brand accents
* major panels
* header elements
* selected surfaces

#00738b

Use for:

* interactive elements
* links
* active navigation
* chart accents
* map selection

#008574

Use for:

* verified
* active operational states
* successful confirmation

#0f633f

Use for:

* completed
* stable
* confirmed reset states

#455378

Use for:

* secondary panels
* muted state
* inactive UI
* supporting charts

Do NOT use:

* red = Russia
* blue = NATO
* green = friendly

Color should represent status or category, not political alignment.

⸻

49. Dark Mode

The primary visual experience should be dark mode.

Main background:

#0b1020

Use raised surfaces and thin borders.

Do not make every panel the same shade.

⸻

50. Cyber Styling

Use cyber styling subtly.

Allowed:

* faint background grid
* thin 1px borders
* restrained teal glow
* small live indicator
* map crosshair motifs
* scanning animation
* data-stream loading state
* subtle noise texture
* technical metadata labels

Avoid:

* neon everywhere
* Matrix rain
* glowing every card
* giant warning icons
* hacker clichés
* lime-green-on-black terminal design

⸻

51. Typography

Primary fonts:

* Inter
* Geist
* IBM Plex Sans

Metadata / technical font:

* IBM Plex Mono
* Geist Mono
* JetBrains Mono

Use monospace only for:

* timestamps
* coordinates
* IDs
* metrics
* technical metadata

Do NOT use monospace for all body copy.

⸻

52. Header Design

Header:

NORTHEAST FLANK MONITOR

Subtitle:

Open-source monitoring of military activity across NATO’s northeastern flank.

Right side:

LAST UPDATE
01 OCT 2026 · 12:00 UTC

Include a small teal status indicator.

Navigation:

LATEST
MAP
EXERCISES
AIR ACTIVITY
HISTORICAL COMPARE
ARCHIVE
SOURCES
METHODOLOGY

Active navigation should use a teal underline or subtle glow.

⸻

53. Small Metadata Labels

Use uppercase labels such as:

STATUS
SOURCE
CONFIDENCE
ACTOR
LOCATION
CATEGORY
UPDATED
RESET

These should help create the intelligence-dashboard feel.

⸻

54. Responsive Layout

Desktop:

Use a 12-column grid.

Suggested structure:

Status        5 columns
Snapshot      7 columns
Map           12 columns
Events        8 columns
Historical    4 columns
Exercises     12 columns
Trend         7 columns
Reset         5 columns

Tablet:

Two-column where possible.

Mobile:

Single-column monitoring feed.

⸻

55. Site Differentiation

The site may share high-level concepts with Baltic Monitor:

* daily monitoring
* methodology
* source transparency
* exercise tracking
* historical analysis

But Northeast Flank Monitor should emphasize:

* interactive regional map
* structured event database
* historical comparison dashboard
* post-exercise reset tracking
* data timelines
* source confidence
* longitudinal trend analysis
* downloadable datasets
* open API

This should make it feel like a platform rather than a digital publication.

⸻

56. Historical Comparison as Brand Identity

One of the project’s most distinctive features should be:

2021 ↔ Current

The site should allow users to examine:

* January 2021
* March-April 2021
* Zapad-2021
* Autumn 2021
* February 2022

against current events.

The most important conceptual rule:

Similar historical behavior does not imply identical future outcomes.

⸻

57. Archive

Allow browsing by:

* date
* country
* actor
* event category
* exercise
* location
* confidence
* source type

Historical event URLs should be persistent.

⸻

58. Open API

Long-term goal:

Expose a public read-only API.

Example:

/api/events?region=kaliningrad
/start=2026-01-01
/type=AIR_ACTIVITY

Support:

* JSON
* CSV export

Eventually allow researchers to download the historical dataset.

⸻

59. Data May Become the Core Product

Treat the structured dataset as a first-class product.

The site is not merely a presentation layer.

The long-term value may come from having a clean historical dataset containing:

* event
* actor
* location
* exercise
* units
* equipment
* source
* verification
* reset state
* follow-on activity
* historical context

⸻

60. Safety and Operational Precision

Do not publish sensitive real-time tactical information that could create operational security risks.

Prefer:

* already public official information
* delayed data
* generalized locations
* publicly known installations
* historical movements
* post-event analysis

Do not turn the site into a real-time tactical targeting tool.

⸻

61. MVP Strategy

Do not build everything at once.

⸻

Phase 1 — Foundation

Build:

* Next.js app
* database
* event schema
* source registry
* admin dashboard
* manual event creation
* homepage
* daily digest page
* basic archive

No automated scraping yet.

⸻

Phase 2 — Initial Automation

Add approximately 5–10 reliable sources.

Examples:

* Lithuanian MOD
* Lithuanian Armed Forces
* Polish MOD
* NATO
* iSANS
* OSW
* Reuters

Add:

* source collector
* Claude extraction
* deduplication
* moderation queue

⸻

Phase 3 — Monitoring Features

Add:

* interactive map
* exercise tracker
* air activity page
* post-exercise reset
* event filtering

⸻

Phase 4 — Historical Dataset

Start with:

January–April 2021

Then expand:

* backward to August 2020
* forward to February 2022

⸻

Phase 5 — Historical Compare

Build:

2021 ↔ Current

Include:

* synchronized timelines
* indicator matrix
* historical analogues
* similarity/difference summaries

⸻

Phase 6 — Activity Index

Only after enough data exists.

Add:

Northeast Flank Activity Index

with open scoring methodology.

⸻

Phase 7 — Public Data Tools

Add:

* CSV download
* JSON API
* source export
* public methodology
* contributor documentation

⸻

62. Initial Task for Claude

Do NOT immediately generate the complete website.

Start by reviewing this specification.

Then provide:

1. Proposed system architecture
2. Proposed PostgreSQL schema
3. Recommended repository structure
4. Recommended MVP scope
5. Risks or methodological weaknesses
6. Data-ingestion approach
7. Recommended approach for 24-hour scheduling
8. Recommended Claude extraction architecture
9. Historical-data architecture
10. Map architecture
11. Admin moderation workflow
12. UI component system
13. Page-by-page wireframe description
14. Cost-conscious hosting plan
15. Step-by-step implementation roadmap

Important:

Do not overengineer the MVP.

Prefer inexpensive or free infrastructure where practical.

Before writing large amounts of code, explain the architecture and implementation sequence.

⸻

63. Project Identity

Project:

Northeast Flank Monitor

Possible subtitle:

Independent open-source monitoring of military activity across Kaliningrad, Belarus, Poland and the Baltic states.

Alternative:

Tracking changes in the military baseline across NATO’s northeastern flank.

Core question:

Is the regional military baseline changing?

Core analytical principle:

Observe behavior. Track the baseline. Compare historically. Do not predict intent.

Core differentiators:

* daily AI-assisted digest
* transparent sources
* historical comparison
* post-exercise reset tracking
* structured military event database
* regional map
* exercise tracking
* open methodology
* open-source code
* downloadable data