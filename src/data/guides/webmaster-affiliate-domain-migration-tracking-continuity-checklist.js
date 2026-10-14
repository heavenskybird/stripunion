export default {
  "slug": "webmaster-affiliate-domain-migration-tracking-continuity-checklist",
  "categorySlug": "webmaster-affiliate",
  "categoryLabel": "Webmaster / Affiliate",
  "title": "Affiliate Tracking During a Website Migration: Protect Links, Attribution and Records",
  "description": "A practical webmaster checklist for moving a site or changing domains without losing track of affiliate destinations, campaign labels, reporting continuity, and program permissions.",
  "excerpt": "A domain move can affect redirects, source labels, and the evidence you use to reconcile affiliate reports. Map links and terms before migration, test the new path, and preserve a dated record of changes.",
  "publishedAt": "2026-10-14",
  "updatedAt": "2026-10-14",
  "keyTakeaways": [
    "Inventory affiliate links, redirects, sub-IDs, and permitted traffic sources before changing a site or domain.",
    "Confirm program rules for domain changes, redirects, and tracking methods rather than assuming existing approval carries over.",
    "Test the full visitor path and attribution labels after migration using methods allowed by the program.",
    "Preserve dated link maps, screenshots, and reports so pre- and post-migration performance can be reviewed consistently."
  ],
  "sections": [
    {
      "heading": "Build a migration inventory before editing links",
      "paragraphs": [
        "A site migration can involve a new domain, a changed URL structure, a platform rebuild, or a move between hosting environments. Before making changes, create an inventory of pages that contain affiliate links and record the destination, the visible link text, any redirect, and the campaign or sub-ID convention in use. Include links embedded in navigation, comparison tables, older articles, email templates, and other assets you control. A list of only your most visited pages can miss links that remain live elsewhere.",
        "Record the source page and the intended destination for each link, but do not store private user information in the inventory. If you have multiple programs, keep them clearly separated so that an edit for one program does not accidentally alter another’s tracking parameters. Identify who owns the domain, redirect rules, and analytics access, especially if developers or contractors will assist with the change."
      ],
      "table": {
        "caption": "Migration inventory fields",
        "headers": [
          "Field",
          "What to record",
          "Migration use"
        ],
        "rows": [
          [
            "Source URL",
            "Current page that contains the link",
            "Finds links that need review or replacement."
          ],
          [
            "Destination",
            "Intended program landing page or redirect target",
            "Checks that visitors still reach the expected destination."
          ],
          [
            "Tracking label",
            "Sub-ID, campaign code, or other allowed identifier",
            "Helps compare reporting before and after the move."
          ],
          [
            "Permission status",
            "Relevant program approval or traffic rule",
            "Flags changes that may require confirmation before launch."
          ],
          [
            "Test result",
            "Date and outcome of an allowed test",
            "Creates a dated record of validation."
          ]
        ]
      }
    },
    {
      "heading": "Check program permission for the new setup",
      "paragraphs": []
    },
    {
      "heading": "Preserve attribution labels and redirect behavior",
      "paragraphs": [
        "A migration can unintentionally drop query parameters, replace a link with a generic destination, or create a redirect that strips campaign information. Compare the old and new URL handling step by step. Check that labels remain readable in your own records and that they do not contain personal data or sensitive information. If the program defines an allowed format, follow it. Avoid adding undocumented parameters or changing tracking behavior just to make reports appear more detailed.",
        "Test the visitor path from the actual migrated page through each redirect to the final destination, using only testing methods permitted by the program. Confirm the visible link is accurate, the destination is appropriate to the page’s description, and the tracking label is handled as expected. A browser reaching a destination does not prove that a conversion will be attributed; it only verifies part of the path. Do not generate artificial transactions or ask others to do so unless the program explicitly provides an authorized testing procedure."
      ],
      "bullets": [
        "Check links on desktop and mobile layouts after migration.",
        "Verify that redirects preserve only the parameters the program permits.",
        "Confirm that old URLs redirect to the intended new page without creating a loop or dead end."
      ]
    },
    {
      "heading": "Keep reporting comparable across the cutover",
      "paragraphs": []
    },
    {
      "heading": "Plan rollback and ownership before launch",
      "paragraphs": [
        "Define who can restore the previous link map or redirect configuration if the new setup fails. Keep a dated copy of the working configuration and ensure that more than one responsible person can access the files needed to make a correction. Where a domain or content management system is controlled by a vendor, clarify who can make urgent changes and how access will be handed back. This is operational continuity, not a substitute for complying with program terms.",
        "After the migration, update internal documentation and remove obsolete links only after checking whether they remain in archived pages or campaign materials you control. Keep a short incident log for any broken destination, missing parameter, or reporting discrepancy, including the time found and the correction made. A disciplined record makes later reconciliation easier and helps a future site owner understand which links were approved, tested, or retired."
      ],
      "bullets": [
        "Name an owner for link inventory, redirects, and report review.",
        "Keep a rollback copy of the relevant link map or configuration.",
        "Document cutover timing, exceptions, and follow-up checks."
      ]
    }
  ],
  "faqs": [
    {
      "question": "Will affiliate attribution automatically continue after a domain migration?",
      "answer": "Do not assume that it will. Domain changes, redirects, and tracking rules can interact in different ways. Check program terms, preserve the existing labels where permitted, and validate the visitor path using an authorized method."
    },
    {
      "question": "Should I change all sub-IDs during a migration?",
      "answer": "Only if there is a clear operational reason and the program permits the format. If labels change, preserve a dated mapping between old and new values so reports can still be interpreted."
    },
    {
      "question": "Can a successful redirect test prove that a conversion will be credited?",
      "answer": "No. It can show that a browser reaches the expected destination and may help check parameter handling, but it cannot by itself establish how later conversions are attributed or reported."
    }
  ]
};
