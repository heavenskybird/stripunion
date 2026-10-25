export default {
  "slug": "affiliate-program-customer-eligibility-commission-audit",
  "categorySlug": "webmaster-affiliate",
  "categoryLabel": "Webmaster / Affiliate",
  "title": "Affiliate Programs: Check Which Customer Conversions Qualify for Credit",
  "description": "Review affiliate program rules for new, returning, and reactivated customers so your offer comparisons reflect the conversions the program actually credits.",
  "excerpt": "A conversion may be tracked without being commissionable. Before choosing an affiliate program, identify how its terms define eligible customers, repeat purchases, reactivations, and excluded transactions.",
  "publishedAt": "2026-10-25",
  "updatedAt": "2026-10-25",
  "keyTakeaways": [
    "Separate tracked conversions from conversions that qualify for commission; a reporting event does not by itself establish eligibility.",
    "Look for explicit definitions of new, existing, returning, and reactivated customers.",
    "Check how account history, prior purchases, cancellations, and repeat orders affect credit.",
    "Record the applicable terms and ask the program for written clarification when a rule is ambiguous.",
    "Compare programs using the same customer scenarios rather than assuming their eligibility rules match."
  ],
  "sections": [
    {
      "heading": "Why customer eligibility deserves its own review",
      "paragraphs": [
        "Affiliate program comparisons often focus on attribution windows, payout logic, and reporting. Those details matter, but they do not answer a more basic question: which customer actions count as eligible conversions? A tracking system may record a signup or order while the program terms exclude it from commission. Treat eligibility as a separate part of the commercial model, not as an automatic consequence of a tracked event.",
        "This distinction matters when an offer is aimed at people who have used a service before, are returning after a break, or already have an account. A program may define a qualifying customer by purchase history, account status, product category, or another condition. If the rule is unclear, projected results based only on click and conversion reporting can misrepresent the value of the offer."
      ],
      "bullets": [
        "Use the program agreement and current campaign terms as primary evidence.",
        "Keep eligibility questions separate from tracking and payment questions.",
        "Do not infer commission eligibility from a conversion appearing in a dashboard."
      ]
    },
    {
      "heading": "Build a customer-status map",
      "paragraphs": [
        "Before comparing offers, list the customer situations your audience is likely to encounter. A first-time visitor may have no account history. Another person may already have an account but no completed purchase. A former customer may return after cancelling, while an existing customer may make an additional purchase. These are distinct cases, even if a landing page presents them as one broad audience.",
        "For each case, look for a matching definition in the program terms. Note whether the wording refers to a new customer, a new account, a first purchase, a first qualifying purchase, a dormant customer, or a returning customer. Similar phrases can have different meanings. If the agreement does not define a term, mark it as unresolved rather than substituting your own interpretation."
      ],
      "table": {
        "caption": "Use these scenarios to compare program eligibility language.",
        "headers": [
          "Scenario",
          "What to verify",
          "Evidence to retain"
        ],
        "rows": [
          [
            "First account and first purchase",
            "Whether both a new account and a qualifying transaction are required",
            "Relevant eligibility clause and event definition"
          ],
          [
            "Existing account, no prior purchase",
            "Whether an account created earlier is excluded even without a purchase",
            "Written clarification and applicable campaign terms"
          ],
          [
            "Former customer returns",
            "Whether a waiting period or reactivation definition applies",
            "Exact rule for lapse, return, and qualifying event"
          ],
          [
            "Current customer makes another purchase",
            "Whether repeat orders or different product categories qualify",
            "Terms covering repeat transactions and product scope"
          ]
        ]
      }
    },
    {
      "heading": "Check account history, repeat orders, and reactivation rules",
      "paragraphs": [
        "Read customer-status language alongside exclusions for repeat transactions, account history, and previously used services. A rule may distinguish a new customer from a new transaction, or it may credit only an initial qualifying event. Check whether the same customer can generate credit more than once, whether separate products are treated independently, and whether an earlier account registration changes the outcome.",
        "Reactivation language deserves particular attention. Ask what event starts any waiting period, how the program identifies a returning customer, and whether cancellation alone makes someone eligible again. Do not assume that a customer becomes “new” after a pause or account closure. If there is no clear answer in the terms, record the uncertainty as a program risk instead of planning around a favorable interpretation."
      ],
      "bullets": [
        "Search terms for phrases such as new customer, existing customer, repeat order, returning customer, reactivation, and prior purchase.",
        "Check whether eligibility is defined per person, account, product, order, or campaign.",
        "Look for restrictions on self-referrals, duplicate accounts, or transactions linked to prior activity."
      ]
    },
    {
      "heading": "Connect eligibility rules to reporting",
      "paragraphs": [
        "Determine whether reports distinguish a tracked conversion from an approved or payable conversion. Find out which fields indicate status, whether rejected events have a reason code, and whether the reporting view can show changes over time. A dashboard with a conversion count alone may not provide enough information to diagnose why some transactions fail to qualify.",
        "Also check how long a conversion remains pending and where eligibility decisions are documented. Do not treat a pending status as final credit or assume that an unlabelled status means rejection. If the program provides transaction-level identifiers, define a privacy-conscious internal process for matching them to your records without collecting unnecessary visitor information."
      ]
    },
    {
      "heading": "Ask precise questions and keep a decision record",
      "paragraphs": [
        "When contract language leaves a practical question open, send the program a short scenario rather than asking whether “returning customers count.” For example, ask whether an account created before the referral, with no prior qualifying purchase, is eligible under the specific campaign. Then ask whether the answer is based on the current agreement or a campaign-specific exception.",
        "Save the response with the date, program or campaign name, and the terms version you reviewed. Written guidance can make later review more consistent, but it is not a substitute for checking subsequent contract changes. Set a reminder to revisit eligibility when a campaign is renewed, its destination changes, or the program updates its terms."
      ],
      "bullets": [
        "Record the source, date, and exact wording of each eligibility rule.",
        "Label unanswered cases as unknown in your comparison sheet.",
        "Recheck terms before materially changing audience targeting or traffic volume."
      ]
    }
  ],
  "faqs": [
    {
      "question": "Does a conversion in an affiliate dashboard mean it qualifies for commission?",
      "answer": "Not necessarily. A dashboard may report a tracked event before eligibility review, or it may use statuses with different meanings. Check the program’s definitions for tracked, approved, rejected, pending, and payable events."
    },
    {
      "question": "Should I assume a returning customer is treated as a new customer after cancelling?",
      "answer": "No. The program may use purchase history, account history, or a defined inactivity period. Find the rule in the current terms or ask about a specific customer scenario before relying on an assumption."
    },
    {
      "question": "What should I do when customer eligibility is not defined?",
      "answer": "Mark the case as unresolved, request a written explanation from the program, and avoid basing a forecast on the most favorable interpretation. Revisit the answer if the campaign or agreement changes."
    }
  ]
};
