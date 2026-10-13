export default {
  "slug": "affiliate-dashboard-report-definitions-audit",
  "categorySlug": "webmaster-affiliate",
  "categoryLabel": "Webmaster / Affiliate",
  "title": "Affiliate Dashboards: Verify Metric Definitions Before Comparing Programs",
  "description": "A webmaster checklist for checking how affiliate dashboards define clicks, referrals, conversions, and reporting dates before comparing programs or making campaign decisions.",
  "excerpt": "Affiliate reports are only comparable when their metric definitions and reporting windows are understood. Use this audit to document what each dashboard actually counts.",
  "publishedAt": "2026-10-13",
  "updatedAt": "2026-10-13",
  "keyTakeaways": [
    "Do not compare dashboard totals until you know how each program defines its metrics.",
    "Check date boundaries, time zones, attribution windows, and reporting delays in the documentation.",
    "Separate raw clicks, unique visits, attributed referrals, and approved outcomes where those fields are available.",
    "Record changes in report definitions so historical comparisons do not silently mix unlike measures.",
    "Use dashboard data alongside program terms and reconciliation records, not as a substitute for either."
  ],
  "sections": [
    {
      "heading": "Start with definitions, not headline totals",
      "paragraphs": [
        "Affiliate dashboards can present similar-looking numbers that do not represent the same event. One report may count a click each time a tracked link is opened; another may apply a filter or use a different definition. Referral, registration, conversion, and approved transaction fields can also have distinct meanings. Before comparing programs or campaign periods, find the documentation that defines each metric and write down the exact wording.",
        "A total is not self-explanatory. It may be affected by duplicate visits, invalid traffic handling, device changes, attribution rules, or later review. Avoid describing a metric as a sale, signup, or commission unless the dashboard and program terms support that interpretation. This is especially important when combining data from different programs in one spreadsheet: matching column names do not prove matching definitions."
      ],
      "bullets": [
        "Save each program’s current metric definitions or help-page reference.",
        "Use separate columns for clicks, visits, referrals, and outcomes rather than combining them.",
        "Label any field whose meaning or approval status is not clear."
      ]
    },
    {
      "heading": "Check time windows and reporting delays",
      "paragraphs": [
        "Reporting dates can differ because of time zones, cutoff times, delayed processing, or the way a dashboard assigns an event to a date. A click may be recorded immediately while a later outcome appears after review. Before comparing a daily or weekly total, identify the reporting time zone and whether the report uses click date, conversion date, approval date, or another event date.",
        "Also check for stated reporting delays and revision practices. A recent period may be incomplete even if the dashboard displays a final-looking number. If the program does not explain when data is considered stable, avoid treating the latest figures as final. Use consistent date ranges and, where appropriate, wait for the relevant reporting cycle to settle before reconciling. Do not invent a universal waiting period; follow the program’s own documentation and record uncertainty."
      ],
      "table": {
        "caption": "Dashboard fields to define before analysis",
        "headers": [
          "Field or rule",
          "Questions to answer",
          "Record in your notes"
        ],
        "rows": [
          [
            "Click",
            "What event is counted? Are repeat clicks included or filtered?",
            "Definition and any stated filtering rules."
          ],
          [
            "Referral or registration",
            "What action qualifies, and when is it recorded?",
            "Event description and attribution basis."
          ],
          [
            "Conversion or transaction",
            "Is it pending, approved, reversed, or final?",
            "Status meanings and revision process."
          ],
          [
            "Reporting date",
            "Which time zone and event date determine the day?",
            "Time zone, cutoff, and date basis."
          ],
          [
            "Attribution window",
            "How long can a referral receive credit?",
            "Documented window and any limits."
          ],
          [
            "Payout or commission field",
            "Which terms determine calculation and approval?",
            "Link to current program terms, not an assumed formula."
          ]
        ]
      }
    },
    {
      "heading": "Compare attribution and filtering carefully",
      "paragraphs": [
        "When using campaign identifiers or sub-IDs, confirm how those values appear in reports and whether their definitions are stable. Keep naming consistent and avoid changing identifiers mid-test without documenting the change. If a dashboard groups or truncates values, note that limitation before drawing a conclusion about which page or placement performed differently."
      ]
    },
    {
      "heading": "Build a reconciliation record that preserves context",
      "paragraphs": [
        "A useful reconciliation record includes the report date, the selected date range, time zone, metric definitions, filters, campaign identifiers, and any observed revisions. Save the source report or export where permitted, then record the date it was retrieved. This provides context if the program later updates a figure or changes a report interface. Respect the program’s data and privacy terms when saving or sharing exports.",
        "Reconciliation is not simply forcing every number to match. Your website analytics and an affiliate dashboard may measure different events, use different consent or filtering rules, or observe different steps in a visitor journey. Compare what each system can validly show. If there is a material discrepancy, document the question and contact the program through its stated support process, supplying only the information needed to investigate."
      ],
      "bullets": [
        "Record report filters and the retrieval date with each export.",
        "Keep pending, approved, reversed, or otherwise distinct statuses separate.",
        "Write down whether a comparison uses click date, referral date, or another event date."
      ]
    },
    {
      "heading": "Use verified metrics for decisions, not unsupported projections",
      "paragraphs": [
        "For teams, assign responsibility for maintaining the metric dictionary and confirming changes. A short shared reference with the field name, program, definition, time zone, and last checked date can prevent duplicated work. Limit access to reporting exports to people who need them, and follow applicable privacy, contractual, and record-retention requirements. The goal is a defensible interpretation of the available data—not a more impressive-looking dashboard."
      ]
    }
  ],
  "faqs": [
    {
      "question": "Can I compare clicks from two affiliate dashboards directly?",
      "answer": "Only after checking how each program defines clicks, handles repeats or filtering, and assigns reporting dates. Similar field names do not ensure that the underlying events are comparable."
    },
    {
      "question": "Why can a recent report change later?",
      "answer": "Some programs may process, review, or revise events after the initial report appears. Check the program’s documentation for reporting delays and revision practices, and mark recent data as provisional when appropriate."
    },
    {
      "question": "Should my website analytics match an affiliate dashboard?",
      "answer": "Not necessarily. The systems may count different events, apply different filters, or use different attribution and privacy rules. Compare their definitions before treating a difference as an error."
    },
    {
      "question": "What should I do when a metric is not defined?",
      "answer": "Do not guess. Record it as unclear, consult the program’s documentation, and request clarification through an official support channel before using it to compare campaigns or make a significant decision."
    }
  ]
};
