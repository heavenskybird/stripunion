export default {
  "slug": "affiliate-reporting-timezone-and-conversion-date-comparison",
  "categorySlug": "webmaster-affiliate",
  "categoryLabel": "Webmaster / Affiliate",
  "title": "Affiliate Reporting: Compare Time Zones and Conversion-Date Definitions",
  "description": "A webmaster workflow for comparing affiliate dashboards by time zone, reporting dates, delayed conversions, and the definitions behind daily totals.",
  "excerpt": "Daily affiliate reports can disagree because they group events by different dates or time zones. Compare the reporting rules before treating a dashboard variance as a tracking failure or payout issue.",
  "publishedAt": "2026-10-15",
  "updatedAt": "2026-10-15",
  "keyTakeaways": [
    "A report date may refer to the click, conversion, approval, or update date; confirm the program’s definition.",
    "Time zone and day-boundary differences can shift activity between adjacent reporting dates.",
    "Delayed or revised conversion records can make early daily totals differ from later reports.",
    "Keep raw exports, report settings, and review timestamps so comparisons can be repeated.",
    "Reconcile only like-for-like fields and periods before escalating a discrepancy."
  ],
  "sections": [
    {
      "heading": "Why daily totals may not describe the same period",
      "paragraphs": [
        "A consistent process is useful for routine operations, finance review, and incident investigation. It helps teams avoid changing tracking links or campaigns based solely on adjacent-day differences. It also creates better evidence when you need to ask a program contact what a dashboard field means."
      ]
    },
    {
      "heading": "Document date fields and time-zone settings",
      "paragraphs": [
        "Start by listing the date fields available in reports and exports. Look for labels such as click date, conversion date, transaction date, approval date, or last-updated date, but do not assume their meaning from the label alone. Read the program’s documentation or ask its support contact for a definition. Record whether a date is based on the visitor event, the program’s system time, or another stated convention.",
        "Then find the dashboard time zone and any setting that changes the displayed range. Some systems may show a calendar date without making the underlying time zone obvious. Note the selected zone, the start and end of the reporting day, and whether the interface uses inclusive or exclusive date boundaries. If the zone cannot be confirmed, keep the reports separate rather than forcing a direct daily comparison."
      ],
      "table": {
        "caption": "Fields to document before comparing affiliate reports",
        "headers": [
          "Field or setting",
          "Question to answer",
          "Why it matters"
        ],
        "rows": [
          [
            "Report date",
            "Which event does this date represent?",
            "Determines which day receives a record"
          ],
          [
            "Time zone",
            "What zone governs the report and day boundary?",
            "Can shift events between adjacent dates"
          ],
          [
            "Status",
            "Are records pending, approved, reversed, or updated?",
            "Totals may change as records move through states"
          ],
          [
            "Update timestamp",
            "When was the report generated or refreshed?",
            "Shows whether two exports reflect the same data moment"
          ],
          [
            "Date range",
            "How are start and end dates interpreted?",
            "Prevents comparing different periods unintentionally"
          ]
        ]
      }
    },
    {
      "heading": "Separate event time from reporting time",
      "paragraphs": [
        "Avoid comparing a dashboard total with a payment statement as though both measure the same stage. A report may count recorded conversions while a statement reflects a different financial status or period. Review the program’s definitions and payout documentation separately, and label each figure according to what it represents. This prevents a reporting-date issue from being mistaken for a commission calculation question."
      ]
    },
    {
      "heading": "Build a repeatable reconciliation workflow",
      "paragraphs": [
        "Choose a reporting period that includes enough surrounding time to reveal records crossing a day boundary. Export the same fields from each source, use the same status filters where possible, and note each report’s generation time. If one source permits a time-zone adjustment, document the selected setting before exporting. Keep an unchanged copy of each file and work from a separate analysis copy so the comparison remains reproducible.",
        "Compare totals only after aligning the field definition, time zone, status, and date range. Where individual records can be matched using permitted identifiers, compare those records without exposing personal data unnecessarily. If the sources do not share a safe matching key, avoid trying to reconstruct identities. Instead, report the aggregate difference and the definitions you were able to verify. The goal is a precise question, not an assumption about fault."
      ],
      "bullets": [
        "Capture the dashboard name, report range, time zone, filters, and export time.",
        "Keep the original report file and a note describing any transformation.",
        "Compare matching statuses and date definitions before calculating a variance.",
        "Escalate unresolved definitions with a concise example and no unnecessary personal data."
      ]
    },
    {
      "heading": "Escalate discrepancies with evidence, not assumptions",
      "paragraphs": [
        "A useful final comparison has a clear distinction between known definitions, observed differences, and open questions. For example, note that two reports use different confirmed time zones, while the meaning of one conversion-date field remains unverified. This is more actionable than calling the dashboards inconsistent without describing the conditions. Repeat the process at the same cadence if the reporting arrangement changes, and retain the documentation needed to interpret past exports."
      ]
    }
  ],
  "faqs": [
    {
      "question": "Why can two affiliate reports show different totals for the same date?",
      "answer": "They may use different time zones, date boundaries, event-date definitions, status filters, or data-refresh times. Compare those settings and definitions before interpreting the difference as a tracking issue."
    },
    {
      "question": "Should I convert all reports to my local time zone?",
      "answer": "Only if you can do so consistently and preserve the original source settings. First confirm the source time zone and the underlying event timestamps or date definitions. A conversion cannot correct an unknown reporting convention."
    },
    {
      "question": "What should I include in a discrepancy request to a program?",
      "answer": "Include the report period, field names, time zone, status filters, export timestamps, and a concise description of the mismatch. Ask which date or status rule governs the field. Avoid sending passwords, unnecessary visitor data, or unredacted personal information."
    }
  ]
};
