# Session Ledger

## 2026-04-16

- Worked on: dashboard UX, continuity setup, isolated project rule, user stats, upstream audit baseline.
- Finished with:
  - interactive traffic chart live on dashboard;
  - isolated project rule embedded in repo;
  - continuity docs created;
  - local session-entry and session-close laws documented;
  - user detail page upgraded with traffic, devices, and node coverage;
  - fresh upstream divergence snapshot captured.
- Next step:
  - resolve the persistent layout/page-drift bug before shipping more shell changes;
  - review the paused local CSS patch in `public/css/style.css`;
  - then continue with node attribution, rebrand cleanup, and upstream triage.

- Additional note:
  - the previously paused CSS diff was finished, committed, and deployed;
  - next session should verify whether the live stand still has any drifting page after the shell rewrite.

- Late update:
  - added another shell-boundary pass for the persistent right-edge drift;
  - localized dashboard hero/topbar/theme/sidebar strings that were still hardcoded;
  - latest live verification is still pending from the deployed stand.

- Stop-point update:
  - user added a new batch of shell/UI requests during an unfinished redesign pass;
  - these were not finished or deployed and were intentionally captured for the next session instead;
  - there is now an active uncommitted patch set in:
    - `public/css/style.css`
    - `views/dashboard.ejs`
    - `views/layout.ejs`
    - `views/users.ejs`
- Next step:
  - review the uncommitted patch set first;
  - then fix sidebar full-height behavior and remaining shell drift;
  - then continue with topbar controls, background texture, users-list actions, accent-color cleanup, and HAPP theme defaults.

- Current local progress:
  - sidebar full-height behavior is being adjusted in CSS;
  - theme switcher is moving toward icon-only controls;
  - background texture is being changed toward paper-noise;
  - user-detail unlimited traffic display is being changed to `∞`.

- Follow-up progress:
  - sidebar now has an inner sticky layer intended to keep the column full-height on long pages;
  - users list actions were expanded and visually clarified;
  - HAPP settings now ship with a dark default color profile plus light/dark preset buttons;
  - next step is live verification on the stand and then another responsive/layout pass where needed.

- Shell continuation:
  - added JS-based shell height syncing for the sidebar/content relationship;
  - removed width-containment from core shell containers to further reduce drift risk;
  - continued rebrand cleanup in frontend storage keys and MCP-visible names.
- Stats continuation:
  - added a real users-activity chart to the statistics page using snapshot-backed user counts;
  - new API path: `/panel/stats/api/users`.
- Next step:
  - deploy and verify whether the sidebar now truly reaches the bottom on long pages;
  - re-test page transitions for remaining drift;
  - only then continue with the next responsive/UI pass.

- Stats/detail refinement:
  - renamed user-detail stats toward clearer operator language;
  - enlarged only the unlimited `∞` indicator;
  - made sidebar footer controls sticky;
  - added `24h / 48h` heatmap switching;
  - added cumulative profile growth to the registrations chart;
  - tightened shared card/header rhythm.
- Next step:
  - deploy and verify the statistics page and user detail page visually;
  - continue the broader responsive pass if any page still drifts or compresses awkwardly.

- Chart visual pass:
  - unified segmented dashboard rings to Java;
  - improved dashboard traffic chart height, texture, marker density, and resize behavior;
  - synced logs height to the right dashboard sidebar;
  - restyled statistics charts into the same Java/Deep Cove visual language;
  - shortened/versioned traffic chart cache to avoid stale `24h`/`7d` mismatches.
- Next step:
  - deploy and visually verify dashboard traffic, logs alignment, and all statistics charts on the live stand.

- Sidebar sticky fix:
  - made the desktop sidebar itself sticky to the viewport;
  - kept sidebar internals scrollable inside the viewport height.
- Next step:
  - verify long-page scrolling on dashboard/settings and confirm the sidebar no longer moves upward with page content.

- Sidebar/chart polish:
  - changed sidebar internals so the nav area scrolls independently while footer controls remain attached to the bottom;
  - kept dashboard segmented rings in the Java accent family;
  - reduced dashboard traffic markers and softened the plot texture;
  - nudged dashboard log height syncing;
  - made statistics charts cleaner and more consistent with the dashboard chart style.
- Next step:
  - deploy and visually verify sidebar footer stickiness, dashboard logs alignment, and statistics chart readability.

- Sidebar/chart correction follow-up:
  - user reported the independent nav scroll still felt wrong;
  - sidebar was moved back toward a whole-column sticky behavior;
  - dashboard traffic sparkline was reworked to be narrower/taller with a higher internal SVG canvas.
- Next step:
  - deploy and verify that the sidebar now behaves like a true fixed shell;
  - verify the dashboard traffic card no longer looks horizontally stretched.

- Sidebar/chart system correction:
  - user reported sidebar still did not feel fixed and dashboard graph quality remained poor;
  - desktop sidebar was moved from sticky to fixed viewport behavior;
  - dashboard traffic graph was migrated off the custom SVG sparkline onto Chart.js.
- Next step:
  - deploy and verify that the sidebar is fully pinned to screen;
  - visually compare dashboard graph quality against statistics-page charts and continue unification.

- Fixed-sidebar shell recovery:
  - the first fixed-sidebar pass hid the page content because the old grid/content relationship broke;
  - restored desktop content offsets and reset them correctly for mobile, so pages render again.
- Chart motion/visual continuation:
  - dashboard traffic chart now spans the full available width of the hero card;
  - dashboard and statistics charts now use stronger Chart.js animation, thicker lines, larger points, and richer plot surfaces.
- Next step:
  - deploy and verify that the sidebar stays pinned while pages render normally;
  - visually review the new dashboard/statistics chart language on the live stand;
  - then continue the remaining responsive and users/subscription polish queue.

- Mobile shell/localization continuation:
  - moved language/theme controls into the mobile menu flow;
  - made mobile overlay/menu closing explicit and locked body scroll while menu is open;
  - added Russian/English pluralization support in middleware and applied it to visible dashboard counters;
  - localized more dashboard labels and status text;
  - re-centered mobile hero metric cards and profile/device rings.
- Next step:
  - deploy and verify mobile menu clickability on Android;
  - check remaining untranslated strings on dashboard and then continue into other pages;
  - continue responsive cleanup on statistics, users, settings, and subscription.

- Dashboard recovery / cleanup continuation:
  - fixed the shared render helper so pluralization helper `tp` reaches compiled templates on live render;
  - swapped right-column dashboard cards so `Server` comes before `Quick Actions`;
  - started the double segmented ring treatment for dashboard metrics;
  - localized the settings hero and improved pluralized counts on the users page.
- Next step:
  - deploy and verify the dashboard no longer crashes on render;
  - visually check the new double-ring treatment;
  - continue the responsive/mobile cleanup across statistics, settings, and subscription page.

- Mobile/settings/subscription cleanup continuation:
  - made settings tabs horizontally scrollable on mobile instead of wrapping badly;
  - collapsed settings and subscription preview surfaces more cleanly for narrow screens;
  - improved statistics mobile chart headers/legends/heatmap overflow behavior;
  - localized remaining visible tails in dashboard period chips, subscription settings preview, backup restore buttons, and public subscription eyebrow text.
- Next step:
  - deploy and verify `Statistics`, `Settings`, and subscription-related screens on a real phone;
  - continue the remaining Russian wording pass and then return to ring/visual refinement.

- Dashboard rings / mobile menu recovery:
  - corrected the dashboard ring direction again after the live stand showed thick solid rings instead of thin segmented ones;
  - tightened the mobile shell so the menu should stop leaking clicks to the page behind it;
  - hid the mobile collapse control and converted node action controls to an icon-only 3-column layout on phones.
- Next step:
  - verify on a real phone that the menu is fully clickable and background content is no longer interactive while open;
  - visually confirm the new thin ring treatment in both themes;
  - continue the broader mobile cleanup on `Statistics`, `Users`, `Settings`, and the subscription page.

- Dashboard rings continuation:
  - replaced the intermediate ring markup with a simpler CSS pseudo-element implementation and deployed it;
  - user approved the direction but requested a more specific geometry target:
    - `80x80`,
    - `gap 5`,
    - `border width 1`;
  - started a new local-only CSS tweak to propagate that rhythm to large rings, mobile rings, and mini rings.
- Current local CSS values:
  - large rings `80x80`, `gap 5`, `border 1`, `font-size 18`;
  - mini rings `68x68`, `gap 4`, `font-size 15`;
  - mobile large rings `84x84`, `font-size 19`;
  - mobile mini rings `72x72`, `font-size 16`.
- Next step:
  - review the uncommitted `public/css/style.css` ring-size tweak first;
  - deploy only after visual confirmation of the ring proportions;
  - then return to the still-broken mobile menu accessibility.

- Dashboard follow-up cleanup:
  - normalized mini-ring sizing by removing the conflicting `soft` size override;
  - removed duplicated numeric output such as `0 0 устройств` and `из 2 2 пользователя`.
- Next step:
  - verify the two mini rings now match in size;
  - verify dashboard counts read naturally again;
  - then return to mobile menu accessibility.

- Dashboard mini-ring / label deploy pass:
  - captured and shipped the narrow fix for equal mini-ring sizing;
  - captured and shipped the cleanup for duplicated pluralized counts on dashboard labels.
- Next step:
  - verify mini rings on desktop/mobile against the live stand;
  - then continue with Android mobile menu accessibility.

- Dashboard device-stats fallback:
  - traced the remaining `0 / 0` problem in `Profiles and devices` to a metrics split between node online telemetry and Redis device activity;
  - added a dashboard-only fallback from `onlineUsers` so Xray/agent-backed sessions do not leave that card empty;
  - added a visible note when fallback estimation is being used instead of real device telemetry.
- Next step:
  - verify the dashboard card now reflects active Xray sessions more honestly;
  - then continue with Android mobile menu accessibility and later true per-device Xray attribution.

- Xray attribution continuation:
  - wired Xray agent `/stats` traffic deltas into Redis device activity;
  - active Xray users now create synthetic device entries tied to node id/name/source;
  - this gives profile/node attribution without requiring immediate cc-agent binary changes.
- Next step:
  - deploy and verify after a stats poll with real Xray traffic;
  - then continue Android mobile-menu accessibility.

- User list attribution continuation:
  - added a live activity column to the users list;
  - the list now surfaces active session count and active node hints from Redis device activity;
  - user detail now labels synthetic Xray stats sessions as profile traffic activity instead of exposing internal Redis keys.
- Next step:
  - deploy and verify the users list against a connected Xray profile;
  - confirm that the user detail page shows a readable Xray activity source and node name;
  - then continue either true per-device agent support or Android mobile-menu accessibility.
