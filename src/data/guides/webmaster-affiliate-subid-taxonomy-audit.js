export default {
  "slug": "webmaster-affiliate-subid-taxonomy-audit",
  "categorySlug": "webmaster-affiliate",
  "categoryLabel": "Webmaster / Affiliate",
  "title": "Affiliate Sub-ID Naming: Build a Campaign Tagging System You Can Reconcile",
  "description": "Create a consistent affiliate sub-ID and campaign-tagging convention to distinguish placements, traffic sources, and tests without exposing sensitive data or breaking reporting.",
  "excerpt": "A tracking label is useful only when your team can interpret it later. Build a compact naming scheme that supports reporting, privacy, and troubleshooting without confusing tags with attribution guarantees.",
  "publishedAt": "2026-10-12",
  "updatedAt": "2026-10-12",
  "keyTakeaways": [
    "Use a small, documented set of fields for site, placement, and experiment rather than inventing labels ad hoc.",
    "Verify which tracking parameters a program accepts and how they appear in reports before deployment.",
    "Keep personal or sensitive data out of sub-IDs and URLs.",
    "Version naming rules and preserve a mapping so historical reports remain interpretable.",
    "Use tags to organize evidence; do not treat them as proof that a referral was credited correctly."
  ],
  "sections": [
    {
      "heading": "Define the reporting question before the tag",
      "paragraphs": [
        "Sub-IDs and campaign labels are most useful when they answer an operational question. You may want to distinguish a site section, a link placement, a creative variation, or a time-bounded test. If every label tries to encode all possible details, it becomes difficult to maintain and easy to misread. Start with the decisions you need reports to support.",
        "Write down the fields you actually need. A compact structure might identify the property, content area, placement type, and experiment version, using your own neutral codes. The exact fields depend on your operation and the program’s tracking rules. Avoid building a naming system around data that cannot be reported or that you do not need.",
        "Treat a tag as a label attached to a referral, not as a promise about how attribution works. Attribution rules, referral windows, and reporting behavior must be verified in the program’s current documentation. A well-formed identifier cannot compensate for an unverified tracking setup."
      ],
      "table": {
        "caption": "Example structure using neutral internal codes",
        "headers": [
          "Field",
          "Purpose",
          "Example pattern"
        ],
        "rows": [
          [
            "Property",
            "Distinguishes a site or owned property",
            "siteA"
          ],
          [
            "Section",
            "Identifies the content area",
            "guide"
          ],
          [
            "Placement",
            "Identifies the link position or type",
            "inline"
          ],
          [
            "Version",
            "Separates a documented test variant",
            "v02"
          ]
        ]
      }
    },
    {
      "heading": "Check parameter support before rollout",
      "paragraphs": [
        "Affiliate systems may use different parameter names, accepted formats, length limits, or reporting locations. Confirm the exact requirements in current program documentation or through an official support channel. Do not assume that a parameter accepted in a URL is stored, reported, or used in the same way by every program.",
        "Test with a controlled process before applying the convention across a site. Confirm that the destination URL still works, the identifier survives any documented redirect path, and the reporting interface displays the value in the expected place. Use the program’s approved testing approach and avoid generating artificial conversions or other activity that violates its rules.",
        "Record the test date, relevant account or program identifier, destination, and observed result. If a tag is missing or transformed, investigate before scaling. A small validation step is easier to resolve than a large set of reports built on labels that were never captured."
      ],
      "bullets": [
        "Verify accepted parameter names and formatting limits.",
        "Check whether tags are visible in reports and how they are grouped.",
        "Document the test process without creating prohibited or misleading activity."
      ]
    },
    {
      "heading": "Keep labels stable, safe, and interpretable",
      "paragraphs": [
        "A naming convention should be readable by someone other than the person who created it. Use a short glossary, consistent separators, and a defined order for fields. Avoid ambiguous abbreviations that could mean multiple things. If your team changes a code, document the effective date and preserve the old mapping for historical records.",
        "Never place personal information, email addresses, customer details, or other sensitive data in a sub-ID or URL. URLs may appear in browser histories, referrer data, logs, analytics tools, screenshots, and reports. Use non-identifying internal codes and restrict access to the mapping document when it reveals business-sensitive information.",
        "Keep tags within the program’s permitted use. A sub-ID convention should not be used to conceal prohibited traffic, misrepresent a source, or evade program restrictions. Review the program’s rules on traffic types, link modification, and disclosure, and ask for clarification if your intended tagging approach is not clearly covered."
      ]
    },
    {
      "heading": "Separate tagging from attribution and reconciliation",
      "paragraphs": [
        "Tags help segment activity; they do not explain every discrepancy between clicks, conversions, and statements. A report may use its own definitions, processing periods, attribution rules, or filters. Compare the program’s documentation with your own records and avoid drawing conclusions from a single tag or dashboard view.",
        "When a discrepancy appears, investigate the chain in order: confirm the link and parameters, review the reported click data, check the reporting period and attribution rules, then compare conversion or statement records. Keep a record of the question and any official response. This makes troubleshooting more precise without implying that every difference signals an error.",
        "Use a stable identifier for recurring placements and a distinct version for a genuine test. If you change several things at once, the labels may show where traffic came from but not which change caused a difference. Maintain a test log with dates, hypotheses, placements, and changes so the report can be interpreted in context."
      ],
      "bullets": [
        "Use tags for source organization, not as a substitute for program attribution documentation.",
        "Reconcile reports using consistent periods and the program’s stated definitions.",
        "Record the exact changes made during a test."
      ]
    },
    {
      "heading": "Set governance for teams and historical reports",
      "paragraphs": [
        "A tagging system usually fails through inconsistent use rather than lack of complexity. Assign responsibility for maintaining the convention and require new labels to follow the documented pattern. Give collaborators a short reference with examples, prohibited data, and the process for requesting a new field or code.",
        "Keep a change log. Record when a naming rule is introduced, revised, or retired, and identify which links are affected. Do not silently repurpose an old code for a new campaign; that can make older reporting appear to describe something it did not. Where a program allows multiple tracking values, document which one is authoritative for each reporting question.",
        "Review the scheme when sites, programs, traffic sources, or reporting needs change. Retire unused labels deliberately, while preserving their historical definitions. The best system is small enough to apply consistently and detailed enough to answer defined operational questions."
      ]
    }
  ],
  "faqs": [
    {
      "question": "Does a sub-ID prove that a conversion was attributed to my link?",
      "answer": "No. A sub-ID can help organize reported activity, but attribution depends on the program’s tracking rules and systems. Verify how the program handles referrals and how the value appears in its reports."
    },
    {
      "question": "What information should never go in a sub-ID?",
      "answer": "Avoid personal data, customer details, email addresses, or other sensitive information. URLs and tracking values can be exposed in logs, browser histories, analytics, and reports. Use neutral internal codes instead."
    },
    {
      "question": "How many fields should a naming convention contain?",
      "answer": "Use only the fields needed to answer defined reporting questions. A short, documented convention is generally easier to apply and interpret than a long string that encodes details your reports cannot use."
    }
  ]
};
