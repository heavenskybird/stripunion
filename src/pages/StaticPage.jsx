import React from 'react';
import { useLocation } from 'react-router-dom';

const copy = {
  '/about': ['About StripUnion', 'StripUnion is an independent editorial site that helps adults discover and compare adult entertainment platforms.'],
  '/editorial-policy': ['Editorial Policy', 'We separate editorial coverage from commercial affiliate links and do not publish fabricated ratings, testimonials, traffic figures or testing claims.'],
  '/affiliate-disclosure': ['Affiliate Disclosure', 'StripUnion may receive compensation when readers follow certain commercial links and complete qualifying actions. Affiliate relationships do not change the basic purpose of our editorial coverage.'],
  '/privacy-policy': ['Privacy Policy', 'This page will document the data practices of the production site before launch.'],
  '/terms': ['Terms of Use', 'StripUnion is intended only for adults aged 18 or older. Users are responsible for following the laws that apply where they live.'],
  '/contact': ['Contact', 'A production contact method will be added before launch. No fabricated address, phone number or email is displayed.'],
  '/age-verification': ['18+ Notice', 'StripUnion is intended for adults 18+ only.'],
  '/disclaimer': ['Disclaimer', 'StripUnion provides editorial information and links to third-party services. Third-party services are responsible for their own products, terms and policies.']
};

export default function StaticPage() {
  const { pathname } = useLocation();
  const [heading, body] = copy[pathname] || ['StripUnion', 'Editorial page'];
  return (
    <section className="section shell article">
      <h1>{heading}</h1>
      <p className="lede">{body}</p>
    </section>
  );
}